drop index if exists public.workspace_tasks_compliance_item_idx;

create index workspace_tasks_compliance_item_idx
  on public.workspace_tasks(compliance_item_id, company_id)
  where compliance_item_id is not null and archived_at is null;
