alter table public.workspace_tasks
  add column if not exists compliance_item_id uuid null references public.compliance_items(id) on delete set null,
  add column if not exists reminder_at timestamptz null,
  add column if not exists reminder_dismissed_at timestamptz null;

create index if not exists workspace_tasks_compliance_item_idx
  on public.workspace_tasks(compliance_item_id, company_id)
  where compliance_item_id is not null and archived_at is null;

create index if not exists workspace_tasks_due_reminder_idx
  on public.workspace_tasks(company_id, assigned_to, reminder_at)
  where reminder_at is not null
    and reminder_dismissed_at is null
    and archived_at is null
    and status = 'open';

create or replace function public.enforce_workspace_task_relationships()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.compliance_item_id is not null and not exists (
    select 1
    from public.compliance_items item
    where item.id = new.compliance_item_id
      and item.company_id = new.company_id
  ) then
    raise exception 'Linked compliance record must belong to the task workspace';
  end if;

  if tg_op = 'INSERT' then
    new.reminder_dismissed_at := null;
  elsif new.reminder_at is distinct from old.reminder_at then
    new.reminder_dismissed_at := null;
  end if;

  if new.status = 'completed' or new.archived_at is not null then
    new.reminder_at := null;
    new.reminder_dismissed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_workspace_task_relationships on public.workspace_tasks;
create trigger enforce_workspace_task_relationships
before insert or update on public.workspace_tasks
for each row execute function public.enforce_workspace_task_relationships();

revoke execute on function public.enforce_workspace_task_relationships() from public, anon, authenticated;

comment on column public.workspace_tasks.compliance_item_id is
  'Optional compliance record supported by this task. Task completion never changes compliance status.';
comment on column public.workspace_tasks.reminder_at is
  'Optional in-app reminder instant for the task assignee.';
comment on column public.workspace_tasks.reminder_dismissed_at is
  'When set, suppresses the current in-app reminder without completing the task.';
