create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'citext'
      and extnamespace <> 'extensions'::regnamespace
  ) then
    execute 'alter extension citext set schema extensions';
  end if;
end $$;

alter table public.company_invitations
  add column if not exists vessel_id uuid references public.vessels(id) on delete set null;

create index if not exists audit_log_actor_id_idx on public.audit_log(actor_id);
create index if not exists company_invitations_invited_by_idx on public.company_invitations(invited_by);
create index if not exists company_invitations_vessel_id_idx on public.company_invitations(vessel_id);
create index if not exists company_memberships_user_id_idx on public.company_memberships(user_id);
create index if not exists compliance_events_created_by_idx on public.compliance_events(created_by);
create index if not exists compliance_events_owner_id_idx on public.compliance_events(owner_id);
create index if not exists compliance_events_vessel_id_idx on public.compliance_events(vessel_id);
create index if not exists compliance_item_notification_recipients_company_id_idx on public.compliance_item_notification_recipients(company_id);
create index if not exists compliance_item_reminder_rules_company_id_idx on public.compliance_item_reminder_rules(company_id);
create index if not exists compliance_item_status_history_changed_by_idx on public.compliance_item_status_history(changed_by);
create index if not exists compliance_item_status_history_company_id_idx on public.compliance_item_status_history(company_id);
create index if not exists compliance_item_status_history_item_id_idx on public.compliance_item_status_history(item_id);
create index if not exists compliance_items_created_by_idx on public.compliance_items(created_by);
create index if not exists compliance_items_previous_item_id_idx on public.compliance_items(previous_item_id);
create index if not exists compliance_items_vessel_id_idx on public.compliance_items(vessel_id);
create index if not exists email_queue_company_id_idx on public.email_queue(company_id);
create index if not exists email_queue_event_id_idx on public.email_queue(event_id);
create index if not exists reminder_send_log_company_id_idx on public.reminder_send_log(company_id);
create index if not exists reminder_send_log_item_id_idx on public.reminder_send_log(item_id);
create index if not exists vessel_contacts_user_id_idx on public.vessel_contacts(user_id);

create or replace function public.schedule_due_reminders(target_run_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued_count integer := 0;
  current_user_id uuid := auth.uid();
  can_run_globally boolean := false;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  can_run_globally := public.is_app_admin();

  insert into public.reminder_send_log (company_id, item_id, reminder_rule_id, recipient_email, subject, body, scheduled_for)
  select
    item.company_id,
    item.id,
    rule.id,
    recipient.recipient_email,
    'Reminder: ' || item.item_name,
    concat_ws(E'
',
      'Reminder: ' || item.item_name,
      'Vessel/company: ' || coalesce(vessel.name, 'Company-wide'),
      'Owner: ' || coalesce(item.owner_current, 'Unassigned'),
      'Start working on: ' || coalesce(item.start_working_on::text, 'Not set'),
      'Expiration date: ' || coalesce(item.expiration_date::text, 'Not set'),
      'Status: ' || item.status::text,
      case when nullif(trim(coalesce(item.instructions, '')), '') is not null then 'Instructions: ' || item.instructions else null end
    ),
    target_run_date::timestamptz + time '08:00'
  from public.compliance_items item
  join public.compliance_item_reminder_rules rule on rule.item_id = item.id and rule.active
  join public.compliance_item_notification_recipients recipient on recipient.item_id = item.id
  left join public.vessels vessel on vessel.id = item.vessel_id
  where item.status not in ('complete', 'discontinued')
    and (
      can_run_globally
      or exists (
        select 1
        from public.company_memberships membership
        where membership.company_id = item.company_id
          and membership.user_id = current_user_id
          and membership.role in ('owner', 'office_admin', 'office_user')
      )
    )
    and (
      (rule.trigger_type = 'on_start_date' and item.start_working_on = target_run_date)
      or (rule.trigger_type = 'days_before_expiration' and item.expiration_date - coalesce(rule.days_before, 0) = target_run_date)
      or (
        rule.trigger_type = 'repeat_after_start'
        and item.start_working_on is not null
        and item.start_working_on <= target_run_date
        and coalesce(rule.repeat_every_days, 0) > 0
        and ((target_run_date - item.start_working_on) % rule.repeat_every_days = 0)
      )
    )
  on conflict do nothing;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;

revoke execute on function public.accept_company_invite(text) from public, anon;
revoke execute on function public.complete_compliance_item(uuid, date, text, boolean, date, date) from public, anon;
revoke execute on function public.create_company_workspace(text, text) from public, anon;
revoke execute on function public.create_compliance_event(text, timestamptz, uuid, public.event_category, public.event_priority, public.compliance_status, text, text) from public, anon;
revoke execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text) from public, anon;
revoke execute on function public.create_default_reminder_rules(uuid) from public, anon, authenticated;
revoke execute on function public.current_user_email() from public, anon;
revoke execute on function public.has_company_role(uuid, public.app_role[]) from public, anon;
revoke execute on function public.is_app_admin() from public, anon;
revoke execute on function public.is_company_member(uuid) from public, anon;
revoke execute on function public.save_initial_vessels(text[]) from public, anon;
revoke execute on function public.schedule_due_reminders(date) from public, anon;
revoke execute on function public.update_compliance_item_status(uuid, public.compliance_item_status, text) from public, anon;

