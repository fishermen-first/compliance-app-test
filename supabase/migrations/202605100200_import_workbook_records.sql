create or replace function public.import_compliance_workbook_records(
  target_company_id uuid,
  target_sheet text,
  records jsonb
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  record jsonb;
  imported_count integer := 0;
begin
  for record in select * from jsonb_array_elements(records)
  loop
    insert into public.compliance_items (
      company_id,
      vessel_id,
      owner_raw,
      owner_current,
      item_name,
      item_number,
      agency_type,
      compliance_area,
      frequency_label,
      recurrence_unit,
      recurrence_interval,
      start_working_on,
      expiration_date,
      status,
      status_notes,
      instructions,
      source_sheet,
      source_row_number
    ) values (
      target_company_id,
      nullif(record->>'vesselId', '')::uuid,
      nullif(record->>'ownerRaw', ''),
      nullif(record->>'ownerCurrent', ''),
      record->>'itemName',
      nullif(record->>'itemNumber', ''),
      nullif(record->>'agencyType', ''),
      coalesce(nullif(record->>'complianceArea', ''), 'Other'),
      nullif(record->>'frequencyLabel', ''),
      coalesce(nullif(record->>'recurrenceUnit', ''), 'none')::public.recurrence_unit,
      nullif(record->>'recurrenceInterval', '')::integer,
      nullif(record->>'startWorkingOn', '')::date,
      nullif(record->>'expirationDate', '')::date,
      coalesce(nullif(record->>'status', ''), 'not_started')::public.compliance_item_status,
      nullif(record->>'statusNotes', ''),
      nullif(record->>'instructions', ''),
      target_sheet,
      (record->>'sourceRowNumber')::integer
    )
    on conflict (company_id, source_sheet, source_row_number)
    where source_sheet is not null and source_row_number is not null
    do update set
      vessel_id = excluded.vessel_id,
      owner_raw = excluded.owner_raw,
      owner_current = excluded.owner_current,
      item_name = excluded.item_name,
      item_number = excluded.item_number,
      agency_type = excluded.agency_type,
      compliance_area = excluded.compliance_area,
      frequency_label = excluded.frequency_label,
      recurrence_unit = excluded.recurrence_unit,
      recurrence_interval = excluded.recurrence_interval,
      start_working_on = excluded.start_working_on,
      expiration_date = excluded.expiration_date,
      status = excluded.status,
      status_notes = excluded.status_notes,
      instructions = excluded.instructions,
      updated_at = now();

    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;

revoke execute on function public.import_compliance_workbook_records(uuid, text, jsonb) from anon, authenticated;
grant execute on function public.import_compliance_workbook_records(uuid, text, jsonb) to service_role;
