import Link from 'next/link';
import { AppSidebar } from '@/components/app-sidebar';
import { displayState, formatDate, stateClassName } from '@/lib/compliance';
import { getCustomerContext, getCustomerItems, titleCase } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type ItemsPageProps = {
  searchParams?: { status?: string; owner?: string; vessel?: string; area?: string };
};

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const { membership, company, isAppAdmin } = await getCustomerContext({ allowAppAdmin: true });
  const allItems = await getCustomerItems(membership.company_id);
  const owners = Array.from(new Set(allItems.map((item) => item.owner_current).filter(Boolean) as string[])).sort();
  const vessels = Array.from(new Set(allItems.map((item) => item.vessel_name).filter(Boolean) as string[])).sort();
  const areas = Array.from(new Set(allItems.map((item) => item.compliance_area).filter(Boolean) as string[])).sort();

  const filteredItems = allItems.filter((item) => {
    const state = displayState(item).toLowerCase().replaceAll(' ', '_');
    if (searchParams?.status && searchParams.status !== item.status && searchParams.status !== state) return false;
    if (searchParams?.owner && item.owner_current !== searchParams.owner) return false;
    if (searchParams?.vessel === 'company-wide' && item.vessel_name) return false;
    if (searchParams?.vessel && searchParams.vessel !== 'company-wide' && item.vessel_name !== searchParams.vessel) return false;
    if (searchParams?.area && item.compliance_area !== searchParams.area) return false;
    return true;
  });

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} isAppAdmin={Boolean(isAppAdmin)} activePath="" />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Records</p>
            <h1>Compliance item list</h1>
            <p>Search the full imported spreadsheet replacement: current, upcoming, submitted, overdue, complete, and discontinued items.</p>
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
            <Link className={searchParams?.vessel === 'company-wide' ? 'active' : ''} href="/items?vessel=company-wide">Company-wide</Link>
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
