create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind text not null default 'agency',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_company_id_id_key unique (company_id, id),
  constraint agencies_name_not_blank_check check (length(trim(name)) > 0),
  constraint agencies_kind_check check (kind in ('agency', 'coop', 'certification', 'internal'))
);

create unique index if not exists agencies_company_normalized_name_idx
  on public.agencies(company_id, public.import_v2_normalize(name));

create table if not exists public.agency_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agency_id uuid not null,
  alias text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_aliases_agency_fk
    foreign key (company_id, agency_id)
    references public.agencies(company_id, id)
    on delete cascade,
  constraint agency_aliases_alias_not_blank_check check (length(trim(alias)) > 0)
);

create unique index if not exists agency_aliases_company_normalized_alias_idx
  on public.agency_aliases(company_id, public.import_v2_normalize(alias));

create index if not exists agency_aliases_agency_id_idx
  on public.agency_aliases(agency_id);

create table if not exists public.external_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text,
  email text not null,
  role text not null default 'other',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_contacts_email_not_blank_check check (length(trim(email)) > 0),
  constraint external_contacts_email_trimmed_check check (email = trim(email)),
  constraint external_contacts_role_check check (
    role in ('master', 'mate', 'engineer', 'purser', 'factory_manager', 'office', 'other')
  )
);

create unique index if not exists external_contacts_company_lower_email_idx
  on public.external_contacts(company_id, lower(trim(email)));

create index if not exists external_contacts_company_active_idx
  on public.external_contacts(company_id, active);

create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_groups_company_id_id_key unique (company_id, id),
  constraint contact_groups_name_not_blank_check check (length(trim(name)) > 0)
);

create unique index if not exists contact_groups_company_normalized_name_idx
  on public.contact_groups(company_id, public.import_v2_normalize(name));

create table if not exists public.contact_group_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null,
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  constraint contact_group_members_group_fk
    foreign key (company_id, group_id)
    references public.contact_groups(company_id, id)
    on delete cascade,
  constraint contact_group_members_email_not_blank_check check (length(trim(email)) > 0),
  constraint contact_group_members_email_trimmed_check check (email = trim(email))
);

create unique index if not exists contact_group_members_group_lower_email_idx
  on public.contact_group_members(group_id, lower(trim(email)));

create index if not exists contact_group_members_company_group_idx
  on public.contact_group_members(company_id, group_id);

alter table public.compliance_items
  add column if not exists agency_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'compliance_items_company_agency_fk'
      and conrelid = 'public.compliance_items'::regclass
  ) then
    alter table public.compliance_items
      add constraint compliance_items_company_agency_fk
      foreign key (company_id, agency_id)
      references public.agencies(company_id, id);
  end if;
end $$;

create index if not exists compliance_items_agency_id_idx
  on public.compliance_items(agency_id)
  where agency_id is not null;

create index if not exists compliance_items_company_agency_idx
  on public.compliance_items(company_id, agency_id)
  where agency_id is not null;

