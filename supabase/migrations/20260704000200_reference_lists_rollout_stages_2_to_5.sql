alter table public.compliance_import_run_rows
  add column if not exists resolved_agency_id uuid references public.agencies(id) on delete set null,
  add column if not exists resolved_vessel_id uuid references public.vessels(id) on delete set null;

alter table public.compliance_import_run_rows
  drop constraint if exists compliance_import_run_rows_match_strategy_check;

alter table public.compliance_import_run_rows
  add constraint compliance_import_run_rows_match_strategy_check
  check (
    match_strategy is null
    or match_strategy in ('template_item_key', 'source_fingerprint', 'natural_key', 'natural_key_reference_list', 'new_item')
  );

create index if not exists compliance_import_run_rows_resolved_agency_idx
  on public.compliance_import_run_rows(resolved_agency_id)
  where resolved_agency_id is not null;

create index if not exists compliance_import_run_rows_resolved_vessel_idx
  on public.compliance_import_run_rows(resolved_vessel_id)
  where resolved_vessel_id is not null;

alter table public.compliance_item_notification_recipients
  add column if not exists external_contact_id uuid,
  add column if not exists contact_group_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'compliance_item_notification_recipients_external_contact_fk'
      and conrelid = 'public.compliance_item_notification_recipients'::regclass
  ) then
    alter table public.compliance_item_notification_recipients
      add constraint compliance_item_notification_recipients_external_contact_fk
      foreign key (external_contact_id)
      references public.external_contacts(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'compliance_item_notification_recipients_contact_group_fk'
      and conrelid = 'public.compliance_item_notification_recipients'::regclass
  ) then
    alter table public.compliance_item_notification_recipients
      add constraint compliance_item_notification_recipients_contact_group_fk
      foreign key (contact_group_id)
      references public.contact_groups(id)
      on delete set null;
  end if;
end $$;

alter table public.compliance_item_notification_recipients
  drop constraint if exists compliance_item_notification_recipients_recipient_type_check;

alter table public.compliance_item_notification_recipients
  add constraint compliance_item_notification_recipients_recipient_type_check
  check (recipient_type in ('owner', 'additional', 'external', 'group'));

create index if not exists compliance_item_notification_recipients_external_contact_idx
  on public.compliance_item_notification_recipients(external_contact_id)
  where external_contact_id is not null;

create index if not exists compliance_item_notification_recipients_contact_group_idx
  on public.compliance_item_notification_recipients(contact_group_id)
  where contact_group_id is not null;

drop policy if exists "Reference list editors can manage vessels" on public.vessels;
create policy "Reference list editors can manage vessels" on public.vessels
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]));

create or replace function public.merge_agencies(
  from_agency_id uuid,
  to_agency_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  from_agency record;
  to_agency record;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if from_agency_id = to_agency_id then
    raise exception 'Choose two different agencies to merge';
  end if;

  select * into from_agency
  from public.agencies
  where id = from_agency_id
  for update;

  select * into to_agency
  from public.agencies
  where id = to_agency_id
  for update;

  if from_agency.id is null or to_agency.id is null or from_agency.company_id <> to_agency.company_id then
    raise exception 'Agencies must belong to the same company';
  end if;

  if not public.has_company_role(from_agency.company_id, array['owner', 'office_user']::public.app_role[]) then
    raise exception 'You do not have permission to merge agencies';
  end if;

  insert into public.agency_aliases (company_id, agency_id, alias, updated_at)
  select from_agency.company_id, to_agency.id, from_agency.name, now()
  where public.import_v2_normalize(from_agency.name) is not null
    and public.import_v2_normalize(from_agency.name) is distinct from public.import_v2_normalize(to_agency.name)
    and not exists (
      select 1
      from public.agency_aliases existing
      where existing.company_id = from_agency.company_id
        and public.import_v2_normalize(existing.alias) = public.import_v2_normalize(from_agency.name)
    );

  insert into public.agency_aliases (company_id, agency_id, alias, updated_at)
  select alias.company_id, to_agency.id, alias.alias, now()
  from public.agency_aliases alias
  where alias.agency_id = from_agency.id
    and not exists (
      select 1
      from public.agency_aliases existing
      where existing.company_id = alias.company_id
        and public.import_v2_normalize(existing.alias) = public.import_v2_normalize(alias.alias)
    );

  update public.compliance_items
  set agency_id = to_agency.id,
      agency_type = to_agency.name,
      updated_at = now()
  where company_id = from_agency.company_id
    and agency_id = from_agency.id;

  delete from public.agencies
  where id = from_agency.id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    from_agency.company_id,
    current_user_id,
    'agency',
    to_agency.id,
    'agency_merged',
    jsonb_build_object('from_agency_id', from_agency.id, 'from_name', from_agency.name, 'to_name', to_agency.name)
  );
