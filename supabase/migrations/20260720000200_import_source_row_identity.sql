alter table public.compliance_import_run_rows
  drop constraint if exists compliance_import_run_rows_match_strategy_check;

alter table public.compliance_import_run_rows
  add constraint compliance_import_run_rows_match_strategy_check
  check (
    match_strategy is null
    or match_strategy in (
      'template_item_key',
      'source_row_number',
      'source_fingerprint',
      'natural_key',
      'natural_key_reference_list',
      'new_item'
    )
  );

create or replace function public._import_v3_apply_source_row_matches(
  target_import_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  run_record record;
begin
  select *
  into run_record
  from public.company_import_runs
  where id = target_import_run_id;

  if run_record.id is null
    or run_record.mode <> 'dry_run'
    or coalesce(run_record.parser_version, '') not like 'import-v3-reference-lists-%'
  then
    return;
  end if;

  with source_row_candidates as (
    select
      run_row.id as run_row_id,
      candidate.item_id,
      count(*) over (partition by run_row.id) as candidate_count
    from public.compliance_import_run_rows run_row
    join lateral (
      select source.compliance_item_id as item_id
      from public.compliance_item_import_sources source
      where source.company_id = run_row.company_id
        and source.active
        and source.source_sheet = run_record.sheet_name
        and source.source_row_number = run_row.source_row_number

      union

      select item.id
      from public.compliance_items item
      where item.company_id = run_row.company_id
        and item.source_sheet = run_record.sheet_name
        and item.source_row_number = run_row.source_row_number
    ) candidate on true
    where run_row.import_run_id = run_record.id
      and run_row.source_row_number is not null
  ),
  unique_source_rows as (
    select run_row_id, item_id
    from source_row_candidates
    where candidate_count = 1
  )
  update public.compliance_import_issues issue
  set status = 'resolved',
      decision = 'matched_by_source_row',
      decided_at = now()
  from unique_source_rows source_row
  where issue.import_run_id = run_record.id
    and issue.import_run_row_id = source_row.run_row_id
    and issue.issue_type = 'multiple_match'
    and issue.status = 'open';

  with source_row_candidates as (
    select
      run_row.id as run_row_id,
      candidate.item_id,
      count(*) over (partition by run_row.id) as candidate_count
    from public.compliance_import_run_rows run_row
    join lateral (
      select source.compliance_item_id as item_id
      from public.compliance_item_import_sources source
      where source.company_id = run_row.company_id
        and source.active
        and source.source_sheet = run_record.sheet_name
        and source.source_row_number = run_row.source_row_number

      union

      select item.id
      from public.compliance_items item
      where item.company_id = run_row.company_id
        and item.source_sheet = run_record.sheet_name
        and item.source_row_number = run_row.source_row_number
    ) candidate on true
    where run_row.import_run_id = run_record.id
      and run_row.source_row_number is not null
  ),
  unique_source_rows as (
    select run_row_id, item_id
    from source_row_candidates
    where candidate_count = 1
  )
  update public.compliance_import_run_rows run_row
  set matched_item_id = source_row.item_id,
      match_strategy = 'source_row_number',
      proposed_action = 'update_source_fields',
      is_safe_to_apply = not exists (
        select 1
        from public.compliance_import_issues issue
        where issue.import_run_row_id = run_row.id
          and issue.status = 'open'
          and issue.issue_type <> 'parser_warning'
      )
  from unique_source_rows source_row
  where run_row.id = source_row.run_row_id;

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
  select
    run_record.id,
    run_row.id,
    run_row.company_id,
    run_row.source_row_number,
    'row_changed',
    'review',
    'Matched source row content changed since the previous import; source-field update requires review.',
    run_row.matched_item_id,
    jsonb_build_object(
      'match_strategy', 'source_row_number',
      'previous_hash', previous_source.source_row_hash,
      'next_hash', run_row.source_row_hash
    )
  from public.compliance_import_run_rows run_row
  join public.compliance_items item on item.id = run_row.matched_item_id
  left join lateral (
    select source.source_row_hash
    from public.compliance_item_import_sources source
    where source.company_id = run_row.company_id
      and source.compliance_item_id = run_row.matched_item_id
      and source.active
      and source.source_sheet = run_record.sheet_name
      and source.source_row_number = run_row.source_row_number
    order by source.last_seen_at desc
    limit 1
  ) source_match on true
  cross join lateral (
    select coalesce(source_match.source_row_hash, item.source_row_hash) as source_row_hash
  ) previous_source
  where run_row.import_run_id = run_record.id
    and run_row.match_strategy = 'source_row_number'
    and previous_source.source_row_hash is not null
    and run_row.source_row_hash is not null
    and previous_source.source_row_hash <> run_row.source_row_hash
    and not exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = run_row.id
        and issue.issue_type = 'row_changed'
        and issue.status = 'open'
    );

  update public.compliance_import_run_rows run_row
  set proposed_action = 'issue',
      is_safe_to_apply = false
  where run_row.import_run_id = run_record.id
    and run_row.match_strategy = 'source_row_number'
    and exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = run_row.id
        and issue.status = 'open'
        and issue.issue_type <> 'parser_warning'
    );
