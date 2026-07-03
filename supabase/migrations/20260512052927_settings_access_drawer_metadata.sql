drop function if exists public.settings_get_access_rows(uuid);

create function public.settings_get_access_rows(target_company_id uuid)
returns table (
  target_kind text,
  target_id uuid,
  target_user_id uuid,
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
  invited_by_display_name text,
  invited_at timestamptz,
  joined_at timestamptz,
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
      coalesce(nullif(inviter.full_name, ''), inviter.email::text) as invited_by_display_name,
      public._settings_email_is_app_admin(invitation.email::text) as is_app_admin,
      coalesce(
        array_agg(distinct owner_code.code order by owner_code.code)
          filter (where owner_code.code is not null),
        '{}'::text[]
      ) as assigned_codes
    from public.company_invitations invitation
    left join public.profiles inviter on inviter.id = invitation.invited_by
    left join public.company_owner_codes owner_code
      on owner_code.company_id = invitation.company_id
     and lower(owner_code.pending_email::text) = lower(invitation.email::text)
    where invitation.company_id = target_company_id
      and invitation.accepted_at is null
    group by invitation.id, invitation.email, invitation.role, invitation.created_at, inviter.full_name, inviter.email
  )
  select
    'membership'::text as target_kind,
    row.id as target_id,
    row.user_id as target_user_id,
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
    null::text as invited_by_display_name,
    null::timestamptz as invited_at,
    row.created_at as joined_at,
    row.created_at
  from membership_rows row
  union all
  select
    'invitation'::text as target_kind,
    row.id as target_id,
    null::uuid as target_user_id,
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
    row.invited_by_display_name,
    row.created_at as invited_at,
    null::timestamptz as joined_at,
    row.created_at
  from invite_rows row
  order by 7 asc, 18 asc;
end;
$$;

revoke execute on function public.settings_get_access_rows(uuid) from public, anon;
grant execute on function public.settings_get_access_rows(uuid) to authenticated;
