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

comment on function public.apply_compliance_workbook_import(uuid, uuid[], uuid, jsonb) is
  'Applies reviewed imports, preserving compound owner source values so item-owner synchronization can attach every normalized owner code.';
