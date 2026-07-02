create table if not exists public.compliance_item_owner_codes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.compliance_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_code text not null check (length(trim(owner_code)) > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint compliance_item_owner_codes_owner_code_trimmed_check check (owner_code = trim(owner_code)),
  constraint compliance_item_owner_codes_unique_item_code unique (item_id, owner_code)
);

create index if not exists compliance_item_owner_codes_company_idx
  on public.compliance_item_owner_codes(company_id, owner_code);

create index if not exists compliance_item_owner_codes_item_idx
  on public.compliance_item_owner_codes(item_id);

create unique index if not exists compliance_item_owner_codes_one_primary_idx
  on public.compliance_item_owner_codes(item_id)
  where is_primary;

alter table public.compliance_item_owner_codes enable row level security;

drop policy if exists "Company members can view item owner codes" on public.compliance_item_owner_codes;
create policy "Company members can view item owner codes" on public.compliance_item_owner_codes
  for select
  to authenticated
  using (public.is_company_member(company_id));

drop policy if exists "Workspace owners can manage item owner codes" on public.compliance_item_owner_codes;
create policy "Workspace owners can manage item owner codes" on public.compliance_item_owner_codes
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner']::public.app_role[]));

create or replace function public.normalize_owner_code_list(owner_codes text[], fallback_owner_code text default null)
returns text[]
language sql
immutable
set search_path = public
as $$
  with raw_values as (
    select value, ordinal
    from unnest(
      case
        when owner_codes is null then array[fallback_owner_code]::text[]
        else owner_codes
      end
    ) with ordinality as input(value, ordinal)
  ),
  cleaned as (
    select trim(value) as code, min(ordinal) as first_ordinal
    from raw_values
    where nullif(trim(coalesce(value, '')), '') is not null
    group by trim(value)
  )
  select coalesce(array_agg(code order by first_ordinal), array[]::text[])
  from cleaned;
$$;

