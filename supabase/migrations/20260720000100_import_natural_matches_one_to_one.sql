create or replace function public._import_v3_enforce_unique_natural_matches(
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

  with collision_rows as (
    select
      run_row.id,
      run_row.matched_item_id,
      (
        item.start_working_on is not distinct from run_row.source_start_working_on
        and item.expiration_date is not distinct from run_row.source_expiration_date
      ) as is_exact_date_match,
      count(*) over (partition by run_row.matched_item_id) as collision_count,
      count(*) filter (
        where item.start_working_on is not distinct from run_row.source_start_working_on
          and item.expiration_date is not distinct from run_row.source_expiration_date
      ) over (partition by run_row.matched_item_id) as exact_date_match_count
    from public.compliance_import_run_rows run_row
    join public.compliance_items item on item.id = run_row.matched_item_id
    where run_row.import_run_id = run_record.id
      and run_row.is_safe_to_apply
      and run_row.proposed_action = 'update_source_fields'
      and run_row.match_strategy in ('natural_key', 'natural_key_reference_list')
  )
  update public.compliance_import_run_rows run_row
  set matched_item_id = null,
      match_strategy = 'new_item',
      proposed_action = 'create_item',
      is_safe_to_apply = true
  from collision_rows collision
  where run_row.id = collision.id
    and collision.collision_count > 1
    and collision.exact_date_match_count = 1
    and not collision.is_exact_date_match;

  with collision_rows as (
    select
      run_row.id,
      run_row.matched_item_id,
      run_row.company_id,
      run_row.source_row_number,
      count(*) over (partition by run_row.matched_item_id) as collision_count,
      count(*) filter (
        where item.start_working_on is not distinct from run_row.source_start_working_on
          and item.expiration_date is not distinct from run_row.source_expiration_date
      ) over (partition by run_row.matched_item_id) as exact_date_match_count
    from public.compliance_import_run_rows run_row
    join public.compliance_items item on item.id = run_row.matched_item_id
    where run_row.import_run_id = run_record.id
      and run_row.is_safe_to_apply
      and run_row.proposed_action = 'update_source_fields'
      and run_row.match_strategy in ('natural_key', 'natural_key_reference_list')
  )
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
    collision.id,
    collision.company_id,
    collision.source_row_number,
    'multiple_source_rows_match_item',
    'blocker',
    'Multiple workbook rows match one existing item and no unique date match can identify the update row.',
    collision.matched_item_id,
    jsonb_build_object(
      'matched_item_id', collision.matched_item_id,
      'exact_date_match_count', collision.exact_date_match_count
    )
  from collision_rows collision
  where collision.collision_count > 1
    and collision.exact_date_match_count <> 1
    and not exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = collision.id
        and issue.issue_type = 'multiple_source_rows_match_item'
        and issue.status = 'open'
    );

  update public.compliance_import_run_rows run_row
  set proposed_action = 'issue',
      is_safe_to_apply = false
  where run_row.import_run_id = run_record.id
    and exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = run_row.id
        and issue.issue_type = 'multiple_source_rows_match_item'
        and issue.status = 'open'
    );

  update public.company_import_runs run
  set issue_count = (
        select count(*)::integer
        from public.compliance_import_issues issue
        where issue.import_run_id = run_record.id
          and issue.status = 'open'
      ),
      safe_create_count = (
        select count(*)::integer
        from public.compliance_import_run_rows run_row
        where run_row.import_run_id = run_record.id
          and run_row.is_safe_to_apply
          and run_row.proposed_action = 'create_item'
      ),
      safe_update_count = (
        select count(*)::integer
        from public.compliance_import_run_rows run_row
        where run_row.import_run_id = run_record.id
          and run_row.is_safe_to_apply
          and run_row.proposed_action = 'update_source_fields'
      ),
      skipped_count = (
        select count(*)::integer
        from public.compliance_import_run_rows run_row
        where run_row.import_run_id = run_record.id
          and not run_row.is_safe_to_apply
      ),
      status = case
        when exists (
          select 1
          from public.compliance_import_issues issue
          where issue.import_run_id = run_record.id
            and issue.status = 'open'
        ) then 'review_required'
        else 'ready_to_apply'
      end
  where run.id = run_record.id;
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

revoke execute on function public._import_v3_enforce_unique_natural_matches(uuid) from public, anon, authenticated;
grant execute on function public._import_v3_enforce_unique_natural_matches(uuid) to service_role;

comment on function public._import_v3_enforce_unique_natural_matches(uuid) is
  'Prevents multiple workbook rows from updating the same natural-key match. A unique exact date match keeps the update; other rows become creates. Ambiguous collisions remain blocked.';

comment on function public.apply_compliance_workbook_import(uuid, uuid[], uuid, jsonb) is
  'Applies reviewed imports, preserving compound owners and enforcing one-to-one natural-key matches before item writes.';
