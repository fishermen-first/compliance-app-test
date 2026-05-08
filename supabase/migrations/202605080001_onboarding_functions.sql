create or replace function public.create_company_workspace(
  company_name text,
  full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := coalesce(auth.jwt() ->> 'email', '');
  new_company_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(company_name), '') is null then
    raise exception 'Company name is required';
  end if;

  if nullif(trim(full_name), '') is null then
    raise exception 'Full name is required';
  end if;

  insert into public.profiles (id, full_name, email)
  values (current_user_id, trim(full_name), current_email)
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  insert into public.companies (name)
  values (trim(company_name))
  returning id into new_company_id;

  insert into public.company_memberships (company_id, user_id, role)
  values (new_company_id, current_user_id, 'owner')
  on conflict (company_id, user_id) do update set role = 'owner';

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    new_company_id,
    current_user_id,
    'company',
    new_company_id,
    'workspace_created',
    jsonb_build_object('company_name', trim(company_name))
  );

  return new_company_id;
end;
$$;

grant execute on function public.create_company_workspace(text, text) to authenticated;

create or replace function public.save_initial_vessels(vessel_names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_company_id uuid;
  cleaned_names text[];
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
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

  select array_agg(distinct trimmed_name)
  into cleaned_names
  from (
    select trim(name_value) as trimmed_name
    from unnest(vessel_names) as name_value
    where nullif(trim(name_value), '') is not null
  ) names;

  if cleaned_names is null or array_length(cleaned_names, 1) is null then
    raise exception 'At least one vessel is required';
  end if;

  insert into public.vessels (company_id, name)
  select target_company_id, unnest(cleaned_names)
  on conflict (company_id, name) do update set
    active = true,
    updated_at = now();

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'vessel',
    target_company_id,
    'initial_vessels_saved',
    jsonb_build_object('vessel_names', cleaned_names)
  );
end;
$$;

grant execute on function public.save_initial_vessels(text[]) to authenticated;
