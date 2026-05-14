alter table public.reminder_send_log
  add column if not exists claimed_at timestamptz,
  add column if not exists send_attempts integer not null default 0;

create index if not exists reminder_send_log_claim_idx
  on public.reminder_send_log(status, scheduled_for, claimed_at)
  where sent_at is null;

create or replace function public.can_edit_compliance_item_core(target_item_id uuid)
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
       and membership.role = 'owner'
      where item.id = target_item_id
    );
$$;

create or replace function public.can_manage_compliance_item(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_edit_compliance_item_core(target_item_id)
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
  normalized_interval integer;
  new_item_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_company_role(target_company_id, array['owner']::public.app_role[]) then
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

  item_recurrence_unit := coalesce(item_recurrence_unit, 'none');

  if item_recurrence_unit in ('years', 'months') then
    if coalesce(item_recurrence_interval, 0) <= 0 then
      raise exception 'Recurring items require a recurrence interval';
    end if;
    normalized_interval := item_recurrence_interval;
  else
    normalized_interval := null;
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
    normalized_interval,
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

create or replace function public.update_compliance_item_core(
  target_item_id uuid,
  next_vessel_id uuid default null,
  next_owner_raw text default null,
  next_owner_current text default null,
  next_item_name text default null,
  next_item_number text default null,
  next_agency_type text default null,
  next_compliance_area text default 'Other',
  next_frequency_label text default null,
  next_recurrence_unit public.recurrence_unit default 'none',
  next_recurrence_interval integer default null,
  next_start_working_on date default null,
  next_expiration_date date default null,
  next_status_notes text default null,
  next_instructions text default null,
  next_sharepoint_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item_record record;
  normalized_owner_raw text := nullif(trim(coalesce(next_owner_raw, '')), '');
  normalized_owner_current text := nullif(trim(coalesce(next_owner_current, '')), '');
  normalized_item_name text := nullif(trim(coalesce(next_item_name, '')), '');
  normalized_item_number text := nullif(trim(coalesce(next_item_number, '')), '');
  normalized_agency_type text := nullif(trim(coalesce(next_agency_type, '')), '');
  normalized_compliance_area text := coalesce(nullif(trim(coalesce(next_compliance_area, '')), ''), 'Other');
  normalized_frequency_label text := nullif(trim(coalesce(next_frequency_label, '')), '');
  normalized_recurrence_unit public.recurrence_unit := coalesce(next_recurrence_unit, 'none');
  normalized_recurrence_interval integer;
  normalized_status_notes text := nullif(trim(coalesce(next_status_notes, '')), '');
  normalized_instructions text := nullif(trim(coalesce(next_instructions, '')), '');
  normalized_sharepoint_url text := nullif(trim(coalesce(next_sharepoint_url, '')), '');
  changed_fields text[];
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
    raise exception 'You do not have permission to edit this item';
  end if;

  if normalized_item_name is null then
    raise exception 'Item name is required';
  end if;

  if next_vessel_id is not null and not exists (
    select 1
    from public.vessels vessel
    where vessel.id = next_vessel_id
      and vessel.company_id = item_record.company_id
  ) then
    raise exception 'Vessel not found for this company';
  end if;

  if normalized_recurrence_unit in ('years', 'months') then
    if coalesce(next_recurrence_interval, 0) <= 0 then
      raise exception 'Recurring items require a recurrence interval';
    end if;
    normalized_recurrence_interval := next_recurrence_interval;
  else
    normalized_recurrence_interval := null;
  end if;

  changed_fields := array_remove(array[
    case when item_record.vessel_id is distinct from next_vessel_id then 'vessel_id' end,
    case when item_record.owner_raw is distinct from normalized_owner_raw then 'owner_raw' end,
    case when item_record.owner_current is distinct from normalized_owner_current then 'owner_current' end,
    case when item_record.item_name is distinct from normalized_item_name then 'item_name' end,
    case when item_record.item_number is distinct from normalized_item_number then 'item_number' end,
    case when item_record.agency_type is distinct from normalized_agency_type then 'agency_type' end,
    case when item_record.compliance_area is distinct from normalized_compliance_area then 'compliance_area' end,
    case when item_record.frequency_label is distinct from normalized_frequency_label then 'frequency_label' end,
    case when item_record.recurrence_unit is distinct from normalized_recurrence_unit then 'recurrence_unit' end,
    case when item_record.recurrence_interval is distinct from normalized_recurrence_interval then 'recurrence_interval' end,
    case when item_record.start_working_on is distinct from next_start_working_on then 'start_working_on' end,
    case when item_record.expiration_date is distinct from next_expiration_date then 'expiration_date' end,
    case when item_record.status_notes is distinct from normalized_status_notes then 'status_notes' end,
    case when item_record.instructions is distinct from normalized_instructions then 'instructions' end,
    case when item_record.sharepoint_url is distinct from normalized_sharepoint_url then 'sharepoint_url' end
  ], null);

  if array_length(changed_fields, 1) is null then
    return;
  end if;

  update public.compliance_items
  set vessel_id = next_vessel_id,
      owner_raw = normalized_owner_raw,
      owner_current = normalized_owner_current,
      item_name = normalized_item_name,
      item_number = normalized_item_number,
      agency_type = normalized_agency_type,
      compliance_area = normalized_compliance_area,
      frequency_label = normalized_frequency_label,
      recurrence_unit = normalized_recurrence_unit,
      recurrence_interval = normalized_recurrence_interval,
      start_working_on = next_start_working_on,
      expiration_date = next_expiration_date,
      status_notes = normalized_status_notes,
      instructions = normalized_instructions,
      sharepoint_url = normalized_sharepoint_url,
      updated_at = now()
  where id = item_record.id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    item_record.company_id,
    current_user_id,
    'compliance_item',
    item_record.id,
    'item_core_updated',
    jsonb_build_object(
      'changed_fields', changed_fields,
      'old', jsonb_build_object(
        'vessel_id', item_record.vessel_id,
        'owner_raw', item_record.owner_raw,
        'owner_current', item_record.owner_current,
        'item_name', item_record.item_name,
        'item_number', item_record.item_number,
        'agency_type', item_record.agency_type,
        'compliance_area', item_record.compliance_area,
        'frequency_label', item_record.frequency_label,
        'recurrence_unit', item_record.recurrence_unit,
        'recurrence_interval', item_record.recurrence_interval,
        'start_working_on', item_record.start_working_on,
        'expiration_date', item_record.expiration_date,
        'status_notes', item_record.status_notes,
        'instructions', item_record.instructions,
        'sharepoint_url', item_record.sharepoint_url
      ),
      'new', jsonb_build_object(
        'vessel_id', next_vessel_id,
        'owner_raw', normalized_owner_raw,
        'owner_current', normalized_owner_current,
        'item_name', normalized_item_name,
        'item_number', normalized_item_number,
        'agency_type', normalized_agency_type,
        'compliance_area', normalized_compliance_area,
        'frequency_label', normalized_frequency_label,
        'recurrence_unit', normalized_recurrence_unit,
        'recurrence_interval', normalized_recurrence_interval,
        'start_working_on', next_start_working_on,
        'expiration_date', next_expiration_date,
        'status_notes', normalized_status_notes,
        'instructions', normalized_instructions,
        'sharepoint_url', normalized_sharepoint_url
      )
    )
  );
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

  if next_status = 'complete' then
    raise exception 'Use complete_compliance_item to mark an item complete';
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

  if auth.uid() is not null and not public.can_edit_compliance_item_core(item_record.id) then
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

  if not public.can_edit_compliance_item_core(item_record.id) then
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
    '',
    scheduled_time
  from deduped_recipients
  on conflict do nothing;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

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
begin
  if auth.role() = 'service_role' then
    return public.schedule_due_reminders_for_company(target_company_id, target_run_date);
  end if;

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_app_admin() and not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = current_user_id
      and membership.role = 'owner'
  ) then
    raise exception 'You do not have permission to schedule reminders for this company';
  end if;

  return public.schedule_due_reminders_for_company(target_company_id, target_run_date);
