import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadWorkbookImportModule() {
  const ts = require('typescript');
  const source = read('lib/workbook-import.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(compiled, {
    Buffer,
    exports: module.exports,
    module,
    require: (id) => {
      if (id === '@/lib/database.types') return {};
      return require(id);
    }
  });

  return module.exports;
}

test('parser emits v2 evidence and rejects reordered legacy headers', () => {
  const parser = read('lib/workbook-import.ts');

  assert.match(parser, /templateRequiredColumns/);
  assert.match(parser, /sourceRowHash/);
  assert.match(parser, /sourceFingerprint/);
  assert.match(parser, /matchCandidate/);
  assert.match(parser, /periodLabel/);
  assert.match(parser, /optionalPeriodColumns/);
  assert.match(parser, /assertLegacyHeaderOrder/);
  assert.match(parser, /WorkbookImportError/);
});

test('parser treats explicit quarterly periods as annual quarter-specific records', () => {
  const {
    inferRecurrence,
    normalizePeriodLabel,
    periodLabelFromItemName,
    resolvePeriodLabel,
    sourceFingerprint
  } = loadWorkbookImportModule();

  assert.equal(normalizePeriodLabel('Q1'), 'Q1');
  assert.equal(normalizePeriodLabel('Quarter 3'), 'Q3');
  assert.equal(periodLabelFromItemName('Newsletter - Q2'), 'Q2');
  assert.equal(periodLabelFromItemName('Newsletter Quarter 4'), 'Q4');

  assert.deepEqual(plain(inferRecurrence('Quarterly', 'Q1')), { unit: 'years', interval: 1 });
  assert.deepEqual(plain(inferRecurrence('Quarterly', null)), { unit: 'months', interval: 3 });
  assert.deepEqual(plain(inferRecurrence('Annual', 'Q1')), { unit: 'years', interval: 1 });

  const warnings = [];
  assert.equal(resolvePeriodLabel('Q1', 'Newsletter Q2', 12, warnings), 'Q1');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].issue, /conflicts/);

  const baseCandidate = {
    itemName: 'newsletter',
    vesselOrScope: 'office',
    ownerCode: 'es',
    itemNumber: null,
    agencyType: 'internal',
    periodLabel: null
  };
  const baseFingerprint = sourceFingerprint(baseCandidate);
  const q1Fingerprint = sourceFingerprint({ ...baseCandidate, periodLabel: 'Q1' });
  const q2Fingerprint = sourceFingerprint({ ...baseCandidate, periodLabel: 'Q2' });

  assert.equal(sourceFingerprint({ ...baseCandidate, periodLabel: null }), baseFingerprint);
  assert.notEqual(q1Fingerprint, baseFingerprint);
  assert.notEqual(q1Fingerprint, q2Fingerprint);
});

test('phase 1 migration keeps legacy RPC and adds dry-run/apply surfaces', () => {
  const legacy = read('supabase/migrations/20260510150035_import_workbook_records.sql');
  const migration = read('supabase/migrations/20260513000100_import_data_model_v2_phase1.sql');
  const periodMigration = read('supabase/migrations/20260703000100_quarter_period_labels.sql');

  assert.match(legacy, /create or replace function public\.import_compliance_workbook_records/);
  assert.doesNotMatch(migration, /drop function .*import_compliance_workbook_records/i);
  assert.match(migration, /create table if not exists public\.compliance_item_import_sources/);
  assert.match(migration, /create table if not exists public\.compliance_import_run_rows/);
  assert.match(migration, /create table if not exists public\.compliance_import_issues/);
  assert.match(migration, /create or replace function public\.dry_run_compliance_workbook_import/);
  assert.match(migration, /create or replace function public\.apply_compliance_workbook_import/);
  assert.match(migration, /source_fingerprint/);
  assert.match(migration, /last_non_import_activity_at/);
  assert.match(periodMigration, /period_label/);
  assert.match(periodMigration, /source_period_label/);
  assert.match(periodMigration, /normalized_period_label/);
  assert.match(periodMigration, /source\.normalized_period_label is not distinct from normalized_period_label/);
  assert.match(periodMigration, /item\.period_label is not distinct from normalized_period_label/);
  assert.match(periodMigration, /item_record\.period_label/);
});

test('server action dry-runs before apply and no longer upserts item dependencies during upload', () => {
  const action = read('app/actions/imports.ts');

  assert.match(action, /dry_run_compliance_workbook_import/);
  assert.match(action, /apply_compliance_workbook_import/);
  assert.match(action, /periodLabel: record\.periodLabel/);
  assert.match(action, /ownerCodes: record\.ownerCodes/);
  assert.doesNotMatch(action, /from\('vessels'\)\.upsert/);
  assert.doesNotMatch(action, /from\('company_owner_codes'\)\.upsert/);
  assert.doesNotMatch(action, /import_compliance_workbook_records/);
});

test('multi-owner import migration parses compound codes and synchronizes item owners', () => {
  const migration = read('supabase/migrations/20260717000100_import_compound_owner_codes.sql');

  assert.match(migration, /create or replace function public\.parse_compound_owner_codes/);
  assert.match(migration, /-->|→|\//);
  assert.match(migration, /insert into public\.company_owner_codes/);
  assert.match(migration, /sync_compliance_item_owner_codes/);
  assert.match(migration, /new\.owner_current is not distinct from new\.owner_raw/);
});

test('multi-owner apply migration preserves raw compound owners through the reviewed import path', () => {
  const parser = read('lib/workbook-import.ts');
  const migration = read('supabase/migrations/20260717000200_import_multi_owner_apply_path.sql');

  assert.match(parser, /import-v3-reference-lists-v4-multi-owner-/);
  assert.match(migration, /apply_import_v3_reference_review/);
  assert.match(migration, /parsed_record->>'ownerRaw'/);
  assert.match(migration, /source_owner_code = coalesce/);
});
