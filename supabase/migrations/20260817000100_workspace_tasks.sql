create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  details text null check (details is null or length(details) <= 5000),
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'completed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date null,
  completed_at timestamptz null,
  completed_by uuid null references public.profiles(id) on delete set null,
  archived_at timestamptz null,
  archived_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_tasks_completion_consistent check (
    (status = 'open' and completed_at is null and completed_by is null)
    or (status = 'completed' and completed_at is not null and completed_by is not null)
  )
);

create index if not exists workspace_tasks_company_assignee_idx
  on public.workspace_tasks(company_id, assigned_to, archived_at, status);

create index if not exists workspace_tasks_company_due_idx
  on public.workspace_tasks(company_id, due_date)
  where archived_at is null and status = 'open';

create or replace function public.set_workspace_task_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := trim(new.title);
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status = 'completed' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
    new.archived_at := null;
    new.archived_by := null;
  else
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    if new.status is distinct from old.status then
      if new.status = 'completed' then
        new.completed_at := now();
        new.completed_by := auth.uid();
      else
        new.completed_at := null;
        new.completed_by := null;
      end if;
    else
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;

    if (new.archived_at is null) is distinct from (old.archived_at is null) then
      if new.archived_at is null then
        new.archived_by := null;
      else
        new.archived_at := now();
        new.archived_by := auth.uid();
      end if;
    else
      new.archived_at := old.archived_at;
      new.archived_by := old.archived_by;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_workspace_task_updated_at on public.workspace_tasks;
create trigger set_workspace_task_updated_at
before insert or update on public.workspace_tasks
for each row execute function public.set_workspace_task_updated_at();

alter table public.workspace_tasks enable row level security;

drop policy if exists "Task assignees and workspace owners can view tasks" on public.workspace_tasks;
create policy "Task assignees and workspace owners can view tasks"
  on public.workspace_tasks
  for select
  to authenticated
  using (
    public.is_app_admin()
    or assigned_to = auth.uid()
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  );

drop policy if exists "Members can create permitted tasks" on public.workspace_tasks;
create policy "Members can create permitted tasks"
  on public.workspace_tasks
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_app_admin()
      or (
        public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
        and exists (
          select 1
          from public.company_memberships assignee_membership
          where assignee_membership.company_id = workspace_tasks.company_id
            and assignee_membership.user_id = workspace_tasks.assigned_to
        )
      )
      or (
        assigned_to = auth.uid()
        and public.has_company_role(company_id, array['office_user', 'vessel_user']::public.app_role[])
      )
    )
  );

drop policy if exists "Task assignees and workspace owners can update tasks" on public.workspace_tasks;
create policy "Task assignees and workspace owners can update tasks"
  on public.workspace_tasks
  for update
  to authenticated
  using (
    public.is_app_admin()
    or assigned_to = auth.uid()
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  )
  with check (
    public.is_app_admin()
    or (
      public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
      and exists (
        select 1
        from public.company_memberships assignee_membership
        where assignee_membership.company_id = workspace_tasks.company_id
          and assignee_membership.user_id = workspace_tasks.assigned_to
      )
    )
    or (
      assigned_to = auth.uid()
      and public.has_company_role(company_id, array['office_user', 'vessel_user']::public.app_role[])
    )
  );

revoke all on table public.workspace_tasks from public, anon;
grant select, insert, update on table public.workspace_tasks to authenticated;

revoke execute on function public.set_workspace_task_updated_at() from public, anon, authenticated;

comment on table public.workspace_tasks is
  'Customer-created workspace tasks. Assignees see their own tasks; workspace owners can manage all company tasks.';
