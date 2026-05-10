create unique index if not exists compliance_item_reminder_rules_item_trigger_idx
  on public.compliance_item_reminder_rules(item_id, trigger_type);

create or replace function public.can_manage_compliance_item(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin()
    or exists (
      select 1
      from public.compliance_items item
      join public.company_memberships membership
        on membership.company_id = item.company_id
       and membership.user_id = auth.uid()
       and membership.role in ('owner', 'office_admin')
      where item.id = target_item_id
    )
    or exists (
      select 1
      from public.compliance_items item
      join public.company_memberships membership
        on membership.company_id = item.company_id
       and membership.user_id = auth.uid()
       and membership.role = 'office_user'
      join public.company_owner_codes owner_code
        on owner_code.company_id = item.company_id
       and owner_code.code = item.owner_current
       and owner_code.user_id = auth.uid()
      where item.id = target_item_id
    );
$$;

revoke execute on function public.can_manage_compliance_item(uuid) from public, anon, authenticated;

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

  if not public.can_manage_compliance_item(item_record.id) then
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

  if not public.can_manage_compliance_item(item_record.id) then
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

create or replace function public.save_compliance_item_reminders(
  target_item_id uuid,
  item_instructions text,
  start_rule_active boolean,
  expiration_rule_active boolean,
  expiration_days_before integer,
  repeat_rule_active boolean,
  repeat_every_days integer,
  additional_recipients jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item_record record;
  recipients jsonb := coalesce(additional_recipients, '[]'::jsonb);
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into item_record
  from public.compliance_items
  where id = target_item_id
  for update;

  if not found then
    raise exception 'Compliance item not found';
  end if;

  if not public.can_manage_compliance_item(item_record.id) then
    raise exception 'You do not have permission to manage reminders for this item';
  end if;

  if expiration_days_before is not null and expiration_days_before < 0 then
    raise exception 'Expiration days before must be zero or greater';
  end if;

  if expiration_rule_active and expiration_days_before is null then
    raise exception 'Expiration days before is required when expiration reminders are active';
  end if;

  if repeat_every_days is not null and repeat_every_days <= 0 then
    raise exception 'Repeat interval must be greater than zero';
  end if;

  if repeat_rule_active and repeat_every_days is null then
    raise exception 'Repeat interval is required when repeat reminders are active';
  end if;

  if jsonb_typeof(recipients) <> 'array' then
    raise exception 'Additional recipients must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(recipients) entry(value)
    where nullif(trim(coalesce(value->>'recipient_email', value->>'email', '')), '') is not null
      and nullif(trim(coalesce(value->>'recipient_email', value->>'email', '')), '') !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  ) then
    raise exception 'Additional recipient email is invalid';
  end if;

  update public.compliance_items
  set instructions = nullif(trim(coalesce(item_instructions, '')), ''),
      updated_at = now()
  where id = item_record.id;

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, active)
  values
    (item_record.id, item_record.company_id, 'Start working reminder', 'on_start_date', null, null, coalesce(start_rule_active, false)),
    (
      item_record.id,
      item_record.company_id,
      coalesce(expiration_days_before, 14)::text || ' days before expiration',
      'days_before_expiration',
      coalesce(expiration_days_before, 14),
      null,
      coalesce(expiration_rule_active, false)
    ),
    (
      item_record.id,
      item_record.company_id,
      case
        when repeat_every_days is not null and repeat_every_days > 0 then 'Repeat every ' || repeat_every_days::text || ' days'
        else 'Repeat reminder'
      end,
      'repeat_after_start',
      null,
      repeat_every_days,
      coalesce(repeat_rule_active, false)
    )
  on conflict (item_id, trigger_type) do update set
    label = excluded.label,
    days_before = excluded.days_before,
    repeat_every_days = excluded.repeat_every_days,
    active = excluded.active;

  delete from public.compliance_item_notification_recipients
  where item_id = item_record.id;

  insert into public.compliance_item_notification_recipients (item_id, company_id, recipient_name, recipient_email, recipient_type)
  select
    item_record.id,
    item_record.company_id,
    recipient_name,
    recipient_email,
    'additional'
  from (
    select distinct on (recipient_email)
      recipient_name,
      recipient_email
    from (
      select
        nullif(trim(coalesce(value->>'recipient_name', value->>'name', '')), '') as recipient_name,
        lower(nullif(trim(coalesce(value->>'recipient_email', value->>'email', '')), '')) as recipient_email
      from jsonb_array_elements(recipients) entry(value)
    ) cleaned
    where recipient_email is not null
    order by recipient_email, recipient_name nulls last
  ) parsed
  where recipient_email is not null
  on conflict (item_id, recipient_email) do update set
    recipient_name = excluded.recipient_name,
    recipient_type = excluded.recipient_type;
