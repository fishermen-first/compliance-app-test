alter table public.company_import_runs
  add column if not exists mode text not null default 'legacy',
  add column if not exists status text not null default 'completed',
  add column if not exists detected_format text,
  add column if not exists template_version text,
  add column if not exists parser_version text,
  add column if not exists issue_count integer not null default 0,
  add column if not exists safe_create_count integer not null default 0,
  add column if not exists safe_update_count integer not null default 0,
  add column if not exists skipped_count integer not null default 0,
  add column if not exists applied_from_run_id uuid references public.company_import_runs(id) on delete set null,
  add column if not exists applied_run_id uuid references public.company_import_runs(id) on delete set null,
  add column if not exists applied_by uuid references public.profiles(id) on delete set null,
  add column if not exists applied_at timestamptz,
  add column if not exists summary jsonb not null default '{}'::jsonb;

alter table public.company_import_runs
  drop constraint if exists company_import_runs_mode_check,
  drop constraint if exists company_import_runs_status_check,
  drop constraint if exists company_import_runs_issue_count_check,
  drop constraint if exists company_import_runs_safe_create_count_check,
  drop constraint if exists company_import_runs_safe_update_count_check,
  drop constraint if exists company_import_runs_skipped_count_check;

alter table public.company_import_runs
  add constraint company_import_runs_mode_check
  check (mode in ('legacy', 'dry_run', 'apply')),
  add constraint company_import_runs_status_check
  check (status in ('parsed', 'review_required', 'ready_to_apply', 'applying', 'completed', 'failed')),
  add constraint company_import_runs_issue_count_check check (issue_count >= 0),
  add constraint company_import_runs_safe_create_count_check check (safe_create_count >= 0),
  add constraint company_import_runs_safe_update_count_check check (safe_update_count >= 0),
  add constraint company_import_runs_skipped_count_check check (skipped_count >= 0);

create index if not exists company_import_runs_company_mode_created_idx
  on public.company_import_runs(company_id, mode, created_at desc);

alter table public.compliance_items
  add column if not exists template_item_key text,
  add column if not exists source_row_json jsonb,
  add column if not exists source_row_hash text,
  add column if not exists source_vessel_or_scope text,
  add column if not exists source_owner_code text,
  add column if not exists source_item_name text,
  add column if not exists source_item_number text,
  add column if not exists source_agency_type text,
  add column if not exists source_compliance_area text,
  add column if not exists source_frequency_label text,
  add column if not exists source_recurrence_unit public.recurrence_unit,
  add column if not exists source_recurrence_interval integer,
  add column if not exists source_start_working_on date,
  add column if not exists source_expiration_date date,
  add column if not exists last_import_run_id uuid references public.company_import_runs(id) on delete set null,
  add column if not exists last_imported_at timestamptz,
  add column if not exists last_import_action text,
  add column if not exists last_non_import_activity_at timestamptz;

alter table public.compliance_items
  drop constraint if exists compliance_items_last_import_action_check;

alter table public.compliance_items
  add constraint compliance_items_last_import_action_check
  check (
    last_import_action is null
    or last_import_action in ('created', 'updated', 'source_only_update', 'skipped')
  );

create index if not exists compliance_items_company_template_item_key_idx
  on public.compliance_items(company_id, template_item_key)
  where template_item_key is not null;

create index if not exists compliance_items_last_import_run_idx
  on public.compliance_items(last_import_run_id)
  where last_import_run_id is not null;

