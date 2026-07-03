create or replace function public.enforce_controlled_auth_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_email text := lower(new.email::text);
begin
  if requested_email is null or requested_email = '' then
    raise exception 'Auth users must be created from an invited email address.';
  end if;

  if exists (
    select 1
    from public.app_admins
    where lower(email::text) = requested_email
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.company_invitations
    where lower(email::text) = requested_email
  ) then
    return new;
  end if;

  raise exception 'Auth users must be created from an invited email address.';
end;
$$;

drop trigger if exists enforce_controlled_auth_signup on auth.users;
create trigger enforce_controlled_auth_signup
  before insert on auth.users
  for each row
  execute function public.enforce_controlled_auth_signup();
