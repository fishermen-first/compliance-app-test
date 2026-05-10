create extension if not exists citext;

create table if not exists public.app_admins (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email citext not null,
  role public.app_role not null default 'office_user',
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, email)
);

create index if not exists company_invitations_email_idx on public.company_invitations(email);

alter table public.app_admins enable row level security;
alter table public.company_invitations enable row level security;

insert into public.app_admins (email)
values ('vikram.nayani@gmail.com')
on conflict (email) do nothing;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'compliance_item_status') then
    create type public.compliance_item_status as enum ('not_started', 'in_progress', 'submitted', 'complete', 'discontinued');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'recurrence_unit') then
    create type public.recurrence_unit as enum ('years', 'months', 'manual', 'none');
  end if;
end $$;

create table if not exists public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vessel_id uuid references public.vessels(id) on delete set null,
  owner_raw text,
  owner_current text,
  item_name text not null,
  item_number text,
  agency_type text,
  compliance_area text not null default 'Other',
  frequency_label text,
  recurrence_unit public.recurrence_unit not null default 'none',
  recurrence_interval integer check (recurrence_interval is null or recurrence_interval > 0),
  start_working_on date,
  expiration_date date,
  status public.compliance_item_status not null default 'not_started',
  status_notes text,
  instructions text,
  sharepoint_url text,
  completed_at date,
  discontinued_at date,
  source_sheet text,
  source_row_number integer,
  previous_item_id uuid references public.compliance_items(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compliance_items_company_work_idx on public.compliance_items(company_id, owner_current, start_working_on, expiration_date);
create index if not exists compliance_items_company_status_idx on public.compliance_items(company_id, status);
create index if not exists compliance_items_company_vessel_idx on public.compliance_items(company_id, vessel_id);
create unique index if not exists compliance_items_source_row_idx on public.compliance_items(company_id, source_sheet, source_row_number)
  where source_sheet is not null and source_row_number is not null;

create table if not exists public.compliance_item_status_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.compliance_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  from_status public.compliance_item_status,
  to_status public.compliance_item_status not null,
  notes text,
  changed_at timestamptz not null default now()
);

create table if not exists public.compliance_item_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.compliance_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  trigger_type text not null check (trigger_type in ('on_start_date', 'days_before_expiration', 'repeat_after_start')),
  days_before integer check (days_before is null or days_before >= 0),
  repeat_every_days integer check (repeat_every_days is null or repeat_every_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists compliance_item_reminder_rules_unique_idx
  on public.compliance_item_reminder_rules(item_id, label, trigger_type);

create table if not exists public.compliance_item_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.compliance_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  recipient_name text,
  recipient_email text not null,
  recipient_type text not null default 'additional' check (recipient_type in ('owner', 'additional')),
  created_at timestamptz not null default now(),
  unique(item_id, recipient_email)
);

create table if not exists public.reminder_send_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id uuid references public.compliance_items(id) on delete cascade,
  reminder_rule_id uuid references public.compliance_item_reminder_rules(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  body text not null,
  status public.reminder_status not null default 'scheduled',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  provider_message_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  unique(reminder_rule_id, recipient_email, scheduled_for)
);

alter table public.compliance_items enable row level security;
alter table public.compliance_item_status_history enable row level security;
alter table public.compliance_item_reminder_rules enable row level security;
alter table public.compliance_item_notification_recipients enable row level security;
alter table public.reminder_send_log enable row level security;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins
    where lower(email::text) = public.current_user_email()
  );
$$;