end;
$$;

create or replace function public.schedule_due_reminders_all_companies(target_run_date date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  company_record record;
  queued_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required';
  end if;

  for company_record in
    select id, timezone
    from public.companies
    order by created_at
  loop
    begin
      queued_count := queued_count + public.schedule_due_reminders_for_company(company_record.id, target_run_date);
    exception when others then
      insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
      values (
        company_record.id,
        null,
        'company',
        company_record.id,
        'reminder_cron_company_failed',
        jsonb_build_object('message', sqlerrm)
      );
    end;
  end loop;

  return queued_count;
end;
$$;

create or replace function public.claim_due_reminders(
  target_company_id uuid default null,
  claim_limit integer default 25
)
returns table (
  id uuid,
  company_id uuid,
  item_id uuid,
  reminder_rule_id uuid,
  recipient_email text,
  scheduled_for timestamptz,
  item_name text,
  owner_current text,
  start_working_on date,
  expiration_date date,
  status public.compliance_item_status,
  instructions text,
  vessel_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(claim_limit, 25), 1), 100);
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required';
  end if;

  return query
  with candidates as (
    select log.id
    from public.reminder_send_log log
    where (target_company_id is null or log.company_id = target_company_id)
      and log.sent_at is null
      and log.scheduled_for <= now()
      and (
        log.status = 'scheduled'
        or (
          log.status = 'queued'
          and (log.claimed_at is null or log.claimed_at < now() - interval '15 minutes')
        )
      )
    order by log.scheduled_for asc
    for update skip locked
    limit safe_limit
  ),
  claimed as (
    update public.reminder_send_log log
    set status = 'queued',
        claimed_at = now(),
        send_attempts = log.send_attempts + 1,
        failure_reason = null
    from candidates
    where log.id = candidates.id
    returning log.*
  )
  select
    claimed.id,
    claimed.company_id,
    claimed.item_id,
    claimed.reminder_rule_id,
    claimed.recipient_email,
    claimed.scheduled_for,
    item.item_name,
    item.owner_current,
    item.start_working_on,
    item.expiration_date,
    item.status,
    item.instructions,
    vessel.name as vessel_name
  from claimed
  join public.compliance_items item on item.id = claimed.item_id
  left join public.vessels vessel on vessel.id = item.vessel_id
  order by claimed.scheduled_for asc;
