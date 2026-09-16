-- One atomic reservation per email across all application instances.
-- Store only a SHA-256 email digest, never an email address or login token.
create table public.login_link_requests (
  email_digest text primary key check (email_digest ~ '^[a-f0-9]{64}$'),
  requested_at timestamptz not null default now()
);
alter table public.login_link_requests enable row level security;
revoke all on public.login_link_requests from public, anon, authenticated;
grant select, insert, update on public.login_link_requests to service_role;

create function public.reserve_login_link_request(p_email_digest text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare claimed boolean;
begin
  insert into public.login_link_requests as current_request (email_digest, requested_at)
  values (p_email_digest, clock_timestamp())
  on conflict (email_digest) do update
    set requested_at = excluded.requested_at
    where current_request.requested_at <= clock_timestamp() - interval '60 seconds'
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.reserve_login_link_request(text) from public, anon, authenticated;
grant execute on function public.reserve_login_link_request(text) to service_role;
