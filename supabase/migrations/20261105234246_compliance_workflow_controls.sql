-- Local migration for review. Do not apply to production without a fresh state check.
alter table public.compliance_items
  add column snoozed_until date,
  add column snooze_reason text,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id),
  add column archive_reason text,
  add column awaiting_schedule boolean not null default false;

alter table public.compliance_items add constraint awaiting_schedule_has_no_dates
  check (not awaiting_schedule or (start_working_on is null and expiration_date is null));

alter table public.compliance_item_status_history add column event_type text not null default 'status_change'
  check (event_type in ('status_change', 'snooze', 'unsnooze', 'archive', 'restore'));

-- Track workflow activity so workbook imports preserve customer decisions.
create function public.track_compliance_queue_state()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.archived_at is not null and new.archived_at is not null
    and coalesce(current_setting('app.import_v2_apply', true), '') <> 'on'
    and (new.status is distinct from old.status
      or new.start_working_on is distinct from old.start_working_on
      or new.expiration_date is distinct from old.expiration_date
      or new.item_name is distinct from old.item_name
      or new.status_notes is distinct from old.status_notes
      or new.owner_current is distinct from old.owner_current
      or new.vessel_id is distinct from old.vessel_id
      or new.instructions is distinct from old.instructions
      or new.item_number is distinct from old.item_number
      or new.owner_raw is distinct from old.owner_raw
      or new.agency_id is distinct from old.agency_id
      or new.agency_type is distinct from old.agency_type
      or new.compliance_area is distinct from old.compliance_area
      or new.frequency_label is distinct from old.frequency_label
      or new.recurrence_unit is distinct from old.recurrence_unit
      or new.recurrence_interval is distinct from old.recurrence_interval
      or new.sharepoint_url is distinct from old.sharepoint_url) then
    raise exception 'Restore this archived record before making changes';
  end if;
  if current_setting('app.import_v2_apply', true) = 'on' then
    new.snoozed_until := old.snoozed_until;
    new.snooze_reason := old.snooze_reason;
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
    new.archive_reason := old.archive_reason;
    new.awaiting_schedule := old.awaiting_schedule;
  end if;
  if new.start_working_on is not null or new.expiration_date is not null
    or new.status in ('complete', 'discontinued', 'in_progress', 'submitted') then
    new.awaiting_schedule := false;
  end if;
  if new.status in ('complete', 'discontinued') then
    new.snoozed_until := null;
    new.snooze_reason := null;
  end if;
  -- Queue-only snooze changes must not freeze workbook-managed operational fields.
  if old.archived_at is distinct from new.archived_at
    or old.archive_reason is distinct from new.archive_reason
    or old.awaiting_schedule is distinct from new.awaiting_schedule then
    new.last_non_import_activity_at := now();
  end if;
  return new;
end;
$$;
create trigger track_compliance_queue_state before update on public.compliance_items
  for each row execute function public.track_compliance_queue_state();
revoke all on function public.track_compliance_queue_state() from public, anon, authenticated;

