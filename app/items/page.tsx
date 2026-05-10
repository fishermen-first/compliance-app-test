import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { type ComplianceItem, displayState, formatDate, stateClassName } from '@/lib/compliance';
import { accessRoleLabel } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type ItemsPageProps = {
  searchParams?: { status?: string; owner?: string; vessel?: string; area?: string };
};

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

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect('/');

  const [{ data: company }, { data: rawItems }, { data: isAppAdmin }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', membership.company_id).single(),
    supabase
      .from('compliance_items')
      .select('*, vessels(name)')
      .eq('company_id', membership.company_id)
      .order('expiration_date', { ascending: true, nullsFirst: false }),
    supabase.rpc('is_app_admin')
  ]);

  const allItems = (rawItems ?? []).map(mapComplianceItem);
  const owners = Array.from(new Set(allItems.map((item) => item.owner_current).filter(Boolean) as string[])).sort();
  const vessels = Array.from(new Set(allItems.map((item) => item.vessel_name).filter(Boolean) as string[])).sort();
  const areas = Array.from(new Set(allItems.map((item) => item.compliance_area).filter(Boolean) as string[])).sort();

  const filteredItems = allItems.filter((item) => {
    const state = displayState(item).toLowerCase().replaceAll(' ', '_');
    if (searchParams?.status && searchParams.status !== item.status && searchParams.status !== state) return false;
    if (searchParams?.owner && item.owner_current !== searchParams.owner) return false;
    if (searchParams?.vessel && item.vessel_name !== searchParams.vessel) return false;
    if (searchParams?.area && item.compliance_area !== searchParams.area) return false;
    return true;
  });

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} isAppAdmin={Boolean(isAppAdmin)} activePath="/items" />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">All Items</p>
            <h1>Compliance item list</h1>
            <p>Spreadsheet replacement for current, upcoming, submitted, overdue, complete, and discontinued items.</p>
          </div>
          <Link className="primary-action" href="/items/new">New Item</Link>
        </header>

        <section className="panel filter-panel">
          <div>
            <span>Owner</span>
            <Link className={!searchParams?.owner ? 'active' : ''} href="/items">All</Link>
            {owners.map((owner) => <Link className={searchParams?.owner === owner ? 'active' : ''} href={`/items?owner=${encodeURIComponent(owner)}`} key={owner}>{owner}</Link>)}
          </div>
          <div>
            <span>Status</span>
            {['all', 'ready', 'overdue', 'in_progress', 'submitted', 'complete', 'discontinued'].map((status) => (
              <Link className={(status === 'all' && !searchParams?.status) || searchParams?.status === status ? 'active' : ''} href={status === 'all' ? '/items' : `/items?status=${status}`} key={status}>{titleCase(status)}</Link>
            ))}
          </div>
          <div>
            <span>Area</span>
            {areas.slice(0, 8).map((area) => <Link className={searchParams?.area === area ? 'active' : ''} href={`/items?area=${encodeURIComponent(area)}`} key={area}>{area}</Link>)}
          </div>
          <div>
            <span>Vessel</span>
            {vessels.slice(0, 10).map((vessel) => <Link className={searchParams?.vessel === vessel ? 'active' : ''} href={`/items?vessel=${encodeURIComponent(vessel)}`} key={vessel}>{vessel}</Link>)}
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <span>{filteredItems.length} items</span>
              <h2>Current compliance records</h2>
            </div>
          </div>

          <div className="work-table all-items-table" role="table" aria-label="All compliance items">
            <div className="work-table-row work-table-head" role="row">
              <span>Owner</span>
              <span>Vessel</span>
              <span>Item</span>
              <span>Agency</span>
              <span>Area</span>
              <span>Frequency</span>
              <span>Start</span>
              <span>Expiration</span>
              <span>Status</span>
            </div>
            {filteredItems.map((item) => {
              const state = displayState(item);
              return (
                <Link className="work-table-row" href={`/items/${item.id}`} role="row" key={item.id}>
                  <span>{item.owner_current ?? 'Unassigned'}</span>
                  <span>{item.vessel_name ?? 'Company-wide'}</span>
                  <strong>{item.item_name}</strong>
                  <span>{item.agency_type ?? '-'}</span>
                  <span>{item.compliance_area ?? 'Other'}</span>
                  <span>{item.frequency_label ?? '-'}</span>
                  <span>{formatDate(item.start_working_on)}</span>
                  <span>{formatDate(item.expiration_date)}</span>
                  <span className={`status-chip state-${stateClassName(state)}`}>{state}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