create or replace function public.sync_compliance_item_owner_codes(
  target_item_id uuid,
  selected_owner_codes text[] default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record record;
  normalized_owner_codes text[];
  primary_owner_code text;
begin
  select *
  into item_record
  from public.compliance_items
  where id = target_item_id
  for update;

  if not found then
    raise exception 'Compliance item not found';
  end if;

  normalized_owner_codes := public.normalize_owner_code_list(selected_owner_codes, item_record.owner_current);
  primary_owner_code := normalized_owner_codes[1];

  perform set_config('app.owner_code_syncing', 'on', true);

  if coalesce(array_length(normalized_owner_codes, 1), 0) = 0 then
    delete from public.compliance_item_owner_codes
    where item_id = item_record.id;
  else
    delete from public.compliance_item_owner_codes
    where item_id = item_record.id
      and not (owner_code = any(normalized_owner_codes));

    update public.compliance_item_owner_codes
    set is_primary = false
    where item_id = item_record.id
      and owner_code <> primary_owner_code
      and is_primary;

    insert into public.compliance_item_owner_codes (item_id, company_id, owner_code, is_primary)
    select
      item_record.id,
      item_record.company_id,
      owner_code,
      ordinal = 1
    from unnest(normalized_owner_codes) with ordinality as selected(owner_code, ordinal)
    on conflict (item_id, owner_code) do update set
      company_id = excluded.company_id,
      is_primary = excluded.is_primary;
  end if;

  if item_record.owner_current is distinct from primary_owner_code then
    update public.compliance_items
    set owner_current = primary_owner_code,
        updated_at = now()
    where id = item_record.id;
  end if;

  perform set_config('app.owner_code_syncing', 'off', true);
  return primary_owner_code;
end;
$$;

create or replace function public.sync_compliance_item_primary_owner_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.owner_code_syncing', true) = 'on' then
    return new;
  end if;

  perform public.sync_compliance_item_owner_codes(
    new.id,
    case
      when nullif(trim(coalesce(new.owner_current, '')), '') is null then array[]::text[]
      else array[new.owner_current]::text[]
    end
  );

  return new;
end;
$$;

drop trigger if exists sync_compliance_item_primary_owner_code on public.compliance_items;
create trigger sync_compliance_item_primary_owner_code
  after insert or update of owner_current on public.compliance_items
  for each row
  execute function public.sync_compliance_item_primary_owner_code();

insert into public.compliance_item_owner_codes (item_id, company_id, owner_code, is_primary)
select item.id, item.company_id, item.owner_current, true
from public.compliance_items item
where nullif(trim(coalesce(item.owner_current, '')), '') is not null
on conflict (item_id, owner_code) do update set
  company_id = excluded.company_id,
  is_primary = true;

drop trigger if exists touch_item_from_owner_code_workflow on public.compliance_item_owner_codes;
create trigger touch_item_from_owner_code_workflow
  after insert or update or delete on public.compliance_item_owner_codes
  for each row
  execute function public.touch_compliance_item_from_child_workflow();

alter table public.compliance_item_reminder_rules
  add column if not exists audience text not null default 'owner';

alter table public.compliance_item_reminder_rules
  drop constraint if exists compliance_item_reminder_rules_audience_check;

alter table public.compliance_item_reminder_rules
  add constraint compliance_item_reminder_rules_audience_check
  check (audience in ('owner', 'external'));

alter table public.compliance_item_notification_recipients
  drop constraint if exists compliance_item_notification_recipients_recipient_type_check;

alter table public.compliance_item_notification_recipients
  add constraint compliance_item_notification_recipients_recipient_type_check
  check (recipient_type in ('owner', 'additional', 'external'));

drop index if exists public.compliance_item_reminder_rules_item_trigger_idx;
drop index if exists public.compliance_item_reminder_rules_item_trigger_days_idx;
drop index if exists public.compliance_item_reminder_rules_item_oneoff_idx;

create unique index if not exists compliance_item_reminder_rules_item_audience_trigger_days_idx
  on public.compliance_item_reminder_rules(item_id, audience, trigger_type, coalesce(days_before, -1))
  where trigger_type <> 'on_specific_date';

create unique index if not exists compliance_item_reminder_rules_item_audience_oneoff_idx
  on public.compliance_item_reminder_rules(item_id, audience, send_on)
  where trigger_type = 'on_specific_date';

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
    )
    or exists (
      select 1
      from public.compliance_items item
      join public.company_memberships membership
        on membership.company_id = item.company_id
       and membership.user_id = auth.uid()
       and membership.role = 'office_user'
      join lateral (
        select item_owner.owner_code
        from public.compliance_item_owner_codes item_owner
        where item_owner.item_id = item.id
        union
        select item.owner_current
        where item.owner_current is not null
      ) item_owner on true
      join public.company_owner_codes owner_code
        on owner_code.company_id = item.company_id
       and owner_code.code = item_owner.owner_code
       and owner_code.user_id = auth.uid()
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
  select public.can_edit_compliance_item_core(target_item_id);
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
  item_sharepoint_url text default null,
  item_owner_codes text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_interval integer;
  normalized_owner_codes text[];
  normalized_owner_current text;
  new_item_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_company_role(target_company_id, array['owner', 'office_user']::public.app_role[]) then
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

  normalized_owner_codes := public.normalize_owner_code_list(item_owner_codes, item_owner_current);
  normalized_owner_current := normalized_owner_codes[1];

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
    normalized_owner_current,
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

  perform public.sync_compliance_item_owner_codes(new_item_id, normalized_owner_codes);
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
  next_sharepoint_url text default null,
  next_owner_codes text[] default null
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
  normalized_owner_codes text[];
  normalized_owner_current text;
  existing_owner_codes text[];
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

  normalized_owner_codes := public.normalize_owner_code_list(next_owner_codes, next_owner_current);
  normalized_owner_current := normalized_owner_codes[1];

  select coalesce(array_agg(owner_code order by is_primary desc, owner_code), array[]::text[])
  into existing_owner_codes
  from public.compliance_item_owner_codes
  where item_id = item_record.id;

  if coalesce(array_length(existing_owner_codes, 1), 0) = 0 and item_record.owner_current is not null then
    existing_owner_codes := array[item_record.owner_current]::text[];
  end if;

  changed_fields := array_remove(array[
    case when item_record.vessel_id is distinct from next_vessel_id then 'vessel_id' end,
    case when item_record.owner_raw is distinct from normalized_owner_raw then 'owner_raw' end,
    case when item_record.owner_current is distinct from normalized_owner_current then 'owner_current' end,
    case when existing_owner_codes is distinct from normalized_owner_codes then 'owner_codes' end,
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

  perform public.sync_compliance_item_owner_codes(item_record.id, normalized_owner_codes);

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
        'owner_codes', existing_owner_codes,
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
        'owner_codes', normalized_owner_codes,
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
  rolled_owner_codes text[];
  new_item_id uuid;
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

  if item_record.status = 'complete' then
    raise exception 'This compliance item is already complete';
  end if;

  if item_record.status = 'discontinued' then
    raise exception 'This compliance item has been discontinued';
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
    select coalesce(array_agg(owner_code order by is_primary desc, owner_code), public.normalize_owner_code_list(null::text[], item_record.owner_current))
    into rolled_owner_codes
    from public.compliance_item_owner_codes
    where item_id = item_record.id;

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
      rolled_owner_codes[1],
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

    perform public.sync_compliance_item_owner_codes(new_item_id, rolled_owner_codes);

    insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, send_on, audience, active)
    select new_item_id, item_record.company_id, label, trigger_type, days_before, repeat_every_days, send_on, audience, active
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

create or replace function public._replace_compliance_item_reminder_rules(
  target_item_id uuid,
  target_company_id uuid,
  reminder_audience text,
  start_rule_active boolean,
  expiration_rule_active boolean,
  expiration_days_before integer[],
  repeat_rule_active boolean,
  repeat_every_days integer,
  one_off_dates date[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expiration_offsets integer[];
  one_off_send_dates date[];
  inactive_deadline_offset integer;
begin
  if reminder_audience not in ('owner', 'external') then
    raise exception 'Reminder audience is invalid';
  end if;

  if repeat_every_days is not null and repeat_every_days <= 0 then
    raise exception 'Repeat interval must be greater than zero';
  end if;

  if repeat_rule_active and repeat_every_days is null then
    raise exception 'Repeat interval is required when repeat reminders are active';
  end if;

  select coalesce(array_agg(distinct candidate.days_before order by candidate.days_before desc), array[]::integer[])
  into expiration_offsets
  from unnest(coalesce(expiration_days_before, array[]::integer[])) as candidate(days_before)
  where candidate.days_before >= 0;

  select coalesce(array_agg(distinct candidate.send_on order by candidate.send_on), array[]::date[])
  into one_off_send_dates
  from unnest(coalesce(one_off_dates, array[]::date[])) as candidate(send_on)
  where candidate.send_on >= current_date;

  inactive_deadline_offset := coalesce(expiration_offsets[1], 14);

  delete from public.compliance_item_reminder_rules
  where item_id = target_item_id
    and audience = reminder_audience;

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, send_on, audience, active)
  values
    (
      target_item_id,
      target_company_id,
      case when reminder_audience = 'external' then 'External start-working reminder' else 'Owner start-working reminder' end,
      'on_start_date',
      null,
      null,
      null,
      reminder_audience,
      coalesce(start_rule_active, false)
    ),
    (
      target_item_id,
      target_company_id,
      case
        when repeat_every_days is not null and repeat_every_days > 0 then
          case when reminder_audience = 'external' then 'External repeat every ' else 'Owner repeat every ' end || repeat_every_days::text || ' days'
        else
          case when reminder_audience = 'external' then 'External repeat reminder' else 'Owner repeat reminder' end
      end,
      'repeat_after_start',
      null,
      repeat_every_days,
      null,
      reminder_audience,
      coalesce(repeat_rule_active, false)
    );

  if coalesce(expiration_rule_active, false) then
    insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, send_on, audience, active)
    select
      target_item_id,
      target_company_id,
      case when reminder_audience = 'external' then 'External ' else 'Owner ' end || offset_days::text || ' days before expiration',
      'days_before_expiration',
      offset_days,
      null,
      null,
      reminder_audience,
      true
    from unnest(expiration_offsets) as selected_offset(offset_days);
  else
    insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, send_on, audience, active)
    values (
      target_item_id,
      target_company_id,
      case when reminder_audience = 'external' then 'External deadline reminders off' else 'Owner deadline reminders off' end,
      'days_before_expiration',
      inactive_deadline_offset,
      null,
      null,
      reminder_audience,
      false
    );
  end if;

  insert into public.compliance_item_reminder_rules (item_id, company_id, label, trigger_type, days_before, repeat_every_days, send_on, audience, active)
  select
    target_item_id,
    target_company_id,
    case when reminder_audience = 'external' then 'External one-off ' else 'Owner one-off ' end || to_char(send_date, 'Mon DD'),
    'on_specific_date',
    null,
    null,
    send_date,
    reminder_audience,
    true
  from unnest(one_off_send_dates) as selected_date(send_date);
end;
$$;

drop function if exists public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer[], boolean, integer, date[], jsonb);

