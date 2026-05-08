create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'office_admin', 'office_user', 'vessel_user');
create type public.compliance_status as enum ('draft', 'active', 'waiting_on_vessel', 'office_review', 'complete', 'archived');
create type public.event_priority as enum ('low', 'medium', 'high');
create type public.event_category as enum ('inspection', 'report', 'audit', 'permit', 'training', 'other');
create type public.reminder_status as enum ('scheduled', 'queued', 'sent', 'failed', 'skipped');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Anchorage',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'office_user',
  created_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create table public.vessels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

create table public.vessel_contacts (
  id uuid primary key default gen_random_uuid(),
  vessel_id uuid not null references public.vessels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_acknowledge boolean not null default true,
  created_at timestamptz not null default now(),
  unique(vessel_id, user_id)
);

create table public.compliance_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vessel_id uuid references public.vessels(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  category public.event_category not null default 'other',
  priority public.event_priority not null default 'medium',
  status public.compliance_status not null default 'draft',
  due_at timestamptz not null,
  notes text,
  sharepoint_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.compliance_events(id) on delete cascade,
  days_before integer not null check (days_before >= 0),
  send_time time not null default '08:00',
  created_at timestamptz not null default now(),
  unique(event_id, days_before, send_time)
);

create table public.email_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid references public.compliance_events(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  status public.reminder_status not null default 'scheduled',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  provider_message_id text,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index compliance_events_company_due_idx on public.compliance_events(company_id, due_at);
create index compliance_events_company_status_idx on public.compliance_events(company_id, status);
create index email_queue_due_idx on public.email_queue(status, scheduled_for);
create index audit_log_company_entity_idx on public.audit_log(company_id, entity_type, entity_id);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.vessels enable row level security;
alter table public.vessel_contacts enable row level security;
alter table public.compliance_events enable row level security;
alter table public.event_reminder_rules enable row level security;
alter table public.email_queue enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships
    where company_id = target_company_id
      and user_id = auth.uid()
  );
$$;

create policy "Members can view companies" on public.companies
  for select using (public.is_company_member(id));

create policy "Users can view their profile" on public.profiles
  for select using (id = auth.uid());

create policy "Members can view memberships" on public.company_memberships
  for select using (public.is_company_member(company_id));

create policy "Members can view vessels" on public.vessels
  for select using (public.is_company_member(company_id));

create policy "Members can view events" on public.compliance_events
  for select using (public.is_company_member(company_id));

create policy "Members can view email queue" on public.email_queue
  for select using (public.is_company_member(company_id));

create policy "Members can view audit log" on public.audit_log
  for select using (public.is_company_member(company_id));
