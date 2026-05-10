import { redirect } from 'next/navigation';
import { type ComplianceItem } from '@/lib/compliance';
import { createClient } from '@/lib/supabase/server';

export function mapComplianceItem(row: any): ComplianceItem {
  return {
    id: row.id,
    company_id: row.company_id,
    vessel_id: row.vessel_id,
    vessel_name: row.vessels?.name ?? null,
    owner_raw: row.owner_raw,
    owner_current: row.owner_current,
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

export function ownerCodeForUser(name: string, email?: string | null) {
  const source = `${name} ${email ?? ''}`.toLowerCase();
  if (source.includes('sarah')) return 'SN';
  if (source.includes('emma')) return 'ES';
  if (source.includes('meagan') || source.includes('meghan')) return 'MA';
  return null;
}

export async function getCustomerContext(options: { allowAppAdmin?: boolean; requireWritable?: boolean } = {}) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (isAppAdmin && !options.allowAppAdmin) {
    redirect('/admin');
  }

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect('/');

  if (options.requireWritable && !['owner', 'office_admin', 'office_user'].includes(membership.role)) {
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
    .select('*, vessels(name)')
    .eq('company_id', companyId)
    .order('start_working_on', { ascending: true, nullsFirst: false })
    .order('expiration_date', { ascending: true, nullsFirst: false });

  return (rawItems ?? []).map(mapComplianceItem);
}
