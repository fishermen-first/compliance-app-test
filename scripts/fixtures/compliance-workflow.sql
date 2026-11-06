-- Isolated Postgres fixture. No credentials, external connections, or customer records.
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
create type public.compliance_item_status as enum ('not_started', 'in_progress', 'submitted', 'complete', 'discontinued');
create type public.recurrence_unit as enum ('years', 'months', 'manual', 'none');
create type public.reminder_status as enum ('scheduled', 'queued', 'sent', 'failed', 'skipped');
create table public.profiles (id uuid primary key, email text);
create table public.companies (id uuid primary key, timezone text);
create table public.company_memberships (company_id uuid, user_id uuid, role text);
create table public.vessels (id uuid primary key, name text);
create table public.company_owner_codes (company_id uuid, code text, user_id uuid);
create table public.compliance_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, vessel_id uuid,
  owner_raw text, owner_current text, item_name text not null, item_number text,
  agency_type text, agency_id uuid, compliance_area text, frequency_label text, period_label text,
  recurrence_unit public.recurrence_unit not null default 'none', recurrence_interval integer,
  start_working_on date, expiration_date date, status public.compliance_item_status not null default 'not_started',
  status_notes text, instructions text, sharepoint_url text, previous_item_id uuid,
  created_by uuid, completed_at date, discontinued_at date,
  last_non_import_activity_at timestamptz, updated_at timestamptz default now()
);
create table public.compliance_item_owner_codes (item_id uuid, owner_code text, is_primary boolean default false, unique(item_id,owner_code));
create table public.compliance_item_status_history (
  id uuid default gen_random_uuid(), item_id uuid, company_id uuid, changed_by uuid,
  from_status public.compliance_item_status, to_status public.compliance_item_status, notes text, changed_at timestamptz default now()
);
create table public.compliance_item_reminder_rules (
  id uuid primary key default gen_random_uuid(), item_id uuid, company_id uuid, label text,
  trigger_type text, days_before integer, repeat_every_days integer, send_on date,
  audience text default 'owner', active boolean default true
);
create table public.compliance_item_notification_recipients (
  item_id uuid, company_id uuid, recipient_name text, recipient_email text,
  recipient_type text default 'additional', external_contact_id uuid, contact_group_id uuid,
  unique(item_id,recipient_email)
);
create table public.contact_group_members (company_id uuid, group_id uuid, email text);
create table public.reminder_send_log (
  id uuid primary key default gen_random_uuid(), company_id uuid, item_id uuid,
  reminder_rule_id uuid, recipient_email text, subject text, body text,
  status public.reminder_status not null default 'scheduled', scheduled_for timestamptz,
  sent_at timestamptz, claimed_at timestamptz, send_attempts integer default 0,
  failure_reason text, unique(reminder_rule_id,recipient_email,scheduled_for)
);
create function public.is_app_admin() returns boolean language sql stable as $$
  select coalesce(current_setting('test.app_admin', true), '') = 'yes';
$$;
create function public.normalize_owner_code_list(codes text[], fallback text default null) returns text[] language sql as $$
  select coalesce(codes, case when fallback is null then '{}'::text[] else array[fallback] end);
$$;
create function public.sync_compliance_item_owner_codes(target uuid, codes text[]) returns void language sql as $$
  insert into public.compliance_item_owner_codes(item_id,owner_code,is_primary)
  select target, code, position = 1 from unnest(codes) with ordinality as c(code, position);
$$;