create table if not exists public.compliance_item_import_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  compliance_item_id uuid not null references public.compliance_items(id) on delete cascade,
  template_item_key text,
  source_fingerprint text not null,
  source_sheet text,
  source_row_number integer,
  source_row_hash text,
  source_row_json jsonb not null default '{}'::jsonb,
  normalized_item_name text,
  normalized_vessel_or_scope text,
  normalized_owner_code text,
  normalized_item_number text,
  normalized_agency_type text,
  first_import_run_id uuid references public.company_import_runs(id) on delete set null,
  last_import_run_id uuid references public.company_import_runs(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists compliance_item_import_sources_company_fingerprint_idx
  on public.compliance_item_import_sources(company_id, source_fingerprint)
  where active;

create index if not exists compliance_item_import_sources_company_template_idx
  on public.compliance_item_import_sources(company_id, template_item_key)
  where active and template_item_key is not null;

create index if not exists compliance_item_import_sources_item_idx
  on public.compliance_item_import_sources(compliance_item_id);

alter table public.compliance_item_import_sources enable row level security;

drop policy if exists "FF admins can view import sources" on public.compliance_item_import_sources;
create policy "FF admins can view import sources" on public.compliance_item_import_sources
  for select
  to authenticated
  using ((select public.is_app_admin()));

drop policy if exists "FF admins can manage import sources" on public.compliance_item_import_sources;
create policy "FF admins can manage import sources" on public.compliance_item_import_sources
  for all
  to authenticated
  using ((select public.is_app_admin()))
  with check ((select public.is_app_admin()));

create table if not exists public.compliance_import_run_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.company_import_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_sheet text,
  source_row_number integer,
  source_row_hash text,
  source_fingerprint text not null,
  template_item_key text,
  source_row_json jsonb not null default '{}'::jsonb,
  parsed_record jsonb not null default '{}'::jsonb,
  source_vessel_or_scope text,
  source_owner_code text,
  source_item_name text,
  source_item_number text,
  source_agency_type text,
  source_compliance_area text,
  source_frequency_label text,
  source_recurrence_unit public.recurrence_unit,
  source_recurrence_interval integer,
  source_start_working_on date,
  source_expiration_date date,
  normalized_item_name text,
  normalized_vessel_or_scope text,
  normalized_owner_code text,
  normalized_item_number text,
  normalized_agency_type text,
  matched_item_id uuid references public.compliance_items(id) on delete set null,
  match_strategy text,
  proposed_action text not null default 'issue',
  is_safe_to_apply boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.compliance_import_run_rows
  drop constraint if exists compliance_import_run_rows_match_strategy_check,
  drop constraint if exists compliance_import_run_rows_proposed_action_check;

alter table public.compliance_import_run_rows
  add constraint compliance_import_run_rows_match_strategy_check
  check (
    match_strategy is null
    or match_strategy in ('template_item_key', 'source_fingerprint', 'natural_key', 'new_item')
  ),
  add constraint compliance_import_run_rows_proposed_action_check
  check (proposed_action in ('create_item', 'update_source_fields', 'issue', 'skip'));

create index if not exists compliance_import_run_rows_run_idx
  on public.compliance_import_run_rows(import_run_id, source_row_number);

create index if not exists compliance_import_run_rows_company_fingerprint_idx
  on public.compliance_import_run_rows(company_id, source_fingerprint);

alter table public.compliance_import_run_rows enable row level security;

drop policy if exists "FF admins can view import run rows" on public.compliance_import_run_rows;
create policy "FF admins can view import run rows" on public.compliance_import_run_rows
  for select
  to authenticated
  using ((select public.is_app_admin()));

drop policy if exists "FF admins can manage import run rows" on public.compliance_import_run_rows;
create policy "FF admins can manage import run rows" on public.compliance_import_run_rows
  for all
  to authenticated
  using ((select public.is_app_admin()))
  with check ((select public.is_app_admin()));

create table if not exists public.compliance_import_issues (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.company_import_runs(id) on delete cascade,
  import_run_row_id uuid references public.compliance_import_run_rows(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_row_number integer,
  issue_type text not null,
  severity text not null default 'review',
  message text not null,
  matched_item_id uuid references public.compliance_items(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  decision text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.compliance_import_issues
  drop constraint if exists compliance_import_issues_severity_check,
  drop constraint if exists compliance_import_issues_status_check;

alter table public.compliance_import_issues
  add constraint compliance_import_issues_severity_check
  check (severity in ('info', 'review', 'fix', 'blocker')),
  add constraint compliance_import_issues_status_check
  check (status in ('open', 'approved', 'ignored', 'resolved'));

create index if not exists compliance_import_issues_run_idx
  on public.compliance_import_issues(import_run_id, source_row_number);

create index if not exists compliance_import_issues_company_status_idx
  on public.compliance_import_issues(company_id, status, issue_type);

alter table public.compliance_import_issues enable row level security;

drop policy if exists "FF admins can view import issues" on public.compliance_import_issues;
create policy "FF admins can view import issues" on public.compliance_import_issues
  for select
  to authenticated
  using ((select public.is_app_admin()));

drop policy if exists "FF admins can manage import issues" on public.compliance_import_issues;
create policy "FF admins can manage import issues" on public.compliance_import_issues
  for all
  to authenticated
  using ((select public.is_app_admin()))
  with check ((select public.is_app_admin()));

create or replace function public.import_v2_normalize(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(lower(trim(coalesce(value, ''))), '\s+', ' ', 'g'), '');
$$;

create or replace function public.import_v2_is_company_wide_scope(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(public.import_v2_normalize(value), '') in ('', 'asmg', 'ashco', 'company', 'office');
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

  if old.status is distinct from new.status
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

drop trigger if exists mark_compliance_item_workflow_activity on public.compliance_items;
create trigger mark_compliance_item_workflow_activity
  before update on public.compliance_items
  for each row
  execute function public.mark_compliance_item_workflow_activity();

create or replace function public.touch_compliance_item_from_child_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_item_id uuid;
begin
  if current_setting('app.import_v2_apply', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  target_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;

  update public.compliance_items
  set last_non_import_activity_at = now(),
      updated_at = now()
  where id = target_item_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists touch_item_from_reminder_rule_workflow on public.compliance_item_reminder_rules;
create trigger touch_item_from_reminder_rule_workflow
  after insert or update or delete on public.compliance_item_reminder_rules
  for each row
  execute function public.touch_compliance_item_from_child_workflow();

drop trigger if exists touch_item_from_notification_recipient_workflow on public.compliance_item_notification_recipients;
create trigger touch_item_from_notification_recipient_workflow
  after insert or update or delete on public.compliance_item_notification_recipients
  for each row
  execute function public.touch_compliance_item_from_child_workflow();

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

create or replace function public.dry_run_compliance_workbook_import(
  target_company_id uuid,
  target_sheet text,
  workbook_name text default null,
  detected_format text default 'legacy_due_dates',
  template_version text default null,
  parser_version text default null,
  records jsonb default '[]'::jsonb,
  parse_summary jsonb default '{}'::jsonb,
  imported_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  import_run_id uuid;
  row_record jsonb;
  run_row_id uuid;
  candidate_ids uuid[];
  candidate_count integer;
  matched_item uuid;
  match_kind text;
  proposed text;
  row_is_safe boolean;
  row_issue_count integer;
  source_fingerprint text;
  source_hash text;
  previous_hash text;
  template_key text;
  normalized_item_name text;
  normalized_scope text;
  normalized_owner text;
  normalized_item_number text;
  normalized_agency text;
  customer_activity boolean;
  protected_change boolean;
  parser_warning jsonb;
begin
  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'Company not found';
  end if;

  if records is null or jsonb_typeof(records) <> 'array' then
    raise exception 'Import records must be a JSON array';
  end if;

  insert into public.company_import_runs (
    company_id,
    sheet_name,
    workbook_name,
    record_count,
    vessel_count,
    owner_code_count,
    warning_count,
    imported_by,
    mode,
    status,
    detected_format,
    template_version,
    parser_version,
    summary
  )
  values (
    target_company_id,
    coalesce(nullif(trim(target_sheet), ''), 'Sheet1'),
    nullif(trim(coalesce(workbook_name, '')), ''),
    jsonb_array_length(records),
    coalesce((parse_summary->>'vesselCount')::integer, 0),
    coalesce(jsonb_array_length(coalesce(parse_summary->'ownerCodes', '[]'::jsonb)), 0),
    coalesce(jsonb_array_length(coalesce(parse_summary->'warnings', '[]'::jsonb)), 0),
    imported_by,
    'dry_run',
    'parsed',
    detected_format,
    template_version,
    parser_version,
    coalesce(parse_summary, '{}'::jsonb)
  )
  returning id into import_run_id;

  if jsonb_typeof(coalesce(parse_summary->'warnings', '[]'::jsonb)) = 'array' then
    for parser_warning in
      select value from jsonb_array_elements(coalesce(parse_summary->'warnings', '[]'::jsonb))
    loop
      insert into public.compliance_import_issues (
        import_run_id,
        company_id,
        source_row_number,
        issue_type,
        severity,
        message,
        details
      )
      values (
        import_run_id,
        target_company_id,
        nullif(parser_warning->>'row', '')::integer,
        'parser_warning',
        case
          when lower(coalesce(parser_warning->>'issue', '')) like '%skipped%' then 'fix'
          when lower(coalesce(parser_warning->>'issue', '')) like '%outlier%' then 'fix'
          else 'review'
        end,
        coalesce(parser_warning->>'issue', 'Parser warning'),
        parser_warning
      );
    end loop;
  end if;

  for row_record in select value from jsonb_array_elements(records)
  loop
    source_fingerprint := nullif(row_record->>'sourceFingerprint', '');
    if source_fingerprint is null then
      raise exception 'Import record is missing sourceFingerprint';
    end if;

    source_hash := nullif(row_record->>'sourceRowHash', '');
    template_key := nullif(row_record->>'templateItemKey', '');
    normalized_item_name := nullif(row_record#>>'{matchCandidate,itemName}', '');
    normalized_scope := nullif(row_record#>>'{matchCandidate,vesselOrScope}', '');
    normalized_owner := nullif(row_record#>>'{matchCandidate,ownerCode}', '');
    normalized_item_number := nullif(row_record#>>'{matchCandidate,itemNumber}', '');
    normalized_agency := nullif(row_record#>>'{matchCandidate,agencyType}', '');
    matched_item := null;
    match_kind := null;
    proposed := 'issue';
    row_is_safe := false;
    row_issue_count := 0;

    insert into public.compliance_import_run_rows (
      import_run_id,
      company_id,
      source_sheet,
      source_row_number,
      source_row_hash,
      source_fingerprint,
      template_item_key,
      source_row_json,
      parsed_record,
      source_vessel_or_scope,
      source_owner_code,
      source_item_name,
      source_item_number,
      source_agency_type,
      source_compliance_area,
      source_frequency_label,
      source_recurrence_unit,
      source_recurrence_interval,
      source_start_working_on,
      source_expiration_date,
      normalized_item_name,
      normalized_vessel_or_scope,
      normalized_owner_code,
      normalized_item_number,
      normalized_agency_type
    )
    values (
      import_run_id,
      target_company_id,
      target_sheet,
      nullif(row_record->>'sourceRowNumber', '')::integer,
      source_hash,
      source_fingerprint,
      template_key,
      coalesce(row_record->'sourceRowJson', '{}'::jsonb),
      row_record,
      nullif(coalesce(row_record->>'vesselOrScope', row_record->>'vessel'), ''),
      nullif(coalesce(row_record->>'ownerCurrent', row_record->>'ownerCode'), ''),
      nullif(row_record->>'itemName', ''),
      nullif(row_record->>'itemNumber', ''),
      nullif(row_record->>'agencyType', ''),
      nullif(row_record->>'complianceArea', ''),
      nullif(row_record->>'frequencyLabel', ''),
      nullif(row_record->>'recurrenceUnit', '')::public.recurrence_unit,
      nullif(row_record->>'recurrenceInterval', '')::integer,
      nullif(row_record->>'startWorkingOn', '')::date,
      nullif(row_record->>'expirationDate', '')::date,
      normalized_item_name,
      normalized_scope,
      normalized_owner,
      normalized_item_number,
      normalized_agency
    )
    returning id into run_row_id;

    if template_key is not null then
      select array_agg(distinct id)
      into candidate_ids
      from (
        select source.compliance_item_id as id
        from public.compliance_item_import_sources source
        where source.company_id = target_company_id
          and source.active
          and source.template_item_key = template_key
        union
        select item.id
        from public.compliance_items item
        where item.company_id = target_company_id
          and item.template_item_key = template_key
      ) candidates;

      candidate_count := coalesce(array_length(candidate_ids, 1), 0);
      if candidate_count = 1 then
        matched_item := candidate_ids[1];
        match_kind := 'template_item_key';
      elsif candidate_count > 1 then
        row_issue_count := row_issue_count + 1;
        insert into public.compliance_import_issues (
          import_run_id,
          import_run_row_id,
          company_id,
          source_row_number,
          issue_type,
          severity,
          message,
          details
        )
        values (
          import_run_id,
          run_row_id,
          target_company_id,
          nullif(row_record->>'sourceRowNumber', '')::integer,
          'multiple_match',
          'blocker',
          'Template item key matches multiple existing items.',
          jsonb_build_object('template_item_key', template_key, 'candidate_item_ids', candidate_ids)
        );
      end if;
    end if;

    if matched_item is null and row_issue_count = 0 then
      select array_agg(distinct source.compliance_item_id)
      into candidate_ids
      from public.compliance_item_import_sources source
      where source.company_id = target_company_id
        and source.active
        and source.source_fingerprint = source_fingerprint;

      candidate_count := coalesce(array_length(candidate_ids, 1), 0);
      if candidate_count = 1 then
        matched_item := candidate_ids[1];
        match_kind := 'source_fingerprint';
      elsif candidate_count > 1 then
        row_issue_count := row_issue_count + 1;
        insert into public.compliance_import_issues (
          import_run_id,
          import_run_row_id,
          company_id,
          source_row_number,
          issue_type,
          severity,
          message,
          details
        )
        values (
          import_run_id,
          run_row_id,
          target_company_id,
          nullif(row_record->>'sourceRowNumber', '')::integer,
          'multiple_match',
          'blocker',
          'Source fingerprint matches multiple existing items.',
          jsonb_build_object('source_fingerprint', source_fingerprint, 'candidate_item_ids', candidate_ids)
        );
      end if;
    end if;

    if matched_item is null and row_issue_count = 0 then
      select array_agg(id)
      into candidate_ids
      from (
        select item.id
        from public.compliance_items item
        left join public.vessels vessel on vessel.id = item.vessel_id
        where item.company_id = target_company_id
          and item.discontinued_at is null
          and public.import_v2_normalize(item.item_name) is not distinct from normalized_item_name
          and public.import_v2_normalize(item.owner_current) is not distinct from normalized_owner
          and public.import_v2_normalize(item.item_number) is not distinct from normalized_item_number
          and public.import_v2_normalize(item.agency_type) is not distinct from normalized_agency
          and (
            public.import_v2_normalize(vessel.name) is not distinct from normalized_scope
            or (item.vessel_id is null and public.import_v2_is_company_wide_scope(normalized_scope))
          )
      ) natural_candidates;

      candidate_count := coalesce(array_length(candidate_ids, 1), 0);
      if candidate_count = 1 then
        matched_item := candidate_ids[1];
        match_kind := 'natural_key';
      elsif candidate_count > 1 then
        row_issue_count := row_issue_count + 1;
        insert into public.compliance_import_issues (
          import_run_id,
          import_run_row_id,
          company_id,
          source_row_number,
          issue_type,
          severity,
          message,
          details
        )
        values (
          import_run_id,
          run_row_id,
          target_company_id,
          nullif(row_record->>'sourceRowNumber', '')::integer,
          'multiple_match',
          'blocker',
          'Natural key matches multiple active items; row was not matched by row number.',
          jsonb_build_object('candidate_item_ids', candidate_ids, 'source_fingerprint', source_fingerprint)
        );
      end if;
    end if;

    if matched_item is null and row_issue_count = 0 then
      proposed := 'create_item';
      match_kind := 'new_item';
      row_is_safe := true;
    elsif matched_item is not null then
      select coalesce(source.source_row_hash, item.source_row_hash)
      into previous_hash
      from public.compliance_items item
      left join public.compliance_item_import_sources source
        on source.compliance_item_id = item.id
       and source.active
       and source.source_fingerprint = source_fingerprint
      where item.id = matched_item
      order by source.last_seen_at desc nulls last
      limit 1;

      customer_activity := public.compliance_item_has_customer_activity(matched_item);

      select exists (
        select 1
        from public.compliance_items item
        where item.id = matched_item
          and customer_activity
          and (
            item.status::text is distinct from coalesce(nullif(row_record->>'status', ''), item.status::text)
            or item.status_notes is distinct from coalesce(nullif(row_record->>'statusNotes', ''), item.status_notes)
            or item.instructions is distinct from coalesce(nullif(row_record->>'instructions', ''), item.instructions)
          )
      )
      into protected_change;

      if previous_hash is not null and source_hash is not null and previous_hash <> source_hash then
        row_issue_count := row_issue_count + 1;
        insert into public.compliance_import_issues (
          import_run_id,
          import_run_row_id,
          company_id,
          source_row_number,
          issue_type,
          severity,
          message,
          matched_item_id,
          details
        )
        values (
          import_run_id,
          run_row_id,
          target_company_id,
          nullif(row_record->>'sourceRowNumber', '')::integer,
          'row_changed',
          'review',
          'Matched row content changed since the previous import; source-field update requires review.',
          matched_item,
          jsonb_build_object('previous_hash', previous_hash, 'next_hash', source_hash)
        );
      end if;

      if protected_change then
        row_issue_count := row_issue_count + 1;
        insert into public.compliance_import_issues (
          import_run_id,
          import_run_row_id,
          company_id,
          source_row_number,
          issue_type,
          severity,
          message,
          matched_item_id,
          details
        )
        values (
          import_run_id,
          run_row_id,
          target_company_id,
          nullif(row_record->>'sourceRowNumber', '')::integer,
          'protected_workflow_field_changed',
          'blocker',
          'Workbook row includes workflow-owned values that differ after customer activity.',
          matched_item,
          jsonb_build_object('protected_fields', array['status', 'status_notes', 'instructions'])
        );
      end if;

      proposed := case when row_issue_count = 0 then 'update_source_fields' else 'issue' end;
      row_is_safe := row_issue_count = 0;
    end if;

    update public.compliance_import_run_rows
    set matched_item_id = matched_item,
        match_strategy = match_kind,
        proposed_action = proposed,
        is_safe_to_apply = row_is_safe
    where id = run_row_id;
  end loop;

  update public.company_import_runs run
  set issue_count = (
        select count(*)::integer
        from public.compliance_import_issues issue
        where issue.import_run_id = import_run_id
      ),
      safe_create_count = (
        select count(*)::integer
        from public.compliance_import_run_rows run_row
        where run_row.import_run_id = import_run_id
          and run_row.is_safe_to_apply
          and run_row.proposed_action = 'create_item'
      ),
      safe_update_count = (
        select count(*)::integer
        from public.compliance_import_run_rows run_row
        where run_row.import_run_id = import_run_id
          and run_row.is_safe_to_apply
          and run_row.proposed_action = 'update_source_fields'
      ),
      skipped_count = (
        select count(*)::integer
        from public.compliance_import_run_rows run_row
        where run_row.import_run_id = import_run_id
          and not run_row.is_safe_to_apply
      ),
      status = case
        when exists (
          select 1
          from public.compliance_import_issues issue
          where issue.import_run_id = import_run_id
        ) then 'review_required'
        else 'ready_to_apply'
      end
  where run.id = import_run_id;

  return import_run_id;
end;
$$;

create or replace function public.apply_compliance_workbook_import(
  target_import_run_id uuid,
  approved_issue_ids uuid[] default '{}',
  applied_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dry_run record;
  apply_run_id uuid;
  import_row record;
  target_vessel_id uuid;
  target_item_id uuid;
  has_activity boolean;
  created_count integer := 0;
  updated_count integer := 0;
begin
  select *
  into dry_run
  from public.company_import_runs
  where id = target_import_run_id
  for update;

  if not found then
    raise exception 'Import run not found';
  end if;

  if dry_run.mode <> 'dry_run' then
    raise exception 'Only dry-run imports can be applied';
  end if;

  insert into public.company_import_runs (
    company_id,
    sheet_name,
    workbook_name,
    record_count,
    vessel_count,
    owner_code_count,
    warning_count,
    imported_by,
    mode,
    status,
    detected_format,
    template_version,
    parser_version,
    applied_from_run_id,
    applied_by,
    summary
  )
  values (
    dry_run.company_id,
    dry_run.sheet_name,
    dry_run.workbook_name,
    dry_run.record_count,
    dry_run.vessel_count,
    dry_run.owner_code_count,
    dry_run.warning_count,
    coalesce(applied_by, dry_run.imported_by),
    'apply',
    'applying',
    dry_run.detected_format,
    dry_run.template_version,
    dry_run.parser_version,
    dry_run.id,
    applied_by,
    dry_run.summary
  )
  returning id into apply_run_id;

  perform set_config('app.import_v2_apply', 'on', true);

  for import_row in
    select *
    from public.compliance_import_run_rows
    where import_run_id = dry_run.id
      and is_safe_to_apply
      and proposed_action in ('create_item', 'update_source_fields')
    order by source_row_number nulls last, created_at
  loop
    target_vessel_id := null;

    if not public.import_v2_is_company_wide_scope(import_row.source_vessel_or_scope) then
      insert into public.vessels (company_id, name, active, updated_at)
      values (dry_run.company_id, import_row.source_vessel_or_scope, true, now())
      on conflict (company_id, name) do update set
        active = true,
        updated_at = now()
      returning id into target_vessel_id;
    end if;

    if nullif(trim(coalesce(import_row.source_owner_code, '')), '') is not null then
      insert into public.company_owner_codes (company_id, code, updated_at)
      values (dry_run.company_id, import_row.source_owner_code, now())
      on conflict (company_id, code) do update set updated_at = now();
    end if;

    if import_row.proposed_action = 'create_item' then
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
        status_notes,
        instructions,
        source_sheet,
        source_row_number,
        template_item_key,
        source_row_json,
        source_row_hash,
        source_vessel_or_scope,
        source_owner_code,
        source_item_name,
        source_item_number,
        source_agency_type,
        source_compliance_area,
        source_frequency_label,
        source_recurrence_unit,
        source_recurrence_interval,
        source_start_working_on,
        source_expiration_date,
        last_import_run_id,
        last_imported_at,
        last_import_action
      )
      values (
        dry_run.company_id,
        target_vessel_id,
        import_row.source_owner_code,
        import_row.source_owner_code,
        import_row.source_item_name,
        import_row.source_item_number,
        import_row.source_agency_type,
        coalesce(import_row.source_compliance_area, 'Other'),
        import_row.source_frequency_label,
        coalesce(import_row.source_recurrence_unit, 'none'::public.recurrence_unit),
        import_row.source_recurrence_interval,
        import_row.source_start_working_on,
        import_row.source_expiration_date,
        coalesce(nullif(import_row.parsed_record->>'status', ''), 'not_started')::public.compliance_item_status,
        nullif(import_row.parsed_record->>'statusNotes', ''),
        nullif(import_row.parsed_record->>'instructions', ''),
        dry_run.sheet_name,
        import_row.source_row_number,
        import_row.template_item_key,
        import_row.source_row_json,
        import_row.source_row_hash,
        import_row.source_vessel_or_scope,
        import_row.source_owner_code,
        import_row.source_item_name,
        import_row.source_item_number,
        import_row.source_agency_type,
        import_row.source_compliance_area,
        import_row.source_frequency_label,
        import_row.source_recurrence_unit,
        import_row.source_recurrence_interval,
        import_row.source_start_working_on,
        import_row.source_expiration_date,
        apply_run_id,
        now(),
        'created'
      )
      returning id into target_item_id;

      perform public.create_default_reminder_rules(target_item_id);
      created_count := created_count + 1;
    else
      target_item_id := import_row.matched_item_id;
      has_activity := public.compliance_item_has_customer_activity(target_item_id);

      if has_activity then
        update public.compliance_items
        set template_item_key = coalesce(import_row.template_item_key, template_item_key),
            source_sheet = dry_run.sheet_name,
            source_row_number = import_row.source_row_number,
            source_row_json = import_row.source_row_json,
            source_row_hash = import_row.source_row_hash,
            source_vessel_or_scope = import_row.source_vessel_or_scope,
            source_owner_code = import_row.source_owner_code,
            source_item_name = import_row.source_item_name,
            source_item_number = import_row.source_item_number,
            source_agency_type = import_row.source_agency_type,
            source_compliance_area = import_row.source_compliance_area,
            source_frequency_label = import_row.source_frequency_label,
            source_recurrence_unit = import_row.source_recurrence_unit,
            source_recurrence_interval = import_row.source_recurrence_interval,
            source_start_working_on = import_row.source_start_working_on,
            source_expiration_date = import_row.source_expiration_date,
            last_import_run_id = apply_run_id,
            last_imported_at = now(),
            last_import_action = 'source_only_update',
            updated_at = now()
        where id = target_item_id;
      else
        update public.compliance_items
        set vessel_id = target_vessel_id,
            owner_raw = import_row.source_owner_code,
            owner_current = import_row.source_owner_code,
            item_name = import_row.source_item_name,
            item_number = import_row.source_item_number,
            agency_type = import_row.source_agency_type,
            compliance_area = coalesce(import_row.source_compliance_area, 'Other'),
            frequency_label = import_row.source_frequency_label,
            recurrence_unit = coalesce(import_row.source_recurrence_unit, 'none'::public.recurrence_unit),
            recurrence_interval = import_row.source_recurrence_interval,
            start_working_on = import_row.source_start_working_on,
            expiration_date = import_row.source_expiration_date,
            status = coalesce(nullif(import_row.parsed_record->>'status', ''), status::text)::public.compliance_item_status,
            status_notes = coalesce(nullif(import_row.parsed_record->>'statusNotes', ''), status_notes),
            instructions = coalesce(nullif(import_row.parsed_record->>'instructions', ''), instructions),
            source_sheet = dry_run.sheet_name,
            source_row_number = import_row.source_row_number,
            template_item_key = coalesce(import_row.template_item_key, template_item_key),
            source_row_json = import_row.source_row_json,
            source_row_hash = import_row.source_row_hash,
            source_vessel_or_scope = import_row.source_vessel_or_scope,
            source_owner_code = import_row.source_owner_code,
            source_item_name = import_row.source_item_name,
            source_item_number = import_row.source_item_number,
            source_agency_type = import_row.source_agency_type,
            source_compliance_area = import_row.source_compliance_area,
            source_frequency_label = import_row.source_frequency_label,
            source_recurrence_unit = import_row.source_recurrence_unit,
            source_recurrence_interval = import_row.source_recurrence_interval,
            source_start_working_on = import_row.source_start_working_on,
            source_expiration_date = import_row.source_expiration_date,
            last_import_run_id = apply_run_id,
            last_imported_at = now(),
            last_import_action = 'updated',
            updated_at = now()
        where id = target_item_id;
      end if;

      updated_count := updated_count + 1;
    end if;

    update public.compliance_item_import_sources
    set template_item_key = import_row.template_item_key,
        source_sheet = dry_run.sheet_name,
        source_row_number = import_row.source_row_number,
        source_row_hash = import_row.source_row_hash,
        source_row_json = import_row.source_row_json,
        normalized_item_name = import_row.normalized_item_name,
        normalized_vessel_or_scope = import_row.normalized_vessel_or_scope,
        normalized_owner_code = import_row.normalized_owner_code,
        normalized_item_number = import_row.normalized_item_number,
        normalized_agency_type = import_row.normalized_agency_type,
        last_import_run_id = apply_run_id,
        last_seen_at = now(),
        active = true
    where company_id = dry_run.company_id
      and compliance_item_id = target_item_id
      and source_fingerprint = import_row.source_fingerprint;

    if not found then
      insert into public.compliance_item_import_sources (
        company_id,
        compliance_item_id,
        template_item_key,
        source_fingerprint,
        source_sheet,
        source_row_number,
        source_row_hash,
        source_row_json,
        normalized_item_name,
        normalized_vessel_or_scope,
        normalized_owner_code,
        normalized_item_number,
        normalized_agency_type,
        first_import_run_id,
        last_import_run_id
      )
      values (
        dry_run.company_id,
        target_item_id,
        import_row.template_item_key,
        import_row.source_fingerprint,
        dry_run.sheet_name,
        import_row.source_row_number,
        import_row.source_row_hash,
        import_row.source_row_json,
        import_row.normalized_item_name,
        import_row.normalized_vessel_or_scope,
        import_row.normalized_owner_code,
        import_row.normalized_item_number,
        import_row.normalized_agency_type,
        apply_run_id,
        apply_run_id
      );
    end if;
  end loop;

  update public.company_import_runs
  set status = 'completed',
      safe_create_count = created_count,
      safe_update_count = updated_count,
      skipped_count = greatest(record_count - created_count - updated_count, 0),
      issue_count = (
        select count(*)::integer
        from public.compliance_import_issues issue
        where issue.import_run_id = dry_run.id
          and issue.status = 'open'
      ),
      applied_at = now(),
      summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
        'appliedFromRunId', dry_run.id,
        'createdCount', created_count,
        'updatedCount', updated_count
      )
  where id = apply_run_id;

  update public.company_import_runs
  set applied_run_id = apply_run_id,
      applied_at = now(),
      status = 'completed'
  where id = dry_run.id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    dry_run.company_id,
    applied_by,
    'company_import_run',
    apply_run_id,
    'compliance_workbook_import_v2_applied',
    jsonb_build_object('dry_run_id', dry_run.id, 'created_count', created_count, 'updated_count', updated_count)
  );

  return apply_run_id;
end;
$$;

revoke execute on function public.dry_run_compliance_workbook_import(uuid, text, text, text, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.apply_compliance_workbook_import(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.dry_run_compliance_workbook_import(uuid, text, text, text, text, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public.apply_compliance_workbook_import(uuid, uuid[], uuid) to service_role;
