import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

test('parser emits v2 evidence and rejects reordered legacy headers', () => {
  const parser = read('lib/workbook-import.ts');

  assert.match(parser, /templateRequiredColumns/);
  assert.match(parser, /sourceRowHash/);
  assert.match(parser, /sourceFingerprint/);
  assert.match(parser, /matchCandidate/);
  assert.match(parser, /assertLegacyHeaderOrder/);
  assert.match(parser, /WorkbookImportError/);
});

test('phase 1 migration keeps legacy RPC and adds dry-run/apply surfaces', () => {
  const legacy = read('supabase/migrations/202605100200_import_workbook_records.sql');
  const migration = read('supabase/migrations/202605130001_import_data_model_v2_phase1.sql');

  assert.match(legacy, /create or replace function public\.import_compliance_workbook_records/);
  assert.doesNotMatch(migration, /drop function .*import_compliance_workbook_records/i);
  assert.match(migration, /create table if not exists public\.compliance_item_import_sources/);
  assert.match(migration, /create table if not exists public\.compliance_import_run_rows/);
  assert.match(migration, /create table if not exists public\.compliance_import_issues/);
  assert.match(migration, /create or replace function public\.dry_run_compliance_workbook_import/);
  assert.match(migration, /create or replace function public\.apply_compliance_workbook_import/);
  assert.match(migration, /source_fingerprint/);
  assert.match(migration, /last_non_import_activity_at/);
});

test('server action dry-runs before apply and no longer upserts item dependencies during upload', () => {
  const action = read('app/actions/imports.ts');

  assert.match(action, /dry_run_compliance_workbook_import/);
  assert.match(action, /apply_compliance_workbook_import/);
  assert.doesNotMatch(action, /from\('vessels'\)\.upsert/);
  assert.doesNotMatch(action, /from\('company_owner_codes'\)\.upsert/);
  assert.doesNotMatch(action, /import_compliance_workbook_records/);
});