end;
$$;

create or replace function public.mark_compliance_item_workflow_activity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.import_v2_apply', true) = 'on' then
    return new;
  end if;

  if old.owner_raw is distinct from new.owner_raw
    or old.owner_current is distinct from new.owner_current
    or old.vessel_id is distinct from new.vessel_id
    or old.item_name is distinct from new.item_name
    or old.item_number is distinct from new.item_number
    or old.agency_type is distinct from new.agency_type
    or old.compliance_area is distinct from new.compliance_area
    or old.frequency_label is distinct from new.frequency_label
    or old.recurrence_interval is distinct from new.recurrence_interval
    or old.recurrence_unit is distinct from new.recurrence_unit
    or old.start_working_on is distinct from new.start_working_on
    or old.expiration_date is distinct from new.expiration_date
    or old.status is distinct from new.status
    or old.status_notes is distinct from new.status_notes
    or old.instructions is distinct from new.instructions
    or old.sharepoint_url is distinct from new.sharepoint_url
    or old.completed_at is distinct from new.completed_at
    or old.discontinued_at is distinct from new.discontinued_at
  then
    new.last_non_import_activity_at := now();
  end if;

  return new;
end;
$$;

create or replace function public._customer_settings_actor_role(target_company_id uuid, require_admin boolean)
returns public.app_role
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  membership_count integer;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_app_admin() then
    raise exception 'FF admins must use the admin customer console';
  end if;

  select count(distinct company_id)
  into membership_count
  from public.company_memberships
  where user_id = current_user_id;

  if membership_count = 0 then
    raise exception 'No customer workspace membership found';
  end if;

  if membership_count > 1 then
    raise exception 'MULTI_COMPANY_CONTEXT_BLOCKED';
  end if;

  select membership.role
  into actor_role
  from public.company_memberships membership
  where membership.company_id = target_company_id
    and membership.user_id = current_user_id
  limit 1;

  if actor_role is null then
    raise exception 'No membership for this customer workspace';
  end if;

  if require_admin and actor_role <> 'owner' then
    raise exception 'Workspace owner access is required';
  end if;

  return actor_role;
