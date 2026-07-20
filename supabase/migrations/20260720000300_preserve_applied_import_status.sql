create or replace function public._import_v3_review_run_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mode = 'dry_run'
    and new.applied_run_id is null
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

comment on function public._import_v3_review_run_trigger() is
  'Reviews unresolved v3 dry runs without overwriting the completed status of a run that has already been applied.';