end;
$$;

create or replace function public.remove_agency(
  target_agency_id uuid,
  reassign_to_agency_id uuid default null,
  expected_item_count integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_agency record;
  replacement_agency_id uuid;
  replacement_agency_name text;
  actual_item_count integer;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into target_agency
  from public.agencies
  where id = target_agency_id
  for update;

  if target_agency.id is null then
    raise exception 'Agency not found';
  end if;

  if not public.has_company_role(target_agency.company_id, array['owner', 'office_user']::public.app_role[]) then
    raise exception 'You do not have permission to remove agencies';
  end if;

  select count(*)::integer
  into actual_item_count
  from public.compliance_items
  where company_id = target_agency.company_id
    and agency_id = target_agency.id;

  if actual_item_count <> coalesce(expected_item_count, 0) then
    raise exception 'Agency item count changed; reload before removing';
  end if;

  if reassign_to_agency_id is not null then
    select agency.id, agency.name
    into replacement_agency_id, replacement_agency_name
    from public.agencies
    where agency.id = reassign_to_agency_id
      and agency.company_id = target_agency.company_id;

    if replacement_agency_id is null then
      raise exception 'Replacement agency not found for this company';
    end if;
  end if;

  update public.compliance_items
  set agency_id = replacement_agency_id,
      agency_type = replacement_agency_name,
      updated_at = now()
  where company_id = target_agency.company_id
    and agency_id = target_agency.id;

  delete from public.agencies
  where id = target_agency.id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_agency.company_id,
    current_user_id,
    'agency',
    target_agency.id,
    'agency_removed',
    jsonb_build_object('name', target_agency.name, 'item_count', actual_item_count, 'replacement_agency_id', replacement_agency_id)
  );
end;
$$;

create or replace function public.remove_vessel(
  target_vessel_id uuid,
  reassign_to_vessel_id uuid default null,
  expected_item_count integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_vessel record;
  replacement_vessel_id uuid;
  actual_item_count integer;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into target_vessel
  from public.vessels
  where id = target_vessel_id
  for update;

  if target_vessel.id is null then
    raise exception 'Vessel not found';
  end if;

  if not public.has_company_role(target_vessel.company_id, array['owner', 'office_user']::public.app_role[]) then
    raise exception 'You do not have permission to remove vessels';
  end if;

  select count(*)::integer
  into actual_item_count
  from public.compliance_items
  where company_id = target_vessel.company_id
    and vessel_id = target_vessel.id;

  if actual_item_count <> coalesce(expected_item_count, 0) then
    raise exception 'Vessel item count changed; reload before removing';
  end if;

  if reassign_to_vessel_id is not null then
    select vessel.id
    into replacement_vessel_id
    from public.vessels
    where vessel.id = reassign_to_vessel_id
      and vessel.company_id = target_vessel.company_id;

    if replacement_vessel_id is null then
      raise exception 'Replacement vessel not found for this company';
    end if;
  end if;

  update public.compliance_items
  set vessel_id = replacement_vessel_id,
      updated_at = now()
  where company_id = target_vessel.company_id
    and vessel_id = target_vessel.id;

  delete from public.vessels
  where id = target_vessel.id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_vessel.company_id,
    current_user_id,
    'vessel',
    target_vessel.id,
    'vessel_removed',
    jsonb_build_object('name', target_vessel.name, 'item_count', actual_item_count, 'replacement_vessel_id', replacement_vessel_id)
  );
end;
$$;