end;
$$;

create or replace function public._settings_can_manage_role(
  actor_role public.app_role,
  target_role public.app_role,
  next_role public.app_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select actor_role = 'owner'
    and (
      next_role in ('owner', 'office_user')
      or target_role = next_role
    );
$$;

create or replace function public.get_queue_owner_codes(target_company_id uuid)
returns table (
  code text,
  display_name text,
  records integer,
  is_assigned_to_current_user boolean,
  is_visible_to_current_user boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
begin
  actor_role := public._customer_settings_actor_role(target_company_id, false);

  return query
  with item_counts as (
    select item.owner_current as owner_code, count(*)::integer as record_count
    from public.compliance_items item
    where item.company_id = target_company_id
      and nullif(trim(coalesce(item.owner_current, '')), '') is not null
    group by item.owner_current
  ),
  merged_codes as (
    select owner_code.code, owner_code.display_name, owner_code.user_id, coalesce(item_counts.record_count, 0) as record_count
    from public.company_owner_codes owner_code
    left join item_counts on item_counts.owner_code = owner_code.code
    where owner_code.company_id = target_company_id
    union
    select item_counts.owner_code as code, null::text as display_name, null::uuid as user_id, item_counts.record_count
    from item_counts
    where not exists (
      select 1
      from public.company_owner_codes owner_code
      where owner_code.company_id = target_company_id
        and owner_code.code = item_counts.owner_code
    )
  )
  select
    merged_codes.code,
    merged_codes.display_name,
    merged_codes.record_count as records,
    merged_codes.user_id = current_user_id as is_assigned_to_current_user,
    case
      when actor_role = 'owner' then true
      else merged_codes.user_id = current_user_id
    end as is_visible_to_current_user
  from merged_codes
  order by merged_codes.code;
end;
$$;

drop policy if exists "Office users can view audit log" on public.audit_log;
create policy "Office users can view audit log" on public.audit_log
  for select
  to authenticated
  using (
    (
      action like 'settings\_%' escape '\'
      and (
        (select public.is_app_admin())
        or exists (
          select 1
          from public.company_memberships membership
          where membership.company_id = audit_log.company_id
            and membership.user_id = (select auth.uid())
            and membership.role = 'owner'
        )
      )
    )
    or (
      action not like 'settings\_%' escape '\'
      and public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[])
    )
  );

revoke execute on function public.can_edit_compliance_item_core(uuid) from public, anon, authenticated;
revoke execute on function public.update_compliance_item_core(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text) from public, anon;
revoke execute on function public.schedule_due_reminders_for_company(uuid, date) from public, anon, authenticated;
revoke execute on function public.schedule_due_reminders_all_companies(date) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(uuid, integer) from public, anon, authenticated;
revoke execute on function public.schedule_due_reminders(uuid, date) from public, anon;

grant execute on function public.update_compliance_item_core(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text) to authenticated;
grant execute on function public.schedule_due_reminders(uuid, date) to authenticated, service_role;
grant execute on function public.schedule_due_reminders_all_companies(date) to service_role;
grant execute on function public.claim_due_reminders(uuid, integer) to service_role;
