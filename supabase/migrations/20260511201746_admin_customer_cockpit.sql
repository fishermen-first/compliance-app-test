alter table public.company_owner_codes
  add column if not exists handoff_exempt boolean not null default false,
  add column if not exists handoff_exemption_reason text,
  add column if not exists handoff_exempted_by uuid references public.profiles(id) on delete set null,
  add column if not exists handoff_exempted_at timestamptz;

alter table public.company_owner_codes
  drop constraint if exists company_owner_codes_handoff_exemption_reason_check;

alter table public.company_owner_codes
  add constraint company_owner_codes_handoff_exemption_reason_check
  check (
    handoff_exempt = false
    or nullif(trim(coalesce(handoff_exemption_reason, '')), '') is not null
  );

create index if not exists company_owner_codes_handoff_exempt_idx
  on public.company_owner_codes(company_id, handoff_exempt);

create table if not exists public.company_import_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sheet_name text not null,
  workbook_name text,
  record_count integer not null default 0 check (record_count >= 0),
  vessel_count integer not null default 0 check (vessel_count >= 0),
  owner_code_count integer not null default 0 check (owner_code_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists company_import_runs_company_created_idx
  on public.company_import_runs(company_id, created_at desc);

alter table public.company_import_runs enable row level security;

drop policy if exists "FF admins can view import runs" on public.company_import_runs;
create policy "FF admins can view import runs" on public.company_import_runs
  for select
  to authenticated
  using ((select public.is_app_admin()));

create table if not exists public.company_import_warnings (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.company_import_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  row_number integer,
  issue text not null,
  value text,
  severity text not null default 'review'
    check (severity in ('info', 'review', 'fix')),
  created_at timestamptz not null default now()
);

create index if not exists company_import_warnings_run_idx
  on public.company_import_warnings(import_run_id);

create index if not exists company_import_warnings_company_idx
  on public.company_import_warnings(company_id);

alter table public.company_import_warnings enable row level security;

drop policy if exists "FF admins can view import warnings" on public.company_import_warnings;
create policy "FF admins can view import warnings" on public.company_import_warnings
  for select
  to authenticated
  using ((select public.is_app_admin()));
