create or replace function public.update_compliance_item_status(
  target_item_id uuid,
  next_status public.compliance_item_status,
  next_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item_record record;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if next_status is null then
    raise exception 'Status is required';
  end if;

  select * into item_record
  from public.compliance_items
  where id = target_item_id;

  if not found then
    raise exception 'Compliance item not found';
  end if;

  if next_status = 'complete' and item_record.status is distinct from 'complete' then
    raise exception 'Use complete_compliance_item to mark an item complete';
  end if;

  if not public.can_manage_compliance_item(item_record.id) then
    raise exception 'You do not have permission to update this item';
  end if;

  if item_record.status is distinct from next_status then
    insert into public.compliance_item_status_history (item_id, company_id, changed_by, from_status, to_status, notes)
    values (item_record.id, item_record.company_id, current_user_id, item_record.status, next_status, nullif(trim(coalesce(next_notes, '')), ''));
  end if;

  update public.compliance_items
  set status = next_status,
      status_notes = coalesce(nullif(trim(coalesce(next_notes, '')), ''), status_notes),
      discontinued_at = case when next_status = 'discontinued' then coalesce(discontinued_at, current_date) else discontinued_at end,
      updated_at = now()
  where id = item_record.id;
end;
$$;

grant execute on function public.update_compliance_item_status(uuid, public.compliance_item_status, text) to authenticated;
