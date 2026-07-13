import { redirect } from 'next/navigation';
import { type ComplianceItem } from '@/lib/compliance';
import { createClient } from '@/lib/supabase/server';

export function mapComplianceItem(row: any): ComplianceItem {
  const ownerCodeRows = (row.compliance_item_owner_codes ?? []) as Array<{ owner_code: string | null; is_primary: boolean | null }>;
  const ownerCodes = ownerCodeRows
    .filter((owner) => owner.owner_code)
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || String(a.owner_code).localeCompare(String(b.owner_code)))
    .map((owner) => owner.owner_code as string);

  return {
    id: row.id,
    company_id: row.company_id,
    vessel_id: row.vessel_id,
    vessel_name: row.vessels?.name ?? null,
    agency_id: row.agency_id,
    owner_raw: row.owner_raw,
    owner_current: row.owner_current,
    owner_codes: ownerCodes.length ? Array.from(new Set(ownerCodes)) : row.owner_current ? [row.owner_current] : [],
    item_name: row.item_name,
    item_number: row.item_number,
    agency_type: row.agency_type,
    compliance_area: row.compliance_area,
    frequency_label: row.frequency_label,
    recurrence_unit: row.recurrence_unit,
    recurrence_interval: row.recurrence_interval,
    start_working_on: row.start_working_on,
    expiration_date: row.expiration_date,
    status: row.status,
    status_notes: row.status_notes,
    instructions: row.instructions,
    sharepoint_url: row.sharepoint_url,
    completed_at: row.completed_at,
    discontinued_at: row.discontinued_at,
    created_by: row.created_by,
    source_row_number: row.source_row_number,
    previous_item_id: row.previous_item_id
  };
}

export function itemVessel(item: ComplianceItem) {
  return item.vessel_name || 'Company-wide';
}

export function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type CompanyOwnerCode = {
  code: string;
  display_name: string | null;
  records: number;
  is_assigned_to_current_user: boolean;
  is_visible_to_current_user: boolean;
};

export async function getCustomerContext(options: { allowAppAdmin?: boolean; requireWritable?: boolean } = {}) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (isAppAdmin && !options.allowAppAdmin) {
    redirect('/admin');
  }

  const { data: memberships } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: true });

  if (!memberships || memberships.length === 0) redirect('/');

  if (!isAppAdmin && memberships.length > 1) {
    redirect('/workspace-blocked');
  }

  const membership = memberships[0];

  if (options.requireWritable && !['owner', 'office_user'].includes(membership.role)) {
    redirect('/');
  }

  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase.from('companies').select('id, name, timezone').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name, email').eq('id', userData.user.id).maybeSingle()
  ]);

  return {
    supabase,
    user: userData.user,
    membership,
    company,
    profile,
    isAppAdmin: Boolean(isAppAdmin)
  };
}

export async function getCustomerItems(companyId: string) {
  const supabase = createClient();
  const { data: rawItems } = await supabase
    .from('compliance_items')
    .select('*, vessels(name), compliance_item_owner_codes(owner_code, is_primary)')
    .eq('company_id', companyId)
    .order('start_working_on', { ascending: true, nullsFirst: false })
    .order('expiration_date', { ascending: true, nullsFirst: false });

  return (rawItems ?? []).map(mapComplianceItem);
}

export async function getCompanyOwnerCodes(companyId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_queue_owner_codes', { target_company_id: companyId });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as CompanyOwnerCode[];
}
