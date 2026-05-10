import Link from 'next/link';
import { AppSidebar } from '@/components/app-sidebar';
import { displayState, formatDate, type ComplianceItem } from '@/lib/compliance';
import { getCustomerContext, getCustomerItems } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type VesselRow = {
  id: string;
  name: string;
  active: boolean;
};

function nextItem(items: ComplianceItem[]) {
  return [...items]
    .filter((item) => !['complete', 'discontinued'].includes(item.status))
    .sort((a, b) => (a.start_working_on ?? a.expiration_date ?? '9999-12-31').localeCompare(b.start_working_on ?? b.expiration_date ?? '9999-12-31'))[0];
}

export default async function VesselsPage() {
  const { supabase, membership, company, isAppAdmin } = await getCustomerContext({ allowAppAdmin: true });
  const [{ data: vessels }, items] = await Promise.all([
    supabase.from('vessels').select('id, name, active').eq('company_id', membership.company_id).order('name'),
    getCustomerItems(membership.company_id)
  ]);

  const vesselRows: VesselRow[] = vessels ?? [];
  const companyWideItems = items.filter((item) => !item.vessel_id);
  const totalOpen = items.filter((item) => !['complete', 'discontinued'].includes(item.status)).length;

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} isAppAdmin={isAppAdmin} activePath="/vessels" />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Vessels</p>
            <h1>Compliance by vessel</h1>
            <p>Use this when a captain, office user, or manager asks what applies to one vessel versus the company as a whole.</p>
          </div>
          <Link className="primary-action" href="/items/new">New item</Link>
        </header>

        <section className="customer-summary-grid" aria-label="Vessel summary">
          <article>
            <span>Active vessels</span>
            <strong>{vesselRows.filter((vessel) => vessel.active).length}</strong>
            <p>{vesselRows.length} total vessel records</p>
          </article>
          <article>
            <span>Open items</span>
            <strong>{totalOpen}</strong>
            <p>Across vessel and company work</p>
          </article>
          <article>
            <span>Company-wide</span>
            <strong>{companyWideItems.length}</strong>
            <p>Items not tied to one vessel</p>
          </article>
        </section>

        <section className="vessel-card-grid">
          {vesselRows.map((vessel) => {
            const vesselItems = items.filter((item) => item.vessel_id === vessel.id);
            const openItems = vesselItems.filter((item) => !['complete', 'discontinued'].includes(item.status));
            const readyItems = openItems.filter((item) => ['Ready', 'Overdue', 'In Progress', 'Submitted'].includes(displayState(item)));
            const upcoming = nextItem(vesselItems);
            return (
              <article className="panel vessel-summary-card" key={vessel.id}>
                <div>
                  <span>{vessel.active ? 'Active vessel' : 'Inactive vessel'}</span>
                  <h2>{vessel.name}</h2>
                </div>
                <dl>
                  <div><dt>Open</dt><dd>{openItems.length}</dd></div>
                  <div><dt>Needs action</dt><dd>{readyItems.length}</dd></div>
                  <div><dt>Total records</dt><dd>{vesselItems.length}</dd></div>
                </dl>
                <p>{upcoming ? `Next: ${upcoming.item_name} on ${formatDate(upcoming.start_working_on ?? upcoming.expiration_date)}` : 'No upcoming work saved for this vessel.'}</p>
                <Link className="secondary-link" href={`/items?vessel=${encodeURIComponent(vessel.name)}`}>View vessel items</Link>
              </article>
            );
          })}

          <article className="panel vessel-summary-card">
            <div>
              <span>Company-wide</span>
              <h2>Not vessel-specific</h2>
            </div>
            <dl>
              <div><dt>Open</dt><dd>{companyWideItems.filter((item) => !['complete', 'discontinued'].includes(item.status)).length}</dd></div>
              <div><dt>Needs action</dt><dd>{companyWideItems.filter((item) => ['Ready', 'Overdue', 'In Progress', 'Submitted'].includes(displayState(item))).length}</dd></div>
              <div><dt>Total records</dt><dd>{companyWideItems.length}</dd></div>
            </dl>
            <p>Company-wide records include food safety, administration, or fleet-level compliance items.</p>
            <Link className="secondary-link" href="/items?vessel=company-wide">View company-wide items</Link>
          </article>
        </section>
      </main>
    </div>
  );
}
