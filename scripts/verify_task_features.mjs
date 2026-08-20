import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20260818000200_task_reminders_and_compliance_links.sql', 'utf8');
const actions = await readFile('app/actions/tasks.ts', 'utf8');
const tasksPage = await readFile('app/tasks/page.tsx', 'utf8');
const itemPage = await readFile('app/items/[id]/page.tsx', 'utf8');

test('task schema supports optional compliance links and private in-app reminders', () => {
  assert.match(migration, /compliance_item_id uuid null references public\.compliance_items\(id\) on delete set null/);
  assert.match(migration, /reminder_at timestamptz null/);
  assert.match(migration, /reminder_dismissed_at timestamptz null/);
  assert.match(migration, /item\.company_id = new\.company_id/);
  assert.match(migration, /new\.status = 'completed' or new\.archived_at is not null/);
});

test('task actions validate links and expose reminder lifecycle actions', () => {
  assert.match(actions, /permittedComplianceItem/);
  assert.match(actions, /zonedLocalDateTimeToIso/);
  assert.match(actions, /dismissWorkspaceTaskReminder/);
  assert.match(actions, /snoozeWorkspaceTaskReminder/);
});

test('task and compliance pages expose both sides of the relationship', () => {
  assert.match(tasksPage, /Related compliance record/);
  assert.match(tasksPage, /No record linked/);
  assert.match(tasksPage, /Task reminders/);
  assert.match(itemPage, /compliance_item_id/);
  assert.match(itemPage, /linkedTasks/);
});
