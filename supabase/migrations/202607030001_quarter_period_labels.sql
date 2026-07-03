alter table public.compliance_items
  add column if not exists period_label text,
  add column if not exists source_period_label text;

alter table public.compliance_items
  drop constraint if exists compliance_items_period_label_check,
  drop constraint if exists compliance_items_source_period_label_check;

alter table public.compliance_items
  add constraint compliance_items_period_label_check
  check (period_label is null or period_label in ('Q1', 'Q2', 'Q3', 'Q4')),
  add constraint compliance_items_source_period_label_check
  check (source_period_label is null or source_period_label in ('Q1', 'Q2', 'Q3', 'Q4'));

alter table public.compliance_import_run_rows
  add column if not exists source_period_label text,
  add column if not exists normalized_period_label text;

alter table public.compliance_import_run_rows
  drop constraint if exists compliance_import_run_rows_source_period_label_check,
  drop constraint if exists compliance_import_run_rows_normalized_period_label_check;

alter table public.compliance_import_run_rows
  add constraint compliance_import_run_rows_source_period_label_check
  check (source_period_label is null or source_period_label in ('Q1', 'Q2', 'Q3', 'Q4')),
  add constraint compliance_import_run_rows_normalized_period_label_check
  check (normalized_period_label is null or normalized_period_label in ('Q1', 'Q2', 'Q3', 'Q4'));

alter table public.compliance_item_import_sources
  add column if not exists source_period_label text,
  add column if not exists normalized_period_label text;

alter table public.compliance_item_import_sources
  drop constraint if exists compliance_item_import_sources_source_period_label_check,
  drop constraint if exists compliance_item_import_sources_normalized_period_label_check;

alter table public.compliance_item_import_sources
  add constraint compliance_item_import_sources_source_period_label_check
  check (source_period_label is null or source_period_label in ('Q1', 'Q2', 'Q3', 'Q4')),
  add constraint compliance_item_import_sources_normalized_period_label_check
  check (normalized_period_label is null or normalized_period_label in ('Q1', 'Q2', 'Q3', 'Q4'));

create index if not exists compliance_items_company_period_label_idx
  on public.compliance_items(company_id, period_label)
  where period_label is not null;

create index if not exists compliance_item_import_sources_company_template_period_idx
  on public.compliance_item_import_sources(company_id, template_item_key, normalized_period_label)
  where active and template_item_key is not null;

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
  source_period_label text;
  normalized_period_label text;
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
    source_period_label := nullif(row_record->>'periodLabel', '');
    normalized_period_label := source_period_label;
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
      source_period_label,
      source_recurrence_unit,
      source_recurrence_interval,
      source_start_working_on,
      source_expiration_date,
      normalized_item_name,
      normalized_vessel_or_scope,
      normalized_owner_code,
      normalized_item_number,
      normalized_agency_type,
      normalized_period_label
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
      source_period_label,
      nullif(row_record->>'recurrenceUnit', '')::public.recurrence_unit,
      nullif(row_record->>'recurrenceInterval', '')::integer,
      nullif(row_record->>'startWorkingOn', '')::date,
      nullif(row_record->>'expirationDate', '')::date,
      normalized_item_name,
      normalized_scope,
      normalized_owner,
      normalized_item_number,
      normalized_agency,
      normalized_period_label
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
          and source.normalized_period_label is not distinct from normalized_period_label
        union
        select item.id
        from public.compliance_items item
        where item.company_id = target_company_id
          and item.template_item_key = template_key
          and item.period_label is not distinct from normalized_period_label
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
          'Template item key and period match multiple existing items.',
          jsonb_build_object('template_item_key', template_key, 'period_label', normalized_period_label, 'candidate_item_ids', candidate_ids)
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
          and item.period_label is not distinct from normalized_period_label
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
          'Natural key and period match multiple active items; row was not matched by row number.',
          jsonb_build_object('candidate_item_ids', candidate_ids, 'source_fingerprint', source_fingerprint, 'period_label', normalized_period_label)
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
        period_label,
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
        source_period_label,
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
        import_row.source_period_label,
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
        import_row.source_period_label,
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
            source_period_label = import_row.source_period_label,
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
            period_label = import_row.source_period_label,
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
            source_period_label = import_row.source_period_label,
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
        source_period_label = import_row.source_period_label,
        normalized_item_name = import_row.normalized_item_name,
        normalized_vessel_or_scope = import_row.normalized_vessel_or_scope,
        normalized_owner_code = import_row.normalized_owner_code,
        normalized_item_number = import_row.normalized_item_number,
        normalized_agency_type = import_row.normalized_agency_type,
        normalized_period_label = import_row.normalized_period_label,
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
        source_period_label,
        normalized_item_name,
        normalized_vessel_or_scope,
        normalized_owner_code,
        normalized_item_number,
        normalized_agency_type,
        normalized_period_label,
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
        import_row.source_period_label,
        import_row.normalized_item_name,
        import_row.normalized_vessel_or_scope,
        import_row.normalized_owner_code,
        import_row.normalized_item_number,
        import_row.normalized_agency_type,
        import_row.normalized_period_label,
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
      period_label,
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
      item_record.period_label,
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
