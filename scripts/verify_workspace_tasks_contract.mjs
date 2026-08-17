import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260817000100_workspace_tasks.sql', 'utf8');
const actions = readFileSync('app/actions/tasks.ts', 'utf8');
const page = readFileSync('app/tasks/page.tsx', 'utf8');
const sidebar = readFileSync('components/app-sidebar.tsx', 'utf8');
const types = readFileSync('lib/database.types.ts', 'utf8');

test('task storage is tenant scoped and uses soft archive', () => {
  assert.match(migration, /company_id uuid not null references public\.companies/);
  assert.match(migration, /assigned_to uuid not null references public\.profiles/);
  assert.match(migration, /archived_at timestamptz null/);
  assert.doesNotMatch(migration, /for delete/i);
  assert.doesNotMatch(actions, /\.delete\(/);
});

test('RLS limits regular users to assigned tasks and lets owners manage the workspace', () => {
  assert.match(migration, /alter table public\.workspace_tasks enable row level security/);
  assert.match(migration, /assigned_to = auth\.uid\(\)/);
  assert.match(migration, /array\['owner', 'office_admin'\]::public\.app_role\[\]/);
  assert.match(migration, /assignee_membership\.company_id = workspace_tasks\.company_id/);
  assert.match(migration, /assignee_membership\.user_id = workspace_tasks\.assigned_to/);
  assert.match(migration, /revoke all on table public\.workspace_tasks from public, anon/);
  assert.match(migration, /grant select, insert, update on table public\.workspace_tasks to authenticated/);
});

test('audit ownership is normalized in the database trigger', () => {
  assert.match(migration, /before insert or update on public\.workspace_tasks/);
  assert.match(migration, /new\.created_by := auth\.uid\(\)/);
  assert.match(migration, /new\.company_id := old\.company_id/);
  assert.match(migration, /new\.completed_by := auth\.uid\(\)/);
  assert.match(migration, /new\.archived_by := auth\.uid\(\)/);
});

test('task actions validate assignees within the actor company', () => {
  assert.match(actions, /\.eq\('company_id', actor\.membership\.company_id\)/);
  assert.match(actions, /\.eq\('user_id', assignee\)/);
  assert.match(actions, /if \(!actor\.canManageAll\) return actor\.userId/);
  assert.match(actions, /title\.length > 240/);
  assert.match(actions, /details\.length > 5000/);
});

test('task UI provides required MVP views and controls', () => {
  assert.match(sidebar, /label: 'Tasks'.*href: '\/tasks'/);
  assert.match(page, /'My tasks'/);
  assert.match(page, /Everyone<\/Link>/);
  assert.match(page, />Completed</);
  assert.match(page, />Archived</);
  assert.match(page, /action=\{createWorkspaceTask\}/);
  assert.match(page, /action=\{updateWorkspaceTask\}/);
  assert.match(page, /action=\{setWorkspaceTaskCompletion\}/);
  assert.match(page, /action=\{setWorkspaceTaskArchived\}/);
});

test('generated database types include workspace tasks', () => {
  assert.match(types, /workspace_tasks: \{/);
  assert.match(types, /foreignKeyName: "workspace_tasks_assigned_to_fkey"/);
});

test('workspace owner member labels use a scoped RPC without weakening profile RLS', () => {
  assert.match(migration, /function public\.get_workspace_task_members\(target_company_id uuid\)/);
  assert.match(migration, /Workspace owner access required/);
  assert.match(migration, /grant execute on function public\.get_workspace_task_members\(uuid\) to authenticated/);
  assert.match(page, /supabase\.rpc\('get_workspace_task_members'/);
});
