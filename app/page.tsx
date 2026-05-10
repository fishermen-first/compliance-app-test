import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { AuthScreen } from '@/components/auth-screen';
import { Dashboard } from '@/components/dashboard';
import { NoAccessScreen } from '@/components/no-access-screen';
import { type ComplianceItem } from '@/lib/compliance';
import { createClient } from '@/lib/supabase/server';

type HomeProps = {
  searchParams?: { message?: string; owner?: string };
};

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ownerCodeForUser(name: string, email?: string | null) {
  const source = `${name} ${email ?? ''}`.toLowerCase();
  if (source.includes('sarah')) return 'SN';
  if (source.includes('emma')) return 'ES';
  if (source.includes('meagan') || source.includes('meghan')) return 'MA';
  return null;
}

function mapComplianceItem(row: any): ComplianceItem {
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

export default async function Home({ searchParams }: HomeProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return <AuthScreen message={searchParams?.message} />;
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (isAppAdmin) {
    redirect('/admin');
  }

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    const { data: acceptedCompanyId } = await supabase.rpc('accept_company_invite', { full_name: userData.user.email?.split('@')[0] ?? 'User' });

    if (acceptedCompanyId) {
      redirect('/');
    }

    return <NoAccessScreen email={userData.user.email} />;
  }

  const [{ data: company }, { data: profile }, { data: rawItems }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle(),
    supabase
      .from('compliance_items')
      .select('*, vessels(name)')
      .eq('company_id', membership.company_id)
      .order('start_working_on', { ascending: true, nullsFirst: false })
      .order('expiration_date', { ascending: true, nullsFirst: false })
  ]);

  const currentUserName = profile?.full_name ?? userData.user.email ?? 'User';
  const userOwnerCode = ownerCodeForUser(currentUserName, userData.user.email);
  const requestedOwner = searchParams?.owner;
  const showAllOwners = requestedOwner === 'all' || (!requestedOwner && !userOwnerCode);
  const currentOwnerCode = requestedOwner && requestedOwner !== 'all' ? requestedOwner : userOwnerCode;
  const canCreateItems = ['owner', 'office_admin', 'office_user'].includes(membership.role);
  const items = (rawItems ?? []).map(mapComplianceItem);

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={titleCase(membership.role)} />
      <Dashboard
        companyName={company?.name ?? 'FF Compliance'}
        items={items}
        currentUserName={currentUserName}
        currentUserRole={membership.role}
        currentOwnerCode={currentOwnerCode}
        showAllOwners={showAllOwners}
        canCreateItems={canCreateItems}
      />
    </div>
  );
}
