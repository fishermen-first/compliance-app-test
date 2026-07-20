import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20260720000100_import_natural_matches_one_to_one.sql', import.meta.url),
  'utf8'
);
const sourceRowMigration = await readFile(
  new URL('../supabase/migrations/20260720000200_import_source_row_identity.sql', import.meta.url),
  'utf8'
);

test('natural-key collisions keep one exact dated update and create the other workbook rows', () => {
  assert.match(migration, /create or replace function public\._import_v3_enforce_unique_natural_matches/);
  assert.match(
    migration,
    /item\.start_working_on is not distinct from run_row\.source_start_working_on[\s\S]*item\.expiration_date is not distinct from run_row\.source_expiration_date/
  );
  assert.match(migration, /collision\.exact_date_match_count = 1/);
  assert.match(migration, /set matched_item_id = null,[\s\S]*match_strategy = 'new_item',[\s\S]*proposed_action = 'create_item'/);
});

test('ambiguous natural-key collisions stay blocked', () => {
  assert.match(migration, /'multiple_source_rows_match_item'/);
  assert.match(migration, /collision\.exact_date_match_count <> 1/);
  assert.match(migration, /set proposed_action = 'issue',[\s\S]*is_safe_to_apply = false/);
});

test('deduplication runs during both dry-run review and apply', () => {
  const calls = migration.match(/perform public\._import_v3_enforce_unique_natural_matches\(/g) ?? [];
  assert.equal(calls.length, 2);
  assert.match(migration, /perform public\.apply_import_v3_reference_review\(new\.id\);[\s\S]*perform public\._import_v3_enforce_unique_natural_matches\(new\.id\);/);
  assert.match(migration, /perform public\.apply_import_v3_reference_review\(target_import_run_id\);[\s\S]*perform public\._import_v3_enforce_unique_natural_matches\(target_import_run_id\);/);
});

test('re-imports prefer company, sheet, and source-row identity', () => {
  assert.match(sourceRowMigration, /create or replace function public\._import_v3_apply_source_row_matches/);
  assert.match(sourceRowMigration, /source\.company_id = run_row\.company_id/);
  assert.match(sourceRowMigration, /source\.source_sheet = run_record\.sheet_name/);
  assert.match(sourceRowMigration, /source\.source_row_number = run_row\.source_row_number/);
  assert.match(sourceRowMigration, /match_strategy = 'source_row_number'/);
  assert.match(sourceRowMigration, /decision = 'matched_by_source_row'/);
});

test('source-row identity runs before natural-key collision handling', () => {
  const dryRunOrder = /apply_import_v3_reference_review\(new\.id\);[\s\S]*_import_v3_apply_source_row_matches\(new\.id\);[\s\S]*_import_v3_enforce_unique_natural_matches\(new\.id\);/;
  const applyOrder = /apply_import_v3_reference_review\(target_import_run_id\);[\s\S]*_import_v3_apply_source_row_matches\(target_import_run_id\);[\s\S]*_import_v3_enforce_unique_natural_matches\(target_import_run_id\);/;
  assert.match(sourceRowMigration, dryRunOrder);
  assert.match(sourceRowMigration, applyOrder);
});