create or replace function public.save_compliance_item_reminders(
  target_item_id uuid,
  item_instructions text,
  owner_start_rule_active boolean,
  owner_expiration_rule_active boolean,
  owner_expiration_days_before integer[],
  owner_repeat_rule_active boolean,
  owner_repeat_every_days integer,
  owner_one_off_dates date[],
  external_start_rule_active boolean,
  external_expiration_rule_active boolean,
  external_expiration_days_before integer[],
  external_repeat_rule_active boolean,
  external_repeat_every_days integer,
  external_one_off_dates date[],
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

  perform public._replace_compliance_item_reminder_rules(
    item_record.id,
    item_record.company_id,
    'owner',
    owner_start_rule_active,
    owner_expiration_rule_active,
    owner_expiration_days_before,
    owner_repeat_rule_active,
    owner_repeat_every_days,
    owner_one_off_dates
  );

  perform public._replace_compliance_item_reminder_rules(
    item_record.id,
    item_record.company_id,
    'external',
    external_start_rule_active,
    external_expiration_rule_active,
    external_expiration_days_before,
    external_repeat_rule_active,
    external_repeat_every_days,
    external_one_off_dates
  );

  delete from public.compliance_item_notification_recipients
  where item_id = item_record.id
    and recipient_type in ('additional', 'external');

  insert into public.compliance_item_notification_recipients (item_id, company_id, recipient_name, recipient_email, recipient_type)
  select
    item_record.id,
    item_record.company_id,
    recipient_name,
    recipient_email,
    'external'
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
      rule.id as reminder_rule_id,
      rule.audience
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
    join lateral (
      select item_owner.owner_code
      from public.compliance_item_owner_codes item_owner
      where item_owner.item_id = due_rules.item_id
      union
      select due_rules.owner_current
      where due_rules.owner_current is not null
    ) item_owner on true
    join public.company_owner_codes owner_code
      on owner_code.company_id = due_rules.company_id
     and owner_code.code = item_owner.owner_code
     and owner_code.user_id is not null
    join public.profiles profile on profile.id = owner_code.user_id
    where due_rules.audience in ('owner', 'external')
      and nullif(trim(coalesce(profile.email, '')), '') is not null

    union all

    select
      due_rules.*,
      lower(trim(recipient.recipient_email)) as recipient_email
    from due_rules
    join public.compliance_item_notification_recipients recipient
      on recipient.item_id = due_rules.item_id
     and recipient.recipient_type in ('additional', 'external')
    where due_rules.audience = 'external'
      and nullif(trim(coalesce(recipient.recipient_email, '')), '') is not null
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
  with item_owner_rows as (
    select item_owner.owner_code, item_owner.item_id
    from public.compliance_item_owner_codes item_owner
    where item_owner.company_id = target_company_id
    union
    select item.owner_current as owner_code, item.id as item_id
    from public.compliance_items item
    where item.company_id = target_company_id
      and nullif(trim(coalesce(item.owner_current, '')), '') is not null
  ),
  item_counts as (
    select item_owner_rows.owner_code, count(distinct item_owner_rows.item_id)::integer as record_count
    from item_owner_rows
    group by item_owner_rows.owner_code
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

revoke execute on function public.normalize_owner_code_list(text[], text) from public, anon, authenticated;
revoke execute on function public.sync_compliance_item_owner_codes(uuid, text[]) from public, anon, authenticated;
revoke execute on function public._replace_compliance_item_reminder_rules(uuid, uuid, text, boolean, boolean, integer[], boolean, integer, date[]) from public, anon, authenticated;
revoke execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer[], boolean, integer, date[], boolean, boolean, integer[], boolean, integer, date[], jsonb) from public, anon;
revoke execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[]) from public, anon;
revoke execute on function public.update_compliance_item_core(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[]) from public, anon;

grant execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer[], boolean, integer, date[], boolean, boolean, integer[], boolean, integer, date[], jsonb) to authenticated;
grant execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[]) to authenticated;
grant execute on function public.update_compliance_item_core(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[]) to authenticated;
