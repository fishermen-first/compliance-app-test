create or replace function public.create_compliance_event(
  event_title text,
  event_due_at timestamptz,
  event_vessel_id uuid default null,
  event_category public.event_category default 'other',
  event_priority public.event_priority default 'medium',
  event_status public.compliance_status default 'draft',
  event_sharepoint_url text default null,
  event_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_company_id uuid;
  new_event_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(event_title), '') is null then
    raise exception 'Event title is required';
  end if;

  select company_id
  into target_company_id
  from public.company_memberships
  where user_id = current_user_id
  order by created_at asc
  limit 1;

  if target_company_id is null then
    raise exception 'No company workspace found';
  end if;

  if event_vessel_id is not null and not exists (
    select 1
    from public.vessels
    where id = event_vessel_id
      and company_id = target_company_id
  ) then
    raise exception 'Vessel not found for this company';
  end if;

  insert into public.compliance_events (
    company_id,
    vessel_id,
    owner_id,
    title,
    category,
    priority,
    status,
    due_at,
    sharepoint_url,
    notes,
    created_by
  ) values (
    target_company_id,
    event_vessel_id,
    current_user_id,
    trim(event_title),
    event_category,
    event_priority,
    event_status,
    event_due_at,
    nullif(trim(coalesce(event_sharepoint_url, '')), ''),
    nullif(trim(coalesce(event_notes, '')), ''),
    current_user_id
  ) returning id into new_event_id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'compliance_event',
    new_event_id,
    'event_created',
    jsonb_build_object('title', trim(event_title), 'due_at', event_due_at)
  );

  return new_event_id;
end;
$$;

grant execute on function public.create_compliance_event(
  text,
  timestamptz,
  uuid,
  public.event_category,
  public.event_priority,
  public.compliance_status,
  text,
  text
) to authenticated;