create or replace function public.has_company_role(target_company_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin() or exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin() or exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.accept_company_invite(full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := public.current_user_email();
  invite_record record;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into invite_record
  from public.company_invitations
  where lower(email::text) = current_email
    and accepted_at is null
  order by created_at asc
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.profiles (id, full_name, email)
  values (
    current_user_id,
    coalesce(nullif(trim(full_name), ''), split_part(current_email, '@', 1)),
    current_email
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  insert into public.company_memberships (company_id, user_id, role)
  values (invite_record.company_id, current_user_id, invite_record.role)
  on conflict (company_id, user_id) do update set role = excluded.role;

  update public.company_invitations
  set accepted_at = now()
  where id = invite_record.id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    invite_record.company_id,
    current_user_id,
    'company_invitation',
    invite_record.id,
    'invite_accepted',
    jsonb_build_object('email', current_email, 'role', invite_record.role)
  );

  return invite_record.company_id;
end;
$$;

create or replace function public.create_company_workspace(
  company_name text,
  full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := public.current_user_email();
  new_company_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_app_admin() then
    raise exception 'Only FF admins can create new company workspaces';
  end if;

  if nullif(trim(company_name), '') is null then
    raise exception 'Company name is required';
  end if;

  if nullif(trim(full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  insert into public.profiles (id, full_name, email)
  values (current_user_id, trim(full_name), current_email)
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  insert into public.companies (name)
  values (trim(company_name))
  returning id into new_company_id;

  insert into public.company_memberships (company_id, user_id, role)
  values (new_company_id, current_user_id, 'owner')
  on conflict (company_id, user_id) do update set role = 'owner';

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    new_company_id,
    current_user_id,
    'company',
    new_company_id,
    'workspace_created',
    jsonb_build_object('company_name', trim(company_name))
  );

  return new_company_id;
end;
$$;

create or replace function public.save_initial_vessels(vessel_names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_company_id uuid;
  cleaned_names text[];
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select company_id
  into target_company_id
  from public.company_memberships
  where user_id = current_user_id
    and role in ('owner', 'office_admin')
  order by created_at asc
  limit 1;

  if target_company_id is null then
    raise exception 'No company workspace found';
  end if;

  select array_agg(distinct trimmed_name)
  into cleaned_names
  from (
    select trim(name_value) as trimmed_name
    from unnest(vessel_names) as name_value
    where nullif(trim(name_value), '') is not null
  ) names;

  if cleaned_names is null or array_length(cleaned_names, 1) is null then
    raise exception 'At least one vessel is required';
  end if;

  insert into public.vessels (company_id, name)
  select target_company_id, unnest(cleaned_names)
  on conflict (company_id, name) do update set
    active = true,
    updated_at = now();

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'vessel',
    target_company_id,
    'initial_vessels_saved',
    jsonb_build_object('vessel_names', cleaned_names)
  );
end;
$$;


create or replace function public.create_compliance_item(
  target_company_id uuid,
  target_vessel_id uuid default null,
  item_owner_raw text default null,
  item_owner_current text default null,
  item_name text default null,
  item_number text default null,
  item_agency_type text default null,
  item_compliance_area text default 'Other',
  item_frequency_label text default null,
  item_recurrence_unit public.recurrence_unit default 'none',
  item_recurrence_interval integer default null,
  item_start_working_on date default null,
  item_expiration_date date default null,
  item_status_notes text default null,
  item_instructions text default null,
  item_sharepoint_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_item_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_company_role(target_company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]) then
    raise exception 'You do not have permission to create compliance items';
  end if;

  if nullif(trim(coalesce(item_name, '')), '') is null then
    raise exception 'Item name is required';
  end if;

  if target_vessel_id is not null and not exists (
    select 1 from public.vessels where id = target_vessel_id and company_id = target_company_id
  ) then
    raise exception 'Vessel not found for this company';
  end if;

  insert into public.compliance_items (
    company_id,
    vessel_id,
    owner_raw,
    owner_current,
    item_name,
    item_number,
    agency_type,
    compliance_area,
    frequency_label,
    recurrence_unit,
    recurrence_interval,
    start_working_on,
    expiration_date,
    status_notes,
    instructions,
    sharepoint_url,
    created_by
  ) values (
    target_company_id,
    target_vessel_id,
    nullif(trim(coalesce(item_owner_raw, '')), ''),
    nullif(trim(coalesce(item_owner_current, '')), ''),
    trim(item_name),
    nullif(trim(coalesce(item_number, '')), ''),
    nullif(trim(coalesce(item_agency_type, '')), ''),
    coalesce(nullif(trim(coalesce(item_compliance_area, '')), ''), 'Other'),
    nullif(trim(coalesce(item_frequency_label, '')), ''),
    item_recurrence_unit,
    item_recurrence_interval,
    item_start_working_on,
    item_expiration_date,
    nullif(trim(coalesce(item_status_notes, '')), ''),
    nullif(trim(coalesce(item_instructions, '')), ''),
    nullif(trim(coalesce(item_sharepoint_url, '')), ''),
    current_user_id
  ) returning id into new_item_id;

  perform public.create_default_reminder_rules(new_item_id);

  return new_item_id;
end;
$$;

create or replace function public.update_compliance_item_status(
  target_item_id uuid,
  next_status public.compliance_item_status,
  next_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item_record record;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into item_record
  from public.compliance_items
  where id = target_item_id;

  if not found then
    raise exception 'Compliance item not found';
  end if;

  if not public.has_company_role(item_record.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]) then
    raise exception 'You do not have permission to update this item';
  end if;

  insert into public.compliance_item_status_history (item_id, company_id, changed_by, from_status, to_status, notes)
  values (item_record.id, item_record.company_id, current_user_id, item_record.status, next_status, nullif(trim(coalesce(next_notes, '')), ''));

  update public.compliance_items
  set status = next_status,
      status_notes = coalesce(nullif(trim(coalesce(next_notes, '')), ''), status_notes),
      completed_at = case when next_status = 'complete' then coalesce(completed_at, current_date) else completed_at end,
      discontinued_at = case when next_status = 'discontinued' then coalesce(discontinued_at, current_date) else discontinued_at end,
      updated_at = now()
  where id = item_record.id;
end;
$$;

create or replace function public.complete_compliance_item(
  target_item_id uuid,
  completion_date date,
  final_notes text default null,
  should_create_next boolean default true,
  next_start_working_on date default null,
  next_expiration_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item_record record;
  new_item_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into item_record
  from public.compliance_items
  where id = target_item_id;

  if not found then
    raise exception 'Compliance item not found';
  end if;

  if not public.has_company_role(item_record.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]) then
    raise exception 'You do not have permission to complete this item';
  end if;

  insert into public.compliance_item_status_history (item_id, company_id, changed_by, from_status, to_status, notes)
  values (item_record.id, item_record.company_id, current_user_id, item_record.status, 'complete', nullif(trim(coalesce(final_notes, '')), ''));

  update public.compliance_items
  set status = 'complete',
      completed_at = coalesce(completion_date, current_date),
      status_notes = coalesce(nullif(trim(coalesce(final_notes, '')), ''), status_notes),
      updated_at = now()
  where id = item_record.id;

  if should_create_next and item_record.recurrence_unit in ('years', 'months') and next_expiration_date is not null then
    insert into public.compliance_items (
      company_id,
      vessel_id,
      owner_raw,
      owner_current,
      item_name,
      item_number,
      agency_type,
      compliance_area,
      frequency_label,
      recurrence_unit,
      recurrence_interval,
      start_working_on,
      expiration_date,
      status,
      instructions,
      sharepoint_url,
      previous_item_id,
      created_by
    ) values (
      item_record.company_id,
      item_record.vessel_id,
      item_record.owner_raw,
      item_record.owner_current,
      item_record.item_name,
      item_record.item_number,
      item_record.agency_type,
      item_record.compliance_area,
      item_record.frequency_label,
      item_record.recurrence_unit,
      item_record.recurrence_interval,
      next_start_working_on,
      next_expiration_date,
      'not_started',
      item_record.instructions,
      item_record.sharepoint_url,
      item_record.id,
      current_user_id
    ) returning id into new_item_id;

    insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, active)
    select new_item_id, item_record.company_id, label, trigger_type, days_before, repeat_every_days, active
    from public.compliance_item_reminder_rules
    where item_id = item_record.id;

    insert into public.compliance_item_notification_recipients (item_id, company_id, recipient_name, recipient_email, recipient_type)
    select new_item_id, item_record.company_id, recipient_name, recipient_email, recipient_type
    from public.compliance_item_notification_recipients
    where item_id = item_record.id
    on conflict (item_id, recipient_email) do nothing;
  end if;

  return new_item_id;
end;
$$;

create or replace function public.create_default_reminder_rules(target_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record record;
begin
  select * into item_record from public.compliance_items where id = target_item_id;

  if not found then
    raise exception 'Compliance item not found';
  end if;

  if auth.uid() is not null and not public.has_company_role(item_record.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]) then
    raise exception 'You do not have permission to manage reminders for this item';
  end if;

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type)
  values (target_item_id, item_record.company_id, 'Start working reminder', 'on_start_date')
  on conflict do nothing;

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before)
  values (target_item_id, item_record.company_id, '14 days before expiration', 'days_before_expiration', 14)
  on conflict do nothing;
end;
$$;

create or replace function public.schedule_due_reminders(target_run_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
begin
  insert into public.reminder_send_log (company_id, item_id, reminder_rule_id, recipient_email, subject, body, scheduled_for)
  select
    item.company_id,
    item.id,
    rule.id,
    recipient.recipient_email,
    'Reminder: ' || item.item_name,
    concat_ws(E'
',
      'Reminder: ' || item.item_name,
      'Vessel/company: ' || coalesce(vessel.name, 'Company-wide'),
      'Owner: ' || coalesce(item.owner_current, 'Unassigned'),
      'Start working on: ' || coalesce(item.start_working_on::text, 'Not set'),
      'Expiration date: ' || coalesce(item.expiration_date::text, 'Not set'),
      'Status: ' || item.status::text,
      case when nullif(trim(coalesce(item.instructions, '')), '') is not null then 'Instructions: ' || item.instructions else null end
    ),
    target_run_date::timestamptz + time '08:00'
  from public.compliance_items item
  join public.compliance_item_reminder_rules rule on rule.item_id = item.id and rule.active
  join public.compliance_item_notification_recipients recipient on recipient.item_id = item.id
  left join public.vessels vessel on vessel.id = item.vessel_id
  where item.status not in ('complete', 'discontinued')
    and (
      (rule.trigger_type = 'on_start_date' and item.start_working_on = target_run_date)
      or (rule.trigger_type = 'days_before_expiration' and item.expiration_date - coalesce(rule.days_before, 0) = target_run_date)
      or (
        rule.trigger_type = 'repeat_after_start'
        and item.start_working_on is not null
        and item.start_working_on <= target_run_date
        and coalesce(rule.repeat_every_days, 0) > 0
        and ((target_run_date - item.start_working_on) % rule.repeat_every_days = 0)
      )
    )
  on conflict do nothing;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.accept_company_invite(text) to authenticated;
grant execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text) to authenticated;
grant execute on function public.update_compliance_item_status(uuid, public.compliance_item_status, text) to authenticated;
grant execute on function public.complete_compliance_item(uuid, date, text, boolean, date, date) to authenticated;
grant execute on function public.create_default_reminder_rules(uuid) to authenticated;
grant execute on function public.schedule_due_reminders(date) to authenticated;

drop policy if exists "Admins can view app admins" on public.app_admins;
create policy "Admins can view app admins" on public.app_admins
  for select using (public.is_app_admin());

drop policy if exists "Admins and invitees can view invitations" on public.company_invitations;
create policy "Admins and invitees can view invitations" on public.company_invitations
  for select using (
    public.is_app_admin()
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
    or lower(email::text) = public.current_user_email()
  );

drop policy if exists "Admins can manage invitations" on public.company_invitations;
create policy "Admins can manage invitations" on public.company_invitations
  for all using (
    public.is_app_admin()
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  )
  with check (
    public.is_app_admin()
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  );

drop policy if exists "Members can view companies" on public.companies;
drop policy if exists "Members and admins can view companies" on public.companies;
create policy "Members and admins can view companies" on public.companies
  for select using (public.is_company_member(id));

drop policy if exists "Members can view memberships" on public.company_memberships;
drop policy if exists "Members and admins can view memberships" on public.company_memberships;
create policy "Members and admins can view memberships" on public.company_memberships
  for select using (
    public.is_app_admin()
    or user_id = auth.uid()
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  );

drop policy if exists "Members can view vessels" on public.vessels;
drop policy if exists "Office users can view vessels" on public.vessels;
create policy "Office users can view vessels" on public.vessels
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));

drop policy if exists "Members can view email queue" on public.email_queue;
drop policy if exists "Office users can view email queue" on public.email_queue;
create policy "Office users can view email queue" on public.email_queue
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));

drop policy if exists "Members can view audit log" on public.audit_log;
drop policy if exists "Office users can view audit log" on public.audit_log;
create policy "Office users can view audit log" on public.audit_log
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));

drop policy if exists "Office users can view compliance items" on public.compliance_items;
create policy "Office users can view compliance items" on public.compliance_items
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));

drop policy if exists "Office users can view item status history" on public.compliance_item_status_history;
create policy "Office users can view item status history" on public.compliance_item_status_history
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));

drop policy if exists "Office users can view reminder rules" on public.compliance_item_reminder_rules;
create policy "Office users can view reminder rules" on public.compliance_item_reminder_rules
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));

drop policy if exists "Office users can view reminder recipients" on public.compliance_item_notification_recipients;
create policy "Office users can view reminder recipients" on public.compliance_item_notification_recipients
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));

drop policy if exists "Office users can view reminder send log" on public.reminder_send_log;
create policy "Office users can view reminder send log" on public.reminder_send_log
  for select using (public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[]));
