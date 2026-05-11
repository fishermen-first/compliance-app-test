create or replace function public._customer_settings_actor_role(target_company_id uuid, require_admin boolean)
returns public.app_role
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  membership_count integer;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_app_admin() then
    raise exception 'FF admins must use the admin customer console';
  end if;

  select count(distinct company_id)
  into membership_count
  from public.company_memberships
  where user_id = current_user_id;

  if membership_count = 0 then
    raise exception 'No customer workspace membership found';
  end if;

  if membership_count > 1 then
    raise exception 'MULTI_COMPANY_CONTEXT_BLOCKED';
  end if;

  select membership.role
  into actor_role
  from public.company_memberships membership
  where membership.company_id = target_company_id
    and membership.user_id = current_user_id
  limit 1;

  if actor_role is null then
    raise exception 'No membership for this customer workspace';
  end if;

  if require_admin and actor_role not in ('owner', 'office_admin') then
    raise exception 'Customer admin access is required';
  end if;

  return actor_role;
end;
$$;

create or replace function public._settings_can_manage_role(
  actor_role public.app_role,
  target_role public.app_role,
  next_role public.app_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when actor_role = 'owner' then true
    when actor_role = 'office_admin' then
      target_role in ('office_user', 'vessel_user')
      and next_role in ('office_user', 'vessel_user')
    else false
  end;
$$;

create or replace function public._settings_email_is_app_admin(target_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins app_admin
    where lower(app_admin.email::text) = lower(coalesce(target_email, ''))
  );
$$;

revoke execute on function public._customer_settings_actor_role(uuid, boolean) from public, anon, authenticated;
revoke execute on function public._settings_can_manage_role(public.app_role, public.app_role, public.app_role) from public, anon, authenticated;
revoke execute on function public._settings_email_is_app_admin(text) from public, anon, authenticated;

create or replace function public.settings_get_access_rows(target_company_id uuid)
returns table (
  target_kind text,
  target_id uuid,
  email text,
  display_name text,
  role public.app_role,
  status text,
  owner_codes text[],
  app_admin_contamination boolean,
  can_update_role boolean,
  can_remove boolean,
  can_cancel boolean,
  can_update_owner_codes boolean,
  can_clear_owner_codes boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  owner_count integer;
  admin_count integer;
begin
  actor_role := public._customer_settings_actor_role(target_company_id, true);

  select
    count(*) filter (where membership.role = 'owner'),
    count(*) filter (where membership.role in ('owner', 'office_admin'))
  into owner_count, admin_count
  from public.company_memberships membership
  where membership.company_id = target_company_id;

  return query
  with membership_rows as (
    select
      membership.id,
      membership.user_id,
      profile.email::text as profile_email,
      profile.full_name,
      membership.role,
      membership.created_at,
      public._settings_email_is_app_admin(profile.email::text) as is_app_admin,
      coalesce(
        array_agg(distinct owner_code.code order by owner_code.code)
          filter (where owner_code.code is not null),
        '{}'::text[]
      ) as assigned_codes
    from public.company_memberships membership
    left join public.profiles profile on profile.id = membership.user_id
    left join public.company_owner_codes owner_code
      on owner_code.company_id = membership.company_id
     and (
       owner_code.user_id = membership.user_id
       or (
         profile.email is not null
         and lower(owner_code.pending_email::text) = lower(profile.email)
       )
     )
    where membership.company_id = target_company_id
    group by membership.id, membership.user_id, profile.email, profile.full_name, membership.role, membership.created_at
  ),
  invite_rows as (
    select
      invitation.id,
      invitation.email::text as invite_email,
      invitation.role,
      invitation.created_at,
      public._settings_email_is_app_admin(invitation.email::text) as is_app_admin,
      coalesce(
        array_agg(distinct owner_code.code order by owner_code.code)
          filter (where owner_code.code is not null),
        '{}'::text[]
      ) as assigned_codes
    from public.company_invitations invitation
    left join public.company_owner_codes owner_code
      on owner_code.company_id = invitation.company_id
     and lower(owner_code.pending_email::text) = lower(invitation.email::text)
    where invitation.company_id = target_company_id
      and invitation.accepted_at is null
    group by invitation.id, invitation.email, invitation.role, invitation.created_at
  )
  select
    'membership'::text as target_kind,
    row.id as target_id,
    row.profile_email as email,
    row.full_name as display_name,
    row.role,
    case when row.profile_email is null then 'needs_profile_email' else 'active' end as status,
    row.assigned_codes as owner_codes,
    row.is_app_admin as app_admin_contamination,
    (
      not row.is_app_admin
      and row.user_id <> current_user_id
      and public._settings_can_manage_role(actor_role, row.role, row.role)
      and (row.role <> 'owner' or owner_count > 1)
    ) as can_update_role,
    (
      not row.is_app_admin
      and row.user_id <> current_user_id
      and public._settings_can_manage_role(actor_role, row.role, row.role)
      and (row.role <> 'owner' or owner_count > 1)
      and (row.role not in ('owner', 'office_admin') or admin_count > 1)
    ) as can_remove,
    false as can_cancel,
    (
      not row.is_app_admin
      and (
        row.user_id = current_user_id
        or public._settings_can_manage_role(actor_role, row.role, row.role)
      )
    ) as can_update_owner_codes,
    (
      row.is_app_admin
      or row.user_id = current_user_id
      or public._settings_can_manage_role(actor_role, row.role, row.role)
    ) as can_clear_owner_codes,
    row.created_at
  from membership_rows row
  union all
  select
    'invitation'::text as target_kind,
    row.id as target_id,
    row.invite_email as email,
    null::text as display_name,
    row.role,
    'invite_pending'::text as status,
    row.assigned_codes as owner_codes,
    row.is_app_admin as app_admin_contamination,
    (
      not row.is_app_admin
      and public._settings_can_manage_role(actor_role, row.role, row.role)
    ) as can_update_role,
    false as can_remove,
    (
      row.is_app_admin
      or public._settings_can_manage_role(actor_role, row.role, row.role)
    ) as can_cancel,
    (
      not row.is_app_admin
      and public._settings_can_manage_role(actor_role, row.role, row.role)
    ) as can_update_owner_codes,
    (
      row.is_app_admin
      or public._settings_can_manage_role(actor_role, row.role, row.role)
    ) as can_clear_owner_codes,
    row.created_at
  from invite_rows row
  order by 6 asc, 14 asc;
end;
$$;

create or replace function public.get_queue_owner_codes(target_company_id uuid)
returns table (
  code text,
  display_name text,
  records integer,
  is_assigned_to_current_user boolean,
  is_visible_to_current_user boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
begin
  actor_role := public._customer_settings_actor_role(target_company_id, false);

  return query
  with item_counts as (
    select item.owner_current as owner_code, count(*)::integer as record_count
    from public.compliance_items item
    where item.company_id = target_company_id
      and nullif(trim(coalesce(item.owner_current, '')), '') is not null
    group by item.owner_current
  ),
  merged_codes as (
    select owner_code.code, owner_code.display_name, owner_code.user_id, coalesce(item_counts.record_count, 0) as record_count
    from public.company_owner_codes owner_code
    left join item_counts on item_counts.owner_code = owner_code.code
    where owner_code.company_id = target_company_id
    union
    select item_counts.owner_code as code, null::text as display_name, null::uuid as user_id, item_counts.record_count
    from item_counts
    where not exists (
      select 1
      from public.company_owner_codes owner_code
      where owner_code.company_id = target_company_id
        and owner_code.code = item_counts.owner_code
    )
  )
  select
    merged_codes.code,
    merged_codes.display_name,
    merged_codes.record_count as records,
    merged_codes.user_id = current_user_id as is_assigned_to_current_user,
    case
      when actor_role in ('owner', 'office_admin') then true
      else merged_codes.user_id = current_user_id
    end as is_visible_to_current_user
  from merged_codes
  order by merged_codes.code;
end;
$$;

create or replace function public.settings_update_member_access(
  target_company_id uuid,
  target_membership_id uuid,
  next_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  target_record record;
  target_is_app_admin boolean;
  owners_after integer;
  admins_after integer;
begin
  actor_role := public._customer_settings_actor_role(target_company_id, true);

  select membership.*, profile.email::text as target_email
  into target_record
  from public.company_memberships membership
  left join public.profiles profile on profile.id = membership.user_id
  where membership.id = target_membership_id
    and membership.company_id = target_company_id
  for update of membership;

  if not found then
    raise exception 'Customer membership not found';
  end if;

  target_is_app_admin := public._settings_email_is_app_admin(target_record.target_email);
  if target_is_app_admin then
    raise exception 'FF admin contamination can only be cleaned up by clearing owner codes or canceling pending invites';
  end if;

  if target_record.user_id = current_user_id and target_record.role <> next_role then
    raise exception 'Customer admins cannot change their own role from settings';
  end if;

  if not public._settings_can_manage_role(actor_role, target_record.role, next_role) then
    raise exception 'This role transition is not allowed';
  end if;

  if target_record.role = next_role then
    return;
  end if;

  select
    count(*) filter (where case when membership.id = target_membership_id then next_role else membership.role end = 'owner'),
    count(*) filter (where case when membership.id = target_membership_id then next_role else membership.role end in ('owner', 'office_admin'))
  into owners_after, admins_after
  from public.company_memberships membership
  where membership.company_id = target_company_id;

  if owners_after = 0 then
    raise exception 'At least one owner must remain';
  end if;

  if admins_after = 0 then
    raise exception 'At least one customer admin must remain';
  end if;

  update public.company_memberships
  set role = next_role
  where id = target_membership_id
    and company_id = target_company_id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'company_membership',
    target_membership_id,
    'settings_member_role_updated',
    jsonb_build_object(
      'target_user_id', target_record.user_id,
      'target_email', target_record.target_email,
      'previous_role', target_record.role,
      'new_role', next_role
    )
  );
end;
$$;

create or replace function public.settings_remove_member_access(
  target_company_id uuid,
  target_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  target_record record;
  target_is_app_admin boolean;
  owners_after integer;
  admins_after integer;
  owner_codes_cleared text[] := '{}'::text[];
  canceled_invite_ids uuid[] := '{}'::uuid[];
begin
  actor_role := public._customer_settings_actor_role(target_company_id, true);

  select membership.*, profile.email::text as target_email
  into target_record
  from public.company_memberships membership
  left join public.profiles profile on profile.id = membership.user_id
  where membership.id = target_membership_id
    and membership.company_id = target_company_id
  for update of membership;

  if not found then
    raise exception 'Customer membership not found';
  end if;

  target_is_app_admin := public._settings_email_is_app_admin(target_record.target_email);
  if target_is_app_admin then
    raise exception 'FF admin membership contamination cannot be removed from customer settings';
  end if;

  if target_record.user_id = current_user_id then
    raise exception 'Customer admins cannot remove themselves from settings';
  end if;

  if not public._settings_can_manage_role(actor_role, target_record.role, target_record.role) then
    raise exception 'This membership cannot be removed by your role';
  end if;

  select
    count(*) filter (where membership.role = 'owner'),
    count(*) filter (where membership.role in ('owner', 'office_admin'))
  into owners_after, admins_after
  from public.company_memberships membership
  where membership.company_id = target_company_id
    and membership.id <> target_membership_id;

  if owners_after = 0 then
    raise exception 'At least one owner must remain';
  end if;

  if admins_after = 0 then
    raise exception 'At least one customer admin must remain';
  end if;

  with cleared as (
    update public.company_owner_codes owner_code
    set user_id = null,
        pending_email = null,
        updated_at = now()
    where owner_code.company_id = target_company_id
      and (
        owner_code.user_id = target_record.user_id
        or (
          target_record.target_email is not null
          and lower(owner_code.pending_email::text) = lower(target_record.target_email)
        )
      )
    returning owner_code.code
  )
  select coalesce(array_agg(code order by code), '{}'::text[])
  into owner_codes_cleared
  from cleared;

  if target_record.target_email is not null then
    with deleted as (
      delete from public.company_invitations invitation
      where invitation.company_id = target_company_id
        and invitation.accepted_at is null
        and lower(invitation.email::text) = lower(target_record.target_email)
      returning invitation.id
    )
    select coalesce(array_agg(id order by id), '{}'::uuid[])
    into canceled_invite_ids
    from deleted;
  end if;

  delete from public.company_memberships
  where id = target_membership_id
    and company_id = target_company_id;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'company_membership',
    target_membership_id,
    'settings_member_removed',
    jsonb_build_object(
      'target_user_id', target_record.user_id,
      'target_email', target_record.target_email,
      'previous_role', target_record.role,
      'canceled_invite_ids', canceled_invite_ids,
      'owner_codes_cleared', owner_codes_cleared
    )
  );
end;
$$;

create or replace function public.settings_update_pending_invite_access(
  target_company_id uuid,
  target_invitation_id uuid,
  next_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  invite_record record;
  target_is_app_admin boolean;
begin
  actor_role := public._customer_settings_actor_role(target_company_id, true);

  select invitation.*
  into invite_record
  from public.company_invitations invitation
  where invitation.id = target_invitation_id
    and invitation.company_id = target_company_id
  for update of invitation;

  if not found then
    raise exception 'Pending invitation not found';
  end if;

  if invite_record.accepted_at is not null then
    raise exception 'Accepted invitations cannot be changed from customer settings';
  end if;

  target_is_app_admin := public._settings_email_is_app_admin(invite_record.email::text);
  if target_is_app_admin then
    raise exception 'FF admin pending invitations can only be canceled from customer settings';
  end if;

  if not public._settings_can_manage_role(actor_role, invite_record.role, next_role) then
    raise exception 'This invitation role transition is not allowed';
  end if;

  if invite_record.role = next_role then
    return;
  end if;

  update public.company_invitations
  set role = next_role
  where id = target_invitation_id
    and company_id = target_company_id
    and accepted_at is null;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'company_invitation',
    target_invitation_id,
    'settings_pending_invite_updated',
    jsonb_build_object(
      'invitation_id', target_invitation_id,
      'email', invite_record.email,
      'previous_role', invite_record.role,
      'new_role', next_role,
      'owner_codes_added', '[]'::jsonb,
      'owner_codes_removed', '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.settings_cancel_pending_invite(
  target_company_id uuid,
  target_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  invite_record record;
  target_is_app_admin boolean;
  owner_codes_cleared text[] := '{}'::text[];
begin
  actor_role := public._customer_settings_actor_role(target_company_id, true);

  select invitation.*
  into invite_record
  from public.company_invitations invitation
  where invitation.id = target_invitation_id
    and invitation.company_id = target_company_id
  for update of invitation;

  if not found then
    raise exception 'Pending invitation not found';
  end if;

  if invite_record.accepted_at is not null then
    raise exception 'Accepted invitations cannot be canceled from customer settings';
  end if;

  target_is_app_admin := public._settings_email_is_app_admin(invite_record.email::text);

  if not target_is_app_admin and not public._settings_can_manage_role(actor_role, invite_record.role, invite_record.role) then
    raise exception 'This invitation cannot be canceled by your role';
  end if;

  with cleared as (
    update public.company_owner_codes owner_code
    set user_id = null,
        pending_email = null,
        updated_at = now()
    where owner_code.company_id = target_company_id
      and lower(owner_code.pending_email::text) = lower(invite_record.email::text)
    returning owner_code.code
  )
  select coalesce(array_agg(code order by code), '{}'::text[])
  into owner_codes_cleared
  from cleared;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'company_invitation',
    target_invitation_id,
    'settings_pending_invite_canceled',
    jsonb_build_object(
      'invitation_id', target_invitation_id,
      'email', invite_record.email,
      'previous_role', invite_record.role,
      'owner_codes_cleared', owner_codes_cleared,
      'source', 'customer_settings'
    )
  );

  delete from public.company_invitations invitation
  where invitation.id = target_invitation_id
    and invitation.company_id = target_company_id
    and invitation.accepted_at is null;
end;
$$;

create or replace function public.settings_update_owner_code_assignment(
  target_company_id uuid,
  target_kind text,
  target_id uuid,
  owner_codes text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  actor_role public.app_role;
  target_role public.app_role;
  target_user_id uuid;
  target_email text;
  target_status text;
  target_is_app_admin boolean;
  desired_codes text[] := '{}'::text[];
  previous_codes text[] := '{}'::text[];
  added_codes text[] := '{}'::text[];
  removed_codes text[] := '{}'::text[];
  cleared_codes text[] := '{}'::text[];
  unknown_codes text[] := '{}'::text[];
begin
  actor_role := public._customer_settings_actor_role(target_company_id, true);

  select coalesce(array_agg(distinct cleaned.code order by cleaned.code), '{}'::text[])
  into desired_codes
  from (
    select trim(code_value) as code
    from unnest(coalesce(owner_codes, '{}'::text[])) as code_value
    where nullif(trim(code_value), '') is not null
  ) cleaned;

  if target_kind = 'membership' then
    select membership.role, membership.user_id, profile.email::text, case when profile.email is null then 'needs_profile_email' else 'active' end
    into target_role, target_user_id, target_email, target_status
    from public.company_memberships membership
    left join public.profiles profile on profile.id = membership.user_id
    where membership.id = target_id
      and membership.company_id = target_company_id
    for update of membership;
  elsif target_kind = 'invitation' then
    select invitation.role, null::uuid, invitation.email::text, 'invite_pending'
    into target_role, target_user_id, target_email, target_status
    from public.company_invitations invitation
    where invitation.id = target_id
      and invitation.company_id = target_company_id
      and invitation.accepted_at is null
    for update of invitation;
  else
    raise exception 'Choose a valid access target';
  end if;

  if target_role is null then
    raise exception 'Access target not found';
  end if;

  if array_length(desired_codes, 1) is not null and target_user_id is null and nullif(trim(coalesce(target_email, '')), '') is null then
    raise exception 'Owner-code assignment requires an active member or pending invite email';
  end if;

  target_is_app_admin := public._settings_email_is_app_admin(target_email);

  if target_is_app_admin and array_length(desired_codes, 1) is not null then
    raise exception 'FF admin owner-code assignments can only be cleared from customer settings';
  end if;

  if not target_is_app_admin then
    if target_kind = 'membership' and target_user_id = current_user_id then
      null;
    elsif not public._settings_can_manage_role(actor_role, target_role, target_role) then
      raise exception 'This owner-code assignment cannot be changed by your role';
    end if;
  end if;

  select coalesce(array_agg(code order by code), '{}'::text[])
  into unknown_codes
  from unnest(desired_codes) as requested(code)
  where not exists (
    select 1
    from public.company_owner_codes owner_code
    where owner_code.company_id = target_company_id
      and owner_code.code = requested.code
  );

  if array_length(unknown_codes, 1) is not null then
    raise exception 'Unknown owner code: %', array_to_string(unknown_codes, ', ');
  end if;

  select coalesce(array_agg(owner_code.code order by owner_code.code), '{}'::text[])
  into previous_codes
  from public.company_owner_codes owner_code
  where owner_code.company_id = target_company_id
    and (
      (target_user_id is not null and owner_code.user_id = target_user_id)
      or (
        target_email is not null
        and lower(owner_code.pending_email::text) = lower(target_email)
      )
    );

  with cleared as (
    update public.company_owner_codes owner_code
    set user_id = null,
        pending_email = null,
        updated_at = now()
    where owner_code.company_id = target_company_id
      and (
        (target_user_id is not null and owner_code.user_id = target_user_id)
        or (
          target_email is not null
          and lower(owner_code.pending_email::text) = lower(target_email)
        )
      )
    returning owner_code.code
  )
  select coalesce(array_agg(code order by code), '{}'::text[])
  into cleared_codes
  from cleared;

  update public.company_owner_codes owner_code
  set user_id = target_user_id,
      pending_email = case when target_user_id is null then target_email::citext else null end,
      updated_at = now()
  where owner_code.company_id = target_company_id
    and owner_code.code = any(desired_codes);

  select coalesce(array_agg(value order by value), '{}'::text[])
  into added_codes
  from (
    select unnest(desired_codes) as value
    except
    select unnest(previous_codes) as value
  ) diff;

  select coalesce(array_agg(value order by value), '{}'::text[])
  into removed_codes
  from (
    select unnest(previous_codes) as value
    except
    select unnest(desired_codes) as value
  ) diff;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    target_company_id,
    current_user_id,
    'company_owner_code',
    target_id,
    'settings_owner_codes_updated',
    jsonb_build_object(
      'target_kind', target_kind,
      'target_id', target_id,
      'target_email', target_email,
      'target_status', target_status,
      'added_codes', added_codes,
      'removed_codes', removed_codes,
      'cleared_codes', case when array_length(desired_codes, 1) is null then cleared_codes else '{}'::text[] end
    )
  );
end;
$$;

create or replace function public.accept_company_invite(full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := public.current_user_email();
  invite_record record;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into invite_record
  from public.company_invitations
  where lower(email::text) = current_email
    and accepted_at is null
  order by created_at asc
  limit 1;

  if not found then
    return null;
  end if;

  if exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = current_user_id
      and membership.company_id <> invite_record.company_id
  ) then
    raise exception 'MULTI_COMPANY_MEMBERSHIP_BLOCKED' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, full_name, email)
  values (
    current_user_id,
    coalesce(nullif(trim(full_name), ''), split_part(current_email, '@', 1)),
    current_email
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  insert into public.company_memberships (company_id, user_id, role)
  values (invite_record.company_id, current_user_id, invite_record.role)
  on conflict (company_id, user_id) do update set role = excluded.role;

  update public.company_owner_codes
  set user_id = current_user_id,
      pending_email = null,
      updated_at = now()
  where company_id = invite_record.company_id
    and lower(pending_email::text) = current_email;

  update public.company_invitations
  set accepted_at = now()
  where id = invite_record.id
    and accepted_at is null;

  insert into public.audit_log (company_id, actor_id, entity_type, entity_id, action, metadata)
  values (
    invite_record.company_id,
    current_user_id,
    'company_invitation',
    invite_record.id,
    'invite_accepted',
    jsonb_build_object('email', current_email, 'role', invite_record.role)
  );

  return invite_record.company_id;
end;
$$;

drop policy if exists "Admins can manage invitations" on public.company_invitations;
drop policy if exists "Admins can insert invitations" on public.company_invitations;
drop policy if exists "Admins can update invitations" on public.company_invitations;
drop policy if exists "Admins can delete invitations" on public.company_invitations;

create policy "FF admins can insert invitations" on public.company_invitations
  for insert
  to authenticated
  with check ((select public.is_app_admin()));

create policy "FF admins can update invitations" on public.company_invitations
  for update
  to authenticated
  using ((select public.is_app_admin()))
  with check ((select public.is_app_admin()));

create policy "FF admins can delete invitations" on public.company_invitations
  for delete
  to authenticated
  using ((select public.is_app_admin()));

drop policy if exists "Company members can view owner codes" on public.company_owner_codes;
drop policy if exists "Admins can insert owner codes" on public.company_owner_codes;
drop policy if exists "Admins can update owner codes" on public.company_owner_codes;
drop policy if exists "Admins can delete owner codes" on public.company_owner_codes;

create policy "FF admins can view owner codes" on public.company_owner_codes
  for select
  to authenticated
  using ((select public.is_app_admin()));

create policy "FF admins can insert owner codes" on public.company_owner_codes
  for insert
  to authenticated
  with check ((select public.is_app_admin()));

create policy "FF admins can update owner codes" on public.company_owner_codes
  for update
  to authenticated
  using ((select public.is_app_admin()))
  with check ((select public.is_app_admin()));

create policy "FF admins can delete owner codes" on public.company_owner_codes
  for delete
  to authenticated
  using ((select public.is_app_admin()));

drop policy if exists "Members can view audit log" on public.audit_log;
drop policy if exists "Office users can view audit log" on public.audit_log;
create policy "Office users can view audit log" on public.audit_log
  for select
  to authenticated
  using (
    (
      action like 'settings\_%' escape '\'
      and (
        (select public.is_app_admin())
        or exists (
          select 1
          from public.company_memberships membership
          where membership.company_id = audit_log.company_id
            and membership.user_id = (select auth.uid())
            and membership.role in ('owner', 'office_admin')
        )
      )
    )
    or (
      action not like 'settings\_%' escape '\'
      and public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    )
  );

revoke execute on function public.settings_get_access_rows(uuid) from public, anon;
revoke execute on function public.settings_update_member_access(uuid, uuid, public.app_role) from public, anon;
revoke execute on function public.settings_remove_member_access(uuid, uuid) from public, anon;
revoke execute on function public.settings_update_pending_invite_access(uuid, uuid, public.app_role) from public, anon;
revoke execute on function public.settings_cancel_pending_invite(uuid, uuid) from public, anon;
revoke execute on function public.settings_update_owner_code_assignment(uuid, text, uuid, text[]) from public, anon;
revoke execute on function public.get_queue_owner_codes(uuid) from public, anon;
revoke execute on function public.accept_company_invite(text) from public, anon;

grant execute on function public.settings_get_access_rows(uuid) to authenticated;
grant execute on function public.settings_update_member_access(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.settings_remove_member_access(uuid, uuid) to authenticated;
grant execute on function public.settings_update_pending_invite_access(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.settings_cancel_pending_invite(uuid, uuid) to authenticated;
grant execute on function public.settings_update_owner_code_assignment(uuid, text, uuid, text[]) to authenticated;
grant execute on function public.get_queue_owner_codes(uuid) to authenticated;
grant execute on function public.accept_company_invite(text) to authenticated;