create or replace function public._import_v3_resolve_agency(
  target_company_id uuid,
  value text
)
returns uuid
language sql
stable
set search_path = public
as $$
  select agency_id
  from (
    select agency.id as agency_id, 1 as priority
    from public.agencies agency
    where agency.company_id = target_company_id
      and public.import_v2_normalize(agency.name) = public.import_v2_normalize(value)
    union all
    select alias.agency_id, 2 as priority
    from public.agency_aliases alias
    where alias.company_id = target_company_id
      and public.import_v2_normalize(alias.alias) = public.import_v2_normalize(value)
  ) resolved
  order by priority
  limit 1;
$$;

create or replace function public._import_v3_resolve_vessel(
  target_company_id uuid,
  value text
)
returns uuid
language sql
stable
set search_path = public
as $$
  select vessel.id
  from public.vessels vessel
  where vessel.company_id = target_company_id
    and public.import_v2_normalize(vessel.name) = public.import_v2_normalize(value)
  order by vessel.active desc, vessel.name
  limit 1;
$$;

create or replace function public.apply_import_v3_reference_review(
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

  if run_record.id is null or coalesce(run_record.parser_version, '') not like 'import-v3-reference-lists-%' then
    return;
  end if;

  update public.compliance_import_run_rows row
  set resolved_agency_id = public._import_v3_resolve_agency(row.company_id, row.source_agency_type)
  where row.import_run_id = run_record.id
    and public.import_v2_normalize(row.source_agency_type) is not null;

  update public.compliance_import_run_rows row
  set resolved_vessel_id = public._import_v3_resolve_vessel(row.company_id, row.source_vessel_or_scope)
  where row.import_run_id = run_record.id
    and public.import_v2_normalize(row.source_vessel_or_scope) is not null
    and not public.import_v2_is_company_wide_scope(row.source_vessel_or_scope);

  update public.compliance_import_run_rows row
  set source_vessel_or_scope = vessel.name,
      normalized_vessel_or_scope = public.import_v2_normalize(vessel.name)
  from public.vessels vessel
  where row.import_run_id = run_record.id
    and row.resolved_vessel_id = vessel.id
    and row.source_vessel_or_scope is distinct from vessel.name;

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
  select
    run_record.id,
    row.id,
    row.company_id,
    row.source_row_number,
    'unknown_agency',
    'review',
    'Unknown agency "' || row.source_agency_type || '".',
    jsonb_build_object('value', row.source_agency_type)
  from public.compliance_import_run_rows row
  where row.import_run_id = run_record.id
    and public.import_v2_normalize(row.source_agency_type) is not null
    and row.resolved_agency_id is null
    and not exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = row.id
        and issue.issue_type = 'unknown_agency'
    );

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
  select
    run_record.id,
    row.id,
    row.company_id,
    row.source_row_number,
    'unknown_vessel',
    'review',
    'Unknown vessel "' || row.source_vessel_or_scope || '".',
    jsonb_build_object('value', row.source_vessel_or_scope)
  from public.compliance_import_run_rows row
  where row.import_run_id = run_record.id
    and public.import_v2_normalize(row.source_vessel_or_scope) is not null
    and not public.import_v2_is_company_wide_scope(row.source_vessel_or_scope)
    and row.resolved_vessel_id is null
    and not exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = row.id
        and issue.issue_type = 'unknown_vessel'
    );

  with reference_candidates as (
    select
      row.id as run_row_id,
      item.id as item_id,
      count(*) over (partition by row.id) as candidate_count
    from public.compliance_import_run_rows row
    join public.compliance_items item
      on item.company_id = row.company_id
     and item.discontinued_at is null
     and public.import_v2_normalize(item.item_name) is not distinct from row.normalized_item_name
     and public.import_v2_normalize(item.owner_current) is not distinct from row.normalized_owner_code
     and public.import_v2_normalize(item.item_number) is not distinct from row.normalized_item_number
     and item.period_label is not distinct from row.normalized_period_label
     and (
       item.agency_id is not distinct from row.resolved_agency_id
       or public.import_v2_normalize(item.agency_type) is not distinct from row.normalized_agency_type
     )
    left join public.vessels vessel on vessel.id = item.vessel_id
    where row.import_run_id = run_record.id
      and row.proposed_action = 'create_item'
      and row.resolved_agency_id is not null
      and not exists (
        select 1
        from public.compliance_import_issues issue
        where issue.import_run_row_id = row.id
          and issue.status = 'open'
      )
      and (
        vessel.id is not distinct from row.resolved_vessel_id
        or (item.vessel_id is null and public.import_v2_is_company_wide_scope(row.source_vessel_or_scope))
      )
  )
  update public.compliance_import_run_rows row
  set matched_item_id = reference_candidates.item_id,
      match_strategy = 'natural_key_reference_list',
      proposed_action = 'update_source_fields',
      is_safe_to_apply = true
  from reference_candidates
  where row.id = reference_candidates.run_row_id
    and reference_candidates.candidate_count = 1;

  update public.compliance_import_run_rows row
  set is_safe_to_apply = false,
      proposed_action = 'issue'
  where row.import_run_id = run_record.id
    and exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = row.id
        and issue.status = 'open'
        and issue.issue_type in ('unknown_agency', 'unknown_vessel')
    );

  update public.compliance_import_run_rows row
  set is_safe_to_apply = true,
      proposed_action = coalesce(nullif(row.proposed_action, 'issue'), 'create_item'),
      match_strategy = coalesce(row.match_strategy, 'new_item')
  where row.import_run_id = run_record.id
    and row.proposed_action = 'issue'
    and not exists (
      select 1
      from public.compliance_import_issues issue
      where issue.import_run_row_id = row.id
        and issue.status = 'open'
    )
    and row.matched_item_id is null;

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
  end if;

  return new;