grant execute on function public.accept_company_invite(text) to authenticated;
grant execute on function public.complete_compliance_item(uuid, date, text, boolean, date, date) to authenticated;
grant execute on function public.create_company_workspace(text, text) to authenticated;
grant execute on function public.create_compliance_event(text, timestamptz, uuid, public.event_category, public.event_priority, public.compliance_status, text, text) to authenticated;
grant execute on function public.create_compliance_item(uuid, uuid, text, text, text, text, text, text, text, public.recurrence_unit, integer, date, date, text, text, text) to authenticated;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.has_company_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.save_initial_vessels(text[]) to authenticated;
grant execute on function public.schedule_due_reminders(date) to authenticated;
grant execute on function public.update_compliance_item_status(uuid, public.compliance_item_status, text) to authenticated;

drop policy if exists "Users can view their profile" on public.profiles;
create policy "Users can view their profile" on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Members and admins can view memberships" on public.company_memberships;
create policy "Members and admins can view memberships" on public.company_memberships
  for select
  to authenticated
  using (
    (select public.is_app_admin())
    or user_id = (select auth.uid())
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  );

drop policy if exists "Office and assigned vessel users can view events" on public.compliance_events;
create policy "Office and assigned vessel users can view events" on public.compliance_events
  for select
  to authenticated
  using (
    public.has_company_role(company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    or exists (
      select 1
      from public.vessel_contacts contact
      where contact.vessel_id = compliance_events.vessel_id
        and contact.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admins and invitees can view invitations" on public.company_invitations;
create policy "Admins and invitees can view invitations" on public.company_invitations
  for select
  to authenticated
  using (
    (select public.is_app_admin())
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
    or lower(email::text) = (select public.current_user_email())
  );

drop policy if exists "Admins can manage invitations" on public.company_invitations;

create policy "Admins can insert invitations" on public.company_invitations
  for insert
  to authenticated
  with check (
    (select public.is_app_admin())
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  );

create policy "Admins can update invitations" on public.company_invitations
  for update
  to authenticated
  using (
    (select public.is_app_admin())
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  )
  with check (
    (select public.is_app_admin())
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  );

create policy "Admins can delete invitations" on public.company_invitations
  for delete
  to authenticated
  using (
    (select public.is_app_admin())
    or public.has_company_role(company_id, array['owner', 'office_admin']::public.app_role[])
  );

drop policy if exists "Office users can view vessel contacts" on public.vessel_contacts;
create policy "Office users can view vessel contacts" on public.vessel_contacts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.vessels vessel
      where vessel.id = vessel_contacts.vessel_id
        and public.has_company_role(vessel.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    )
  );

drop policy if exists "Admins can insert vessel contacts" on public.vessel_contacts;
create policy "Admins can insert vessel contacts" on public.vessel_contacts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.vessels vessel
      where vessel.id = vessel_contacts.vessel_id
        and public.has_company_role(vessel.company_id, array['owner', 'office_admin']::public.app_role[])
    )
  );

drop policy if exists "Admins can update vessel contacts" on public.vessel_contacts;
create policy "Admins can update vessel contacts" on public.vessel_contacts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.vessels vessel
      where vessel.id = vessel_contacts.vessel_id
        and public.has_company_role(vessel.company_id, array['owner', 'office_admin']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.vessels vessel
      where vessel.id = vessel_contacts.vessel_id
        and public.has_company_role(vessel.company_id, array['owner', 'office_admin']::public.app_role[])
    )
  );

drop policy if exists "Admins can delete vessel contacts" on public.vessel_contacts;
create policy "Admins can delete vessel contacts" on public.vessel_contacts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.vessels vessel
      where vessel.id = vessel_contacts.vessel_id
        and public.has_company_role(vessel.company_id, array['owner', 'office_admin']::public.app_role[])
    )
  );

drop policy if exists "Office users can view event reminder rules" on public.event_reminder_rules;
create policy "Office users can view event reminder rules" on public.event_reminder_rules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.compliance_events event
      where event.id = event_reminder_rules.event_id
        and public.has_company_role(event.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    )
  );

drop policy if exists "Office users can insert event reminder rules" on public.event_reminder_rules;
create policy "Office users can insert event reminder rules" on public.event_reminder_rules
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.compliance_events event
      where event.id = event_reminder_rules.event_id
        and public.has_company_role(event.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    )
  );

drop policy if exists "Office users can update event reminder rules" on public.event_reminder_rules;
create policy "Office users can update event reminder rules" on public.event_reminder_rules
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.compliance_events event
      where event.id = event_reminder_rules.event_id
        and public.has_company_role(event.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.compliance_events event
      where event.id = event_reminder_rules.event_id
        and public.has_company_role(event.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    )
  );

drop policy if exists "Office users can delete event reminder rules" on public.event_reminder_rules;
create policy "Office users can delete event reminder rules" on public.event_reminder_rules
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.compliance_events event
      where event.id = event_reminder_rules.event_id
        and public.has_company_role(event.company_id, array['owner', 'office_admin', 'office_user']::public.app_role[])
    )
  );
