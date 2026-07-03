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