end;
$$;

drop trigger if exists import_v3_reference_review_after_run on public.company_import_runs;
create trigger import_v3_reference_review_after_run
  after update of status, issue_count, safe_create_count, safe_update_count, skipped_count
  on public.company_import_runs
  for each row
  execute function public._import_v3_review_run_trigger();

create or replace function public._apply_import_v3_resolutions(
  target_import_run_id uuid,
  resolutions jsonb,
  resolved_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolution jsonb;
  issue_record record;
  run_row record;
  action text;
  target_id uuid;
  create_name text;
  agency_record record;
  vessel_record record;
begin
  if resolutions is null or jsonb_typeof(resolutions) <> 'array' then
    return;
  end if;

  for resolution in select value from jsonb_array_elements(resolutions)
  loop
    select * into issue_record
    from public.compliance_import_issues issue
    where issue.id = nullif(resolution->>'issue_id', '')::uuid
      and issue.import_run_id = target_import_run_id
      and issue.status = 'open'
    for update;

    if issue_record.id is null then
      continue;
    end if;

    select * into run_row
    from public.compliance_import_run_rows row
    where row.id = issue_record.import_run_row_id
      and row.import_run_id = target_import_run_id
    for update;

    if run_row.id is null then
      continue;
    end if;

    action := nullif(trim(resolution->>'action'), '');
    target_id := nullif(resolution->>'target_id', '')::uuid;
    create_name := nullif(trim(coalesce(resolution->>'create_name', issue_record.details->>'value')), '');

    if issue_record.issue_type = 'unknown_agency' then
      if action = 'map' then
        select * into agency_record
        from public.agencies agency
        where agency.id = target_id
          and agency.company_id = run_row.company_id;

        if agency_record.id is null then
          raise exception 'Agency resolution target is invalid';
        end if;
      elsif action = 'create' then
        if create_name is null then
          raise exception 'Agency name is required';
        end if;

        select * into agency_record
        from public.agencies agency
        where agency.company_id = run_row.company_id
          and public.import_v2_normalize(agency.name) = public.import_v2_normalize(create_name);

        if agency_record.id is null then
          insert into public.agencies (company_id, name, kind)
          values (run_row.company_id, create_name, 'agency')
          returning * into agency_record;
        end if;
      else
        raise exception 'Agency resolution action is invalid';
      end if;

      insert into public.agency_aliases (company_id, agency_id, alias, updated_at)
      select run_row.company_id, agency_record.id, issue_record.details->>'value', now()
      where public.import_v2_normalize(issue_record.details->>'value') is not null
        and public.import_v2_normalize(issue_record.details->>'value') is distinct from public.import_v2_normalize(agency_record.name)
        and not exists (
          select 1
          from public.agency_aliases existing
          where existing.company_id = run_row.company_id
            and public.import_v2_normalize(existing.alias) = public.import_v2_normalize(issue_record.details->>'value')
        );

      update public.compliance_import_run_rows
      set resolved_agency_id = agency_record.id
      where id = run_row.id;
    elsif issue_record.issue_type = 'unknown_vessel' then
      if action = 'map' then
        select * into vessel_record
        from public.vessels vessel
        where vessel.id = target_id
          and vessel.company_id = run_row.company_id;

        if vessel_record.id is null then
          raise exception 'Vessel resolution target is invalid';
        end if;
      elsif action = 'create' then
        if create_name is null then
          raise exception 'Vessel name is required';
        end if;

        select * into vessel_record
        from public.vessels vessel
        where vessel.company_id = run_row.company_id
          and public.import_v2_normalize(vessel.name) = public.import_v2_normalize(create_name);

        if vessel_record.id is null then
          insert into public.vessels (company_id, name, active, updated_at)
          values (run_row.company_id, create_name, true, now())
          returning * into vessel_record;
        else
          update public.vessels
          set active = true,
              updated_at = now()
          where id = vessel_record.id;
        end if;
      else
        raise exception 'Vessel resolution action is invalid';
      end if;

      update public.compliance_import_run_rows
      set resolved_vessel_id = vessel_record.id,
          source_vessel_or_scope = vessel_record.name,
          normalized_vessel_or_scope = public.import_v2_normalize(vessel_record.name)
      where id = run_row.id;
    end if;

    update public.compliance_import_issues
    set status = 'resolved',
        decision = jsonb_build_object('action', action, 'target_id', target_id, 'create_name', create_name)::text,
        decided_by = resolved_by,
        decided_at = now()
    where id = issue_record.id;
  end loop;

  perform public.apply_import_v3_reference_review(target_import_run_id);
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

drop function if exists public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[]);

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
  item_owner_codes text[] default null,
  item_agency_id uuid default null
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
  normalized_agency_type text := nullif(trim(coalesce(item_agency_type, '')), '');
  agency_record record;
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

  if item_agency_id is not null then
    select * into agency_record
    from public.agencies
    where id = item_agency_id
      and company_id = target_company_id;

    if agency_record.id is null then
      raise exception 'Agency not found for this company';
    end if;

    normalized_agency_type := coalesce(normalized_agency_type, agency_record.name);
  elsif normalized_agency_type is not null then
    select * into agency_record
    from public.agencies
    where company_id = target_company_id
      and public.import_v2_normalize(name) = public.import_v2_normalize(normalized_agency_type);
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
    agency_id,
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
    normalized_agency_type,
    agency_record.id,
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