end;
$$;

drop function if exists public.schedule_due_reminders(date);

create or replace function public.schedule_due_reminders(
  target_company_id uuid,
  target_run_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  run_date date := coalesce(target_run_date, current_date);
  queued_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_company_id is null then
    raise exception 'Company is required';
  end if;

  if not public.is_app_admin() and not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = current_user_id
      and membership.role in ('owner', 'office_admin')
  ) then
    raise exception 'You do not have permission to schedule reminders for this company';
  end if;

  with due_rules as (
    select
      item.company_id,
      item.id as item_id,
      item.item_name,
      item.owner_current,
      item.start_working_on,
      item.expiration_date,
      item.status,
      item.instructions,
      vessel.name as vessel_name,
      rule.id as reminder_rule_id
    from public.compliance_items item
    join public.compliance_item_reminder_rules rule
      on rule.item_id = item.id
     and rule.active
    left join public.vessels vessel on vessel.id = item.vessel_id
    where item.company_id = target_company_id
      and item.status not in ('complete', 'discontinued')
      and (
        (rule.trigger_type = 'on_start_date' and item.start_working_on = run_date)
        or (rule.trigger_type = 'days_before_expiration' and item.expiration_date - coalesce(rule.days_before, 0) = run_date)
        or (
          rule.trigger_type = 'repeat_after_start'
          and item.start_working_on is not null
          and item.start_working_on <= run_date
          and coalesce(rule.repeat_every_days, 0) > 0
          and ((run_date - item.start_working_on) % rule.repeat_every_days = 0)
        )
      )
  ),
  recipient_candidates as (
    select
      due_rules.*,
      lower(trim(profile.email)) as recipient_email
    from due_rules
    join public.company_owner_codes owner_code
      on owner_code.company_id = due_rules.company_id
     and owner_code.code = due_rules.owner_current
     and owner_code.user_id is not null
    join public.profiles profile on profile.id = owner_code.user_id
    where nullif(trim(coalesce(profile.email, '')), '') is not null

    union all

    select
      due_rules.*,
      lower(trim(recipient.recipient_email)) as recipient_email
    from due_rules
    join public.compliance_item_notification_recipients recipient
      on recipient.item_id = due_rules.item_id
     and recipient.recipient_type = 'additional'
    where nullif(trim(coalesce(recipient.recipient_email, '')), '') is not null
  ),
  deduped_recipients as (
    select distinct on (reminder_rule_id, recipient_email)
      *
    from recipient_candidates
    order by reminder_rule_id, recipient_email
  )
  insert into public.reminder_send_log (company_id, item_id, reminder_rule_id, recipient_email, subject, body, scheduled_for)
  select
    company_id,
    item_id,
    reminder_rule_id,
    recipient_email,
    'Reminder: ' || item_name,
    concat_ws(E'\n',
      'Reminder: ' || item_name,
      'Vessel/company: ' || coalesce(vessel_name, 'Company-wide'),
      'Owner: ' || coalesce(owner_current, 'Unassigned'),
      'Start working on: ' || coalesce(start_working_on::text, 'Not set'),
      'Expiration date: ' || coalesce(expiration_date::text, 'Not set'),
      'Status: ' || status::text,
      case when nullif(trim(coalesce(instructions, '')), '') is not null then 'Instructions: ' || instructions else null end
    ),
    run_date::timestamptz + time '08:00'
  from deduped_recipients
  on conflict do nothing;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer, boolean, integer, jsonb) from public, anon;
revoke execute on function public.schedule_due_reminders(uuid, date) from public, anon;
grant execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer, boolean, integer, jsonb) to authenticated;
grant execute on function public.schedule_due_reminders(uuid, date) to authenticated;

drop policy if exists "Users can view their profile" on public.profiles;
drop policy if exists "Company members can view member profiles" on public.profiles;
create policy "Company members can view member profiles" on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_app_admin())
    or exists (
      select 1
      from public.company_memberships viewer
      join public.company_memberships target
        on target.company_id = viewer.company_id
       and target.user_id = profiles.id
      where viewer.user_id = (select auth.uid())
    )
  );