end;
$$;

create or replace function public._import_v3_review_run_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode = 'dry_run'
    and coalesce(new.parser_version, '') like 'import-v3-reference-lists-%'
    and pg_trigger_depth() = 1
  then
    perform public.apply_import_v3_reference_review(new.id);
    perform public._import_v3_apply_source_row_matches(new.id);
    perform public._import_v3_enforce_unique_natural_matches(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.apply_compliance_workbook_import(
  target_import_run_id uuid,
  approved_issue_ids uuid[],
  applied_by uuid,
  resolutions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  dry_run record;
  apply_run_id uuid;
begin
  select *
  into dry_run
  from public.company_import_runs
  where id = target_import_run_id;

  if dry_run.id is null then
    raise exception 'Import run not found';
  end if;

  if coalesce(dry_run.parser_version, '') not like 'import-v3-reference-lists-%' then
    return public.apply_compliance_workbook_import(target_import_run_id, approved_issue_ids, applied_by);
  end if;

  perform public._apply_import_v3_resolutions(target_import_run_id, resolutions, applied_by);
  perform public.apply_import_v3_reference_review(target_import_run_id);
  perform public._import_v3_apply_source_row_matches(target_import_run_id);
  perform public._import_v3_enforce_unique_natural_matches(target_import_run_id);

  if coalesce(dry_run.parser_version, '') like '%multi-owner%' then
    update public.compliance_import_run_rows run_row
    set source_owner_code = coalesce(
      nullif(trim(coalesce(run_row.parsed_record->>'ownerRaw', '')), ''),
      run_row.source_owner_code
    )
    where run_row.import_run_id = target_import_run_id;
  end if;

  apply_run_id := public.apply_compliance_workbook_import(target_import_run_id, approved_issue_ids, applied_by);

  update public.compliance_items item
  set agency_id = row.resolved_agency_id,
      updated_at = now()
  from public.compliance_import_run_rows row
  join public.compliance_item_import_sources source
    on source.company_id = row.company_id
   and source.source_fingerprint = row.source_fingerprint
   and source.last_import_run_id = apply_run_id
  where row.import_run_id = target_import_run_id
    and row.resolved_agency_id is not null
    and item.id = source.compliance_item_id
    and item.agency_id is distinct from row.resolved_agency_id;

  return apply_run_id;
end;
$$;

revoke execute on function public._import_v3_apply_source_row_matches(uuid) from public, anon, authenticated;
grant execute on function public._import_v3_apply_source_row_matches(uuid) to service_role;

comment on function public._import_v3_apply_source_row_matches(uuid) is
  'Matches re-imported workbook rows by company, sheet, and source row before weaker fingerprint or natural-key matches.';

comment on function public.apply_compliance_workbook_import(uuid, uuid[], uuid, jsonb) is
  'Applies reviewed imports using source-row identity, one-to-one natural-key fallback, and compound-owner synchronization.';