drop function if exists public.update_compliance_item_core(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[]);

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
  next_owner_codes text[] default null,
  next_agency_id uuid default null
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
  agency_record record;
  resolved_agency_id uuid;
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

  if next_agency_id is not null then
    select * into agency_record
    from public.agencies
    where id = next_agency_id
      and company_id = item_record.company_id;

    if agency_record.id is null then
      raise exception 'Agency not found for this company';
    end if;

    resolved_agency_id := agency_record.id;
    normalized_agency_type := coalesce(normalized_agency_type, agency_record.name);
  elsif normalized_agency_type is not null then
    select * into agency_record
    from public.agencies
    where company_id = item_record.company_id
      and public.import_v2_normalize(name) = public.import_v2_normalize(normalized_agency_type);

    resolved_agency_id := agency_record.id;
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
    case when item_record.agency_id is distinct from resolved_agency_id then 'agency_id' end,
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
      agency_id = resolved_agency_id,
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
    jsonb_build_object('changed_fields', changed_fields)
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
      agency_id,
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
      item_record.agency_id,
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
    where coalesce(value->>'recipient_type', 'external') <> 'group'
      and nullif(trim(coalesce(value->>'recipient_email', value->>'email', '')), '') is not null
      and nullif(trim(coalesce(value->>'recipient_email', value->>'email', '')), '') !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  ) then
    raise exception 'Additional recipient email is invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(recipients) entry(value)
    where coalesce(value->>'recipient_type', 'external') = 'group'
      and not exists (
        select 1
        from public.contact_groups contact_group
        where contact_group.company_id = item_record.company_id
          and contact_group.id = nullif(value->>'contact_group_id', '')::uuid
      )
  ) then
    raise exception 'Contact group is invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(recipients) entry(value)
    where nullif(value->>'external_contact_id', '') is not null
      and not exists (
        select 1
        from public.external_contacts contact
        where contact.company_id = item_record.company_id
          and contact.id = nullif(value->>'external_contact_id', '')::uuid
      )
  ) then
    raise exception 'External contact is invalid';
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
    and recipient_type in ('additional', 'external', 'group');

  insert into public.compliance_item_notification_recipients (
    item_id,
    company_id,
    recipient_name,
    recipient_email,
    recipient_type,
    external_contact_id
  )
  select
    item_record.id,
    item_record.company_id,
    recipient_name,
    recipient_email,
    'external',
    external_contact_id
  from (
    select distinct on (recipient_email)
      recipient_name,
      recipient_email,
      external_contact_id
    from (
      select
        nullif(trim(coalesce(value->>'recipient_name', value->>'name', '')), '') as recipient_name,
        lower(nullif(trim(coalesce(value->>'recipient_email', value->>'email', '')), '')) as recipient_email,
        nullif(value->>'external_contact_id', '')::uuid as external_contact_id
      from jsonb_array_elements(recipients) entry(value)
      where coalesce(value->>'recipient_type', 'external') <> 'group'
    ) cleaned
    where recipient_email is not null
    order by recipient_email, recipient_name nulls last
  ) parsed
  where recipient_email is not null
  on conflict (item_id, recipient_email) do update set
    recipient_name = excluded.recipient_name,
    recipient_type = excluded.recipient_type,
    external_contact_id = excluded.external_contact_id,
    contact_group_id = null;

  insert into public.compliance_item_notification_recipients (
    item_id,
    company_id,
    recipient_name,
    recipient_email,
    recipient_type,
    contact_group_id
  )
  select
    item_record.id,
    item_record.company_id,
    contact_group.name,
    'group:' || contact_group.id::text,
    'group',
    contact_group.id
  from (
    select distinct nullif(value->>'contact_group_id', '')::uuid as contact_group_id
    from jsonb_array_elements(recipients) entry(value)
    where coalesce(value->>'recipient_type', 'external') = 'group'
  ) parsed
  join public.contact_groups contact_group
    on contact_group.id = parsed.contact_group_id
   and contact_group.company_id = item_record.company_id
  on conflict (item_id, recipient_email) do update set
    recipient_name = excluded.recipient_name,
    recipient_type = excluded.recipient_type,
    external_contact_id = null,
    contact_group_id = excluded.contact_group_id;
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
#variable_conflict use_variable
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

revoke execute on function public.merge_agencies(uuid, uuid) from public, anon;
revoke execute on function public.remove_agency(uuid, uuid, integer) from public, anon;
revoke execute on function public.remove_vessel(uuid, uuid, integer) from public, anon;
revoke execute on function public.apply_compliance_workbook_import(uuid, uuid[], uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[], uuid) from public, anon;
revoke execute on function public.update_compliance_item_core(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[], uuid) from public, anon;
revoke execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer[], boolean, integer, date[], boolean, boolean, integer[], boolean, integer, date[], jsonb) from public, anon;

grant execute on function public.merge_agencies(uuid, uuid) to authenticated;
grant execute on function public.remove_agency(uuid, uuid, integer) to authenticated;
grant execute on function public.remove_vessel(uuid, uuid, integer) to authenticated;
grant execute on function public.apply_compliance_workbook_import(uuid, uuid[], uuid, jsonb) to service_role;
grant execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[], uuid) to authenticated;
grant execute on function public.update_compliance_item_core(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text, text[], uuid) to authenticated;
grant execute on function public.save_compliance_item_reminders(uuid, text, boolean, boolean, integer[], boolean, integer, date[], boolean, boolean, integer[], boolean, integer, date[], jsonb) to authenticated;
