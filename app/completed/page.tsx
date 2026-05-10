import Link from 'next/link';
import { AppSidebar } from '@/components/app-sidebar';
import { formatDate, proposedNextDates } from '@/lib/compliance';
import { getCustomerContext, getCustomerItems, itemVessel } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

export default async function CompletedPage() {
  const { membership, company, isAppAdmin } = await getCustomerContext({ allowAppAdmin: true });
  const items = await getCustomerItems(membership.company_id);
  const completedItems = items
    .filter((item) => item.status === 'complete')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} isAppAdmin={isAppAdmin} activePath="/completed" />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Completed</p>
            <h1>Compliance history</h1>
            <p>Completed records replace the old completed spreadsheet tab and preserve notes for the next renewal cycle.</p>
          </div>
          <Link className="primary-action" href="/items?status=complete">Filter records</Link>
        </header>

        <section className="customer-summary-grid" aria-label="Completed summary">
          <article>
            <span>Completed</span>
            <strong>{completedItems.length}</strong>
            <p>Closed records</p>
          </article>
          <article>
            <span>Recurring</span>
            <strong>{completedItems.filter((item) => item.previous_item_id || proposedNextDates(item).nextExpirationDate).length}</strong>
            <p>Records with a next-cycle pattern</p>
          </article>
          <article>
            <span>With notes</span>
            <strong>{completedItems.filter((item) => item.status_notes).length}</strong>
            <p>Saved completion context</p>
          </article>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <span>{completedItems.length} records</span>
              <h2>Completed archive</h2>
            </div>
          </div>

          <div className="work-table completed-table" role="table" aria-label="Completed compliance records">
            <div className="work-table-row work-table-head" role="row">
              <span>Completed</span>
              <span>Vessel</span>
              <span>Item</span>
              <span>Agency</span>
              <span>Notes</span>
              <span>Next expiration</span>
            </div>
            {completedItems.length === 0 ? (
              <div className="empty-state"><h3>No completed records yet</h3><p>When an item is marked complete, it will move into this history view.</p></div>
            ) : null}
            {completedItems.map((item) => {
              const nextDates = proposedNextDates(item);
              return (
                <Link className="work-table-row" href={`/items/${item.id}`} role="row" key={item.id}>
                  <span>{formatDate(item.completed_at)}</span>
                  <span>{itemVessel(item)}</span>
                  <strong>{item.item_name}</strong>
                  <span>{item.agency_type ?? '-'}</span>
                  <span>{item.status_notes ?? '-'}</span>
                  <span>{formatDate(nextDates.nextExpirationDate)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