create function public.set_compliance_item_queue_state(
  target_item_id uuid,
  queue_action text,
  return_on date default null,
  reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  item_record public.compliance_items%rowtype;
  workspace_today date;
  event_note text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into item_record from public.compliance_items where id = target_item_id for update;
  if not found then raise exception 'Compliance item not found'; end if;
  if not public.can_manage_compliance_item(item_record.id) then
    raise exception 'You do not have permission to manage this item';
  end if;
  if queue_action is null or queue_action not in ('snooze', 'unsnooze', 'archive', 'restore') then
    raise exception 'Choose a valid queue action';
  end if;
  select (now() at time zone coalesce(timezone, 'America/Los_Angeles'))::date
    into workspace_today from public.companies where id = item_record.company_id;
  if queue_action = 'snooze' then
    if item_record.archived_at is not null or item_record.status in ('complete', 'discontinued') then
      raise exception 'Only open active records can be snoozed';
    end if;
    if return_on is null or return_on <= workspace_today then
      raise exception 'Choose a return date after today';
    end if;
    update public.compliance_items set snoozed_until = return_on,
      snooze_reason = nullif(trim(reason), ''), updated_at = now() where id = target_item_id;
    event_note := 'Snoozed until ' || return_on::text || coalesce(': ' || nullif(trim(reason), ''), '');
  elsif queue_action = 'unsnooze' then
    if item_record.snoozed_until is null then return; end if;
    update public.compliance_items set snoozed_until = null, snooze_reason = null,
      updated_at = now() where id = target_item_id;
    event_note := 'Returned to work queue';
  elsif queue_action = 'archive' then
    if item_record.archived_at is not null then return; end if;
    if nullif(trim(reason), '') is null then raise exception 'Archive reason is required'; end if;
    update public.compliance_items set archived_at = now(), archived_by = auth.uid(),
      archive_reason = trim(reason), snoozed_until = null, snooze_reason = null,
      updated_at = now() where id = target_item_id;
    -- Cancel outstanding deliveries, but retain sent history and recurring rules for restore.
    update public.reminder_send_log set status = 'skipped',
      failure_reason = 'Record archived', claimed_at = null
      where item_id = target_item_id and sent_at is null and status in ('scheduled', 'queued', 'failed');
    event_note := 'Archived: ' || trim(reason);
  else
    if item_record.archived_at is null then return; end if;
    update public.compliance_items set archived_at = null, archived_by = null,
      archive_reason = null, updated_at = now() where id = target_item_id;
    -- Restore only still-eligible future deliveries cancelled by this archive.
    -- Past reminders, changed rules, and removed recipients must not be replayed.
    update public.reminder_send_log log
    set status = 'scheduled', failure_reason = null, claimed_at = null
    from public.compliance_item_reminder_rules rule, public.companies company
    where log.item_id = item_record.id
      and company.id = item_record.company_id
      and log.reminder_rule_id = rule.id and rule.item_id = item_record.id and rule.active
      and log.sent_at is null and log.status = 'skipped'
      and log.failure_reason = 'Record archived' and log.scheduled_for > now()
      and item_record.status not in ('complete', 'discontinued') and not item_record.awaiting_schedule
      and (
        (rule.trigger_type = 'on_start_date' and item_record.start_working_on = (log.scheduled_for at time zone coalesce(company.timezone, 'America/Los_Angeles'))::date)
        or (rule.trigger_type = 'days_before_expiration' and item_record.expiration_date - coalesce(rule.days_before, 0) = (log.scheduled_for at time zone coalesce(company.timezone, 'America/Los_Angeles'))::date)
        or (rule.trigger_type = 'on_specific_date' and rule.send_on = (log.scheduled_for at time zone coalesce(company.timezone, 'America/Los_Angeles'))::date)
        or (rule.trigger_type = 'repeat_after_start' and item_record.status <> 'submitted'
          and item_record.start_working_on <= (log.scheduled_for at time zone coalesce(company.timezone, 'America/Los_Angeles'))::date
          and coalesce(rule.repeat_every_days, 0) > 0
          and ((log.scheduled_for at time zone coalesce(company.timezone, 'America/Los_Angeles'))::date - item_record.start_working_on) % nullif(rule.repeat_every_days, 0) = 0)
      )
      and (
        (rule.audience in ('owner', 'external') and exists (
          select 1 from public.company_owner_codes code join public.profiles profile on profile.id = code.user_id
          where code.company_id = item_record.company_id and code.code = item_record.owner_current
            and lower(trim(profile.email)) = lower(trim(log.recipient_email))
        ))
        or (rule.audience = 'external' and exists (
          select 1 from public.compliance_item_notification_recipients recipient
          where recipient.item_id = item_record.id and recipient.recipient_type in ('additional', 'external')
            and lower(trim(recipient.recipient_email)) = lower(trim(log.recipient_email))
        ))
        or (rule.audience = 'external' and exists (
          select 1 from public.compliance_item_notification_recipients recipient
          join public.contact_group_members member on member.group_id = recipient.contact_group_id and member.company_id = item_record.company_id
          where recipient.item_id = item_record.id and recipient.recipient_type = 'group'
            and lower(trim(member.email)) = lower(trim(log.recipient_email))
        ))
      );
    event_note := 'Restored from archive';
  end if;
  insert into public.compliance_item_status_history(item_id, company_id, changed_by, from_status, to_status, notes, event_type)
    values(item_record.id, item_record.company_id, auth.uid(), item_record.status, item_record.status, event_note, queue_action);
end;
$$;
revoke all on function public.set_compliance_item_queue_state(uuid, text, date, text) from public, anon;
grant execute on function public.set_compliance_item_queue_state(uuid, text, date, text) to authenticated;

create or replace function public.complete_compliance_item_v2(
  target_item_id uuid,
  completion_date date,
  final_notes text default null,
  should_create_next boolean default true,
  next_start_working_on date default null,
  next_expiration_date date default null,
  next_record_mode text default 'automatic'
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

  if item_record.archived_at is not null then
    raise exception 'Restore this archived record before completing it';
  end if;
  if next_record_mode is null or next_record_mode not in ('automatic', 'none', 'undated', 'dated') then
    raise exception 'Choose a valid next record option';
  end if;
  if completion_date is null then
    raise exception 'Completion date is required';
  end if;
  user_can_edit_core := public.can_edit_compliance_item_core(item_record.id);
  if next_record_mode in ('dated', 'undated') and not user_can_edit_core then
    raise exception 'You do not have permission to set the next cycle';
  end if;
  if next_record_mode = 'dated' and next_expiration_date is null then
    raise exception 'Next expiration date is required';
  end if;
  if next_record_mode = 'dated' and next_start_working_on > next_expiration_date then
    raise exception 'Next start must be on or before next expiration';
  end if;

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

  if next_record_mode = 'undated' then
    resolved_next_start := null;
    resolved_next_expiration := null;
  elsif next_record_mode = 'dated' then
    resolved_next_start := next_start_working_on;
    resolved_next_expiration := next_expiration_date;
  end if;

  insert into public.compliance_item_status_history (item_id, company_id, changed_by, from_status, to_status, notes)
  values (item_record.id, item_record.company_id, current_user_id, item_record.status, 'complete', nullif(trim(coalesce(final_notes, '')), ''));

  update public.compliance_items
  set status = 'complete',
      completed_at = coalesce(completion_date, current_date),
      status_notes = coalesce(nullif(trim(coalesce(final_notes, '')), ''), status_notes),
      updated_at = now()
  where id = item_record.id;

  if should_create_next and (next_record_mode in ('dated', 'undated')
    or (next_record_mode = 'automatic' and item_record.recurrence_unit in ('years', 'months') and resolved_next_expiration is not null)) then
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
      agency_id,
      compliance_area,
      frequency_label,
      period_label,
      recurrence_unit,
      recurrence_interval,
      start_working_on,
      expiration_date,
      awaiting_schedule,
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
      item_record.agency_id,
      item_record.compliance_area,
      item_record.frequency_label,
      item_record.period_label,
      item_record.recurrence_unit,
      item_record.recurrence_interval,
      resolved_next_start,
      resolved_next_expiration,
      next_record_mode = 'undated',
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

    insert into public.compliance_item_notification_recipients (
      item_id,
      company_id,
      recipient_name,
      recipient_email,
      recipient_type,
      external_contact_id,
      contact_group_id
    )
    select
      new_item_id,
      item_record.company_id,
      recipient_name,
      recipient_email,
      recipient_type,
      external_contact_id,
      contact_group_id
    from public.compliance_item_notification_recipients
    where item_id = item_record.id
    on conflict (item_id, recipient_email) do nothing;
  end if;

  return new_item_id;
end;
$$;


revoke all on function public.complete_compliance_item_v2(uuid, date, text, boolean, date, date, text) from public, anon;
grant execute on function public.complete_compliance_item_v2(uuid, date, text, boolean, date, date, text) to authenticated;

-- Preserve existing clients, with the same authorization and archived-record checks.
create or replace function public.complete_compliance_item(
  target_item_id uuid, completion_date date, final_notes text default null,
  should_create_next boolean default true, next_start_working_on date default null,
  next_expiration_date date default null
) returns uuid language sql security invoker set search_path = public as $$
  select public.complete_compliance_item_v2(target_item_id, completion_date, final_notes,
    should_create_next, next_start_working_on, next_expiration_date, 'automatic');
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

  select coalesce(company.timezone, 'America/Los_Angeles')
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
      and item.archived_at is null
      and not item.awaiting_schedule
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

    union all

    select
      due_rules.*,
      lower(trim(group_member.email)) as recipient_email
    from due_rules
    join public.compliance_item_notification_recipients recipient
      on recipient.item_id = due_rules.item_id
     and recipient.recipient_type = 'group'
    join public.contact_group_members group_member
      on group_member.company_id = due_rules.company_id
     and group_member.group_id = recipient.contact_group_id
    where due_rules.audience = 'external'
      and nullif(trim(coalesce(group_member.email, '')), '') is not null
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

comment on function public.schedule_due_reminders_for_company(uuid, date) is
  'Queues due reminders for the primary assigned owner; supporting owners receive reminders only when explicitly added as recipients.';

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
    join public.compliance_items current_item on current_item.id = log.item_id
    where (target_company_id is null or log.company_id = target_company_id)
      and current_item.archived_at is null
      and not current_item.awaiting_schedule
      and current_item.status not in ('complete', 'discontinued')
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
    for update of log skip locked
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


revoke all on function public.claim_due_reminders(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(uuid, integer) to service_role;

revoke all on function public.complete_compliance_item(uuid, date, text, boolean, date, date) from public, anon;
grant execute on function public.complete_compliance_item(uuid, date, text, boolean, date, date) to authenticated;
-- Scheduling remains an internal helper called by the existing authorized wrappers.
revoke all on function public.schedule_due_reminders_for_company(uuid, date) from public, anon, authenticated;

-- Separate queue visibility changes from operational edits during re-import.
create or replace function public.compliance_item_has_customer_activity(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.compliance_items item
    where item.id = target_item_id
      and (
        item.last_non_import_activity_at is not null
        or item.completed_at is not null
        or item.discontinued_at is not null
      )
  )
  or exists (
    select 1
    from public.compliance_item_status_history history
    where history.item_id = target_item_id
      and history.event_type not in ('snooze', 'unsnooze')
  )
  or exists (
    select 1
    from public.compliance_item_notification_recipients recipient
    where recipient.item_id = target_item_id
  )
  or exists (
    select 1
    from public.compliance_item_reminder_rules rule
    where rule.item_id = target_item_id
      and (
        rule.trigger_type = 'repeat_after_start'
        or rule.active = false
        or (rule.trigger_type = 'days_before_expiration' and rule.days_before is distinct from 14)
      )
  );
$$;
