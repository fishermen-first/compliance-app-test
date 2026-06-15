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
      where item.id = target_item_id
        and item.created_by = auth.uid()
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

grant execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text) to authenticated;
