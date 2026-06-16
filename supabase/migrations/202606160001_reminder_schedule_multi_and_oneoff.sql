alter table public.compliance_item_reminder_rules
  add column if not exists send_on date;

drop index if exists public.compliance_item_reminder_rules_item_trigger_idx;

create unique index if not exists compliance_item_reminder_rules_item_trigger_days_idx
  on public.compliance_item_reminder_rules(item_id, trigger_type, coalesce(days_before, -1));

alter table public.compliance_item_reminder_rules
  drop constraint if exists compliance_item_reminder_rules_trigger_type_check;

alter table public.compliance_item_reminder_rules
  add constraint compliance_item_reminder_rules_trigger_type_check
  check (trigger_type in ('on_start_date','days_before_expiration','repeat_after_start','on_specific_date'));

create unique index if not exists compliance_item_reminder_rules_item_oneoff_idx
  on public.compliance_item_reminder_rules(item_id, send_on)
  where trigger_type = 'on_specific_date';

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
  user_can_edit_core boolean;
  computed_next_start date;
  computed_next_expiration date;
  resolved_next_start date;
  resolved_next_expiration date;
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

  user_can_edit_core := public.can_edit_compliance_item_core(item_record.id);

  if item_record.recurrence_unit in ('years', 'months')
    and item_record.recurrence_interval is not null
    and item_record.expiration_date is not null
  then
    computed_next_expiration := case
      when item_record.recurrence_unit = 'years' then (item_record.expiration_date + ((item_record.recurrence_interval::text || ' years')::interval))::date
      else (item_record.expiration_date + ((item_record.recurrence_interval::text || ' months')::interval))::date
    end;

    if item_record.start_working_on is not null then
      computed_next_start := computed_next_expiration - (item_record.expiration_date - item_record.start_working_on);
    end if;
  end if;

  resolved_next_expiration := case
    when user_can_edit_core then coalesce(next_expiration_date, computed_next_expiration)
    else computed_next_expiration
  end;
  resolved_next_start := case
    when user_can_edit_core then coalesce(next_start_working_on, computed_next_start)
    else computed_next_start
  end;

  insert into public.compliance_item_status_history (item_id, company_id, changed_by, from_status, to_status, notes)
  values (item_record.id, item_record.company_id, current_user_id, item_record.status, 'complete', nullif(trim(coalesce(final_notes, '')), ''));

  update public.compliance_items
  set status = 'complete',
      completed_at = coalesce(completion_date, current_date),
      status_notes = coalesce(nullif(trim(coalesce(final_notes, '')), ''), status_notes),
      updated_at = now()
  where id = item_record.id;

  if should_create_next and item_record.recurrence_unit in ('years', 'months') and resolved_next_expiration is not null then
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
      resolved_next_start,
      resolved_next_expiration,
      'not_started',
      item_record.instructions,
      item_record.sharepoint_url,
      item_record.id,
      current_user_id
    ) returning id into new_item_id;

    insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, active)
    select new_item_id, item_record.company_id, label, trigger_type, days_before, repeat_every_days, active
    from public.compliance_item_reminder_rules
    where item_id = item_record.id
      and trigger_type <> 'on_specific_date';

    insert into public.compliance_item_notification_recipients (item_id, company_id, recipient_name, recipient_email, recipient_type)
    select new_item_id, item_record.company_id, recipient_name, recipient_email, recipient_type
    from public.compliance_item_notification_recipients
    where item_id = item_record.id
    on conflict (item_id, recipient_email) do nothing;
  end if;

  return new_item_id;
end;
$$;

drop function if exists public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer, boolean, integer, jsonb);

create or replace function public.save_compliance_item_reminders(
  target_item_id uuid,
  item_instructions text,
  start_rule_active boolean,
  expiration_rule_active boolean,
  expiration_days_before integer[],
  repeat_rule_active boolean,
  repeat_every_days integer,
  one_off_dates date[],
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
  expiration_offsets integer[];
  one_off_send_dates date[];
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

  if not public.can_edit_compliance_item_core(item_record.id) then
    raise exception 'You do not have permission to manage reminders for this item';
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

  select coalesce(array_agg(distinct candidate.days_before order by candidate.days_before desc), array[]::integer[])
  into expiration_offsets
  from unnest(coalesce(expiration_days_before, array[]::integer[])) as candidate(days_before)
  where candidate.days_before >= 0;

  select coalesce(array_agg(distinct candidate.send_on order by candidate.send_on), array[]::date[])
  into one_off_send_dates
  from unnest(coalesce(one_off_dates, array[]::date[])) as candidate(send_on)
  where candidate.send_on >= current_date;

  update public.compliance_items
  set instructions = nullif(trim(coalesce(item_instructions, '')), ''),
      updated_at = now()
  where id = item_record.id;

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, active)
  values (
    item_record.id,
    item_record.company_id,
    'Start working reminder',
    'on_start_date',
    null,
    null,
    coalesce(start_rule_active, false)
  )
  on conflict (item_id, trigger_type, (coalesce(days_before, -1))) do update set
    label = excluded.label,
    repeat_every_days = excluded.repeat_every_days,
    active = excluded.active;

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, active)
  values (
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
  on conflict (item_id, trigger_type, (coalesce(days_before, -1))) do update set
    label = excluded.label,
    repeat_every_days = excluded.repeat_every_days,
    active = excluded.active;

  delete from public.compliance_item_reminder_rules
  where item_id = item_record.id
    and trigger_type = 'days_before_expiration';

  if coalesce(expiration_rule_active, false) then
    insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, active)
    select
      item_record.id,
      item_record.company_id,
      offset_days::text || ' days before expiration',
      'days_before_expiration',
      offset_days,
      null,
      true
    from unnest(expiration_offsets) as selected_offset(offset_days);
  end if;

  delete from public.compliance_item_reminder_rules
  where item_id = item_record.id
    and trigger_type = 'on_specific_date';

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, send_on, active)
  select
    item_record.id,
    item_record.company_id,
    'One-off ' || to_char(send_date, 'Mon DD'),
    'on_specific_date',
    null,
    null,
    send_date,
    true
  from unnest(one_off_send_dates) as selected_date(send_date);

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

create or replace function public.schedule_due_reminders_for_company(
  target_company_id uuid,
  target_run_date date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  company_timezone text;
  run_date date;
  scheduled_time timestamptz;
  queued_count integer := 0;
begin
  if target_company_id is null then
    raise exception 'Company is required';
  end if;

  select coalesce(company.timezone, 'America/Anchorage')
  into company_timezone
  from public.companies company
  where company.id = target_company_id;

  if company_timezone is null then
    raise exception 'Company not found';
  end if;

  run_date := coalesce(target_run_date, (now() at time zone company_timezone)::date);
  scheduled_time := (run_date::timestamp + time '08:00') at time zone company_timezone;

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
        or (rule.trigger_type = 'on_specific_date' and rule.send_on = run_date)
        or (
          rule.trigger_type = 'repeat_after_start'
          and item.status not in ('submitted')
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
    '',
    scheduled_time
  from deduped_recipients
  on conflict do nothing;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer[], boolean, integer, date[], jsonb) from public, anon;
grant execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer[], boolean, integer, date[], jsonb) to authenticated;
