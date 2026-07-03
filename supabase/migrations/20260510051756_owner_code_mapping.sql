create table if not exists public.company_owner_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  display_name text,
  user_id uuid references public.profiles(id) on delete set null,
  pending_email citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_owner_codes_code_trimmed_check check (code = trim(code)),
  constraint company_owner_codes_one_assignment_check check (user_id is null or pending_email is null),
  constraint company_owner_codes_unique_code unique (company_id, code)
);

create index if not exists company_owner_codes_company_idx on public.company_owner_codes(company_id);
create index if not exists company_owner_codes_user_idx on public.company_owner_codes(user_id);
create index if not exists company_owner_codes_pending_email_idx on public.company_owner_codes(company_id, pending_email)
  where pending_email is not null;

alter table public.company_owner_codes enable row level security;

drop policy if exists "Company members can view owner codes" on public.company_owner_codes;
create policy "Company members can view owner codes" on public.company_owner_codes
  for select to authenticated using (public.is_company_member(company_id));

drop policy if exists "Admins can insert owner codes" on public.company_owner_codes;
create policy "Admins can insert owner codes" on public.company_owner_codes
  for insert to authenticated with check (public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[]));

drop policy if exists "Admins can update owner codes" on public.company_owner_codes;
create policy "Admins can update owner codes" on public.company_owner_codes
  for update to authenticated using (public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[]));

drop policy if exists "Admins can delete owner codes" on public.company_owner_codes;
create policy "Admins can delete owner codes" on public.company_owner_codes
  for delete to authenticated using (public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[]));

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
  where id = invite_record.id;

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

grant execute on function public.accept_company_invite(text) to authenticated;
