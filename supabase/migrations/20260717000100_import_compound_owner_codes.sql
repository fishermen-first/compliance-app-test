create or replace function public.parse_compound_owner_codes(owner_value text)
returns text[]
language sql
immutable
set search_path = public
as $$
  with split_codes as (
    select trim(value) as code, ordinal
    from regexp_split_to_table(
      nullif(trim(coalesce(owner_value, '')), ''),
      E'\\s*(-->|→|/)\\s*'
    ) with ordinality as parsed(value, ordinal)
  ),
  cleaned as (
    select code, min(ordinal) as first_ordinal
    from split_codes
    where nullif(code, '') is not null
    group by code
  )
  select coalesce(array_agg(code order by first_ordinal), array[]::text[])
  from cleaned;
$$;

create or replace function public.sync_compliance_item_primary_owner_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_owner_codes text[];
  source_compound_code text;
  selected_owner_code text;
begin
  if current_setting('app.owner_code_syncing', true) = 'on' then
    return new;
  end if;

  selected_owner_codes := case
    when new.owner_current is not distinct from new.owner_raw
      then public.parse_compound_owner_codes(new.owner_raw)
    when nullif(trim(coalesce(new.owner_current, '')), '') is null
      then array[]::text[]
    else array[trim(new.owner_current)]::text[]
  end;

  foreach selected_owner_code in array selected_owner_codes
  loop
    insert into public.company_owner_codes (company_id, code, updated_at)
    values (new.company_id, selected_owner_code, now())
    on conflict (company_id, code) do update set updated_at = now();
  end loop;

  perform public.sync_compliance_item_owner_codes(new.id, selected_owner_codes);

  source_compound_code := nullif(trim(coalesce(new.owner_raw, '')), '');
  if source_compound_code is not null
    and not (source_compound_code = any(selected_owner_codes))
  then
    delete from public.company_owner_codes owner_code
    where owner_code.company_id = new.company_id
      and owner_code.code = source_compound_code
      and owner_code.user_id is null
      and owner_code.pending_email is null
      and not exists (
        select 1
        from public.compliance_item_owner_codes item_owner
        where item_owner.company_id = owner_code.company_id
          and item_owner.owner_code = owner_code.code
      )
      and not exists (
        select 1
        from public.compliance_items item
        where item.company_id = owner_code.company_id
          and item.owner_current = owner_code.code
      );
  end if;

  return new;
end;
$$;

comment on function public.parse_compound_owner_codes(text) is
  'Splits workbook owner values on slash or arrow delimiters, preserving source order and removing duplicates.';