create or replace function public.reseed_vessels_from_items(target_company_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
  changed_count integer := 0;
begin
  with raw_vessel_scopes as (
    select
      item.company_id,
      trim(item.source_vessel_or_scope) as name,
      public.import_v2_normalize(item.source_vessel_or_scope) as normalized_name,
      count(*) as item_count
    from public.compliance_items item
    where (target_company_id is null or item.company_id = target_company_id)
      and item.source_vessel_or_scope is not null
      and not public.import_v2_is_company_wide_scope(item.source_vessel_or_scope)
    group by
      item.company_id,
      trim(item.source_vessel_or_scope),
      public.import_v2_normalize(item.source_vessel_or_scope)

    union all

    select
      item.company_id,
      trim(vessel.name) as name,
      public.import_v2_normalize(vessel.name) as normalized_name,
      count(*) as item_count
    from public.compliance_items item
    join public.vessels vessel on vessel.id = item.vessel_id
    where (target_company_id is null or item.company_id = target_company_id)
      and item.source_vessel_or_scope is null
      and not public.import_v2_is_company_wide_scope(vessel.name)
    group by
      item.company_id,
      trim(vessel.name),
      public.import_v2_normalize(vessel.name)
  ),
  ranked_vessel_scopes as (
    select
      company_id,
      name,
      normalized_name,
      row_number() over (
        partition by company_id, normalized_name
        order by item_count desc, name asc
      ) as rank
    from raw_vessel_scopes
    where normalized_name is not null
  ),
  chosen_vessel_scopes as (
    select company_id, name, normalized_name
    from ranked_vessel_scopes
    where rank = 1
  )
  update public.vessels vessel
  set active = true,
      updated_at = now()
  from chosen_vessel_scopes scope
  where vessel.company_id = scope.company_id
    and public.import_v2_normalize(vessel.name) = scope.normalized_name
    and not vessel.active;

  get diagnostics changed_count = row_count;
  affected_count := affected_count + changed_count;

  with raw_vessel_scopes as (
    select
      item.company_id,
      trim(item.source_vessel_or_scope) as name,
      public.import_v2_normalize(item.source_vessel_or_scope) as normalized_name,
      count(*) as item_count
    from public.compliance_items item
    where (target_company_id is null or item.company_id = target_company_id)
      and item.source_vessel_or_scope is not null
      and not public.import_v2_is_company_wide_scope(item.source_vessel_or_scope)
    group by
      item.company_id,
      trim(item.source_vessel_or_scope),
      public.import_v2_normalize(item.source_vessel_or_scope)

    union all

    select
      item.company_id,
      trim(vessel.name) as name,
      public.import_v2_normalize(vessel.name) as normalized_name,
      count(*) as item_count
    from public.compliance_items item
    join public.vessels vessel on vessel.id = item.vessel_id
    where (target_company_id is null or item.company_id = target_company_id)
      and item.source_vessel_or_scope is null
      and not public.import_v2_is_company_wide_scope(vessel.name)
    group by
      item.company_id,
      trim(vessel.name),
      public.import_v2_normalize(vessel.name)
  ),
  ranked_vessel_scopes as (
    select
      company_id,
      name,
      normalized_name,
      row_number() over (
        partition by company_id, normalized_name
        order by item_count desc, name asc
      ) as rank
    from raw_vessel_scopes
    where normalized_name is not null
  ),
  chosen_vessel_scopes as (
    select company_id, name, normalized_name
    from ranked_vessel_scopes
    where rank = 1
  )
  insert into public.vessels (company_id, name, active, updated_at)
  select scope.company_id, scope.name, true, now()
  from chosen_vessel_scopes scope
  where not exists (
    select 1
    from public.vessels existing
    where existing.company_id = scope.company_id
      and public.import_v2_normalize(existing.name) = scope.normalized_name
  );

  get diagnostics changed_count = row_count;
  affected_count := affected_count + changed_count;

  return affected_count;
end;
$$;

revoke execute on function public.reseed_vessels_from_items(uuid) from public, anon, authenticated;
grant execute on function public.reseed_vessels_from_items(uuid) to service_role;

alter table public.agencies enable row level security;
alter table public.agency_aliases enable row level security;
alter table public.external_contacts enable row level security;
alter table public.contact_groups enable row level security;
alter table public.contact_group_members enable row level security;

drop policy if exists "Company members can view agencies" on public.agencies;
create policy "Company members can view agencies" on public.agencies
  for select
  to authenticated
  using (public.is_company_member(company_id));

drop policy if exists "Reference list editors can manage agencies" on public.agencies;
create policy "Reference list editors can manage agencies" on public.agencies
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]));

drop policy if exists "Company members can view agency aliases" on public.agency_aliases;
create policy "Company members can view agency aliases" on public.agency_aliases
  for select
  to authenticated
  using (public.is_company_member(company_id));

drop policy if exists "Reference list editors can manage agency aliases" on public.agency_aliases;
create policy "Reference list editors can manage agency aliases" on public.agency_aliases
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]));

drop policy if exists "Company members can view external contacts" on public.external_contacts;
create policy "Company members can view external contacts" on public.external_contacts
  for select
  to authenticated
  using (public.is_company_member(company_id));

drop policy if exists "Reference list editors can manage external contacts" on public.external_contacts;
create policy "Reference list editors can manage external contacts" on public.external_contacts
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]));

drop policy if exists "Company members can view contact groups" on public.contact_groups;
create policy "Company members can view contact groups" on public.contact_groups
  for select
  to authenticated
  using (public.is_company_member(company_id));

drop policy if exists "Reference list editors can manage contact groups" on public.contact_groups;
create policy "Reference list editors can manage contact groups" on public.contact_groups
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]));

drop policy if exists "Company members can view contact group members" on public.contact_group_members;
create policy "Company members can view contact group members" on public.contact_group_members
  for select
  to authenticated
  using (public.is_company_member(company_id));

drop policy if exists "Reference list editors can manage contact group members" on public.contact_group_members;
create policy "Reference list editors can manage contact group members" on public.contact_group_members
  for all
  to authenticated
  using (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]))
  with check (public.has_company_role(company_id, array['owner', 'office_user']::public.app_role[]));

with agency_values as (
  select
    item.company_id,
    trim(item.agency_type) as name,
    public.import_v2_normalize(item.agency_type) as normalized_name,
    count(*) as item_count
  from public.compliance_items item
  where public.import_v2_normalize(item.agency_type) is not null
  group by item.company_id, trim(item.agency_type), public.import_v2_normalize(item.agency_type)
),
ranked_agencies as (
  select
    company_id,
    name,
    normalized_name,
    row_number() over (
      partition by company_id, normalized_name
      order by item_count desc, name asc
    ) as rank
  from agency_values
)
insert into public.agencies (company_id, name, kind)
select company_id, name, 'agency'
from ranked_agencies agency
where agency.rank = 1
  and not exists (
    select 1
    from public.agencies existing
    where existing.company_id = agency.company_id
      and public.import_v2_normalize(existing.name) = agency.normalized_name
  );

select public.reseed_vessels_from_items();

update public.compliance_items item
set agency_id = agency.id
from public.agencies agency
where public.import_v2_normalize(item.agency_type) is not null
  and agency.company_id = item.company_id
  and public.import_v2_normalize(agency.name) = public.import_v2_normalize(item.agency_type)
  and item.agency_id is distinct from agency.id;
