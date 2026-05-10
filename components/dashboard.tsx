import Link from 'next/link';
import { CalendarDays, CheckCircle2, Plus } from 'lucide-react';
import { accessRoleLabel } from '@/lib/roles';
import {
  type ComplianceItem,
  displayState,
  daysUntil,
  shortDate,
  stateClassName
} from '@/lib/compliance';
import { type CompanyOwnerCode, itemVessel } from '@/lib/customer-data';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function sortedByStart(items: ComplianceItem[]) {
  return [...items].sort((a, b) => (a.start_working_on ?? '9999-12-31').localeCompare(b.start_working_on ?? '9999-12-31'));
}

export function Dashboard({
  companyName,
  items,
  currentUserName,
  currentUserRole,
  selectedOwnerCodes,
  showAllOwners,
  hasOwnerMapping,
  ownerCodes,
  canCreateItems
}: {
  companyName: string;
  items: ComplianceItem[];
  currentUserName: string;
  currentUserRole: string;
  selectedOwnerCodes: string[];
  showAllOwners: boolean;
  hasOwnerMapping: boolean;
  ownerCodes: CompanyOwnerCode[];
  canCreateItems: boolean;
}) {
  const isCustomerAdmin = ['owner', 'office_admin'].includes(currentUserRole);
  const isUnmappedRegularUser = !isCustomerAdmin && !hasOwnerMapping;
  const openItems = items.filter((item) => !['complete', 'discontinued'].includes(item.status));
  const scopedItems = showAllOwners
    ? openItems
    : selectedOwnerCodes.length > 0
      ? openItems.filter((item) => item.owner_current && selectedOwnerCodes.includes(item.owner_current))
      : [];
  const actionableItems = sortedByStart(scopedItems.filter((item) => {
    const state = displayState(item);
    return ['Ready', 'In Progress', 'Submitted', 'Overdue'].includes(state);
  }));
  const overdueItems = openItems.filter((item) => displayState(item) === 'Overdue');
  const readyItems = openItems.filter((item) => displayState(item) === 'Ready');
  const submittedItems = openItems.filter((item) => item.status === 'submitted');
  const scopedOverdueItems = scopedItems.filter((item) => displayState(item) === 'Overdue');
  const scopedReadyItems = scopedItems.filter((item) => displayState(item) === 'Ready');
  const scopedInProgressItems = scopedItems.filter((item) => item.status === 'in_progress');
  const scopedSubmittedItems = scopedItems.filter((item) => item.status === 'submitted');
  const scopedUpcomingItems = scopedItems.filter((item) => displayState(item) === 'Upcoming');
  const importedOwnerCodes = Array.from(new Set(openItems.map((item) => item.owner_current).filter(Boolean) as string[]));
  const ownerCodeRows = Array.from(new Set([...ownerCodes.map((owner) => owner.code), ...importedOwnerCodes])).sort();
  const soonItems = scopedItems.filter((item) => {
    const expirationDays = daysUntil(item.expiration_date);
    return expirationDays !== null && expirationDays >= 0 && expirationDays <= 30;
  });
  const queueScopeLabel = showAllOwners
    ? 'All owners'
    : selectedOwnerCodes.length
      ? `Owner ${selectedOwnerCodes.join(', ')}`
      : 'Setup needed';

  return (
    <main className="workspace">
      <header className="customer-page-header">
        <div>
          <p className="eyebrow">{companyName}</p>
          <h1>Work queue</h1>
          <p>Track active renewals, submissions, and upcoming compliance work from the imported due-date sheet.</p>
        </div>

        <div className="customer-header-actions">
          <Link className="secondary-action" href="/calendar">
            <CalendarDays aria-hidden="true" />
            <span>Calendar</span>
          </Link>
          {canCreateItems ? (
            <Link className="primary-action" href="/items/new">
              <Plus aria-hidden="true" />
              <span>New item</span>
            </Link>
          ) : null}
          <button className="user-pill" type="button" aria-label={`Current user ${currentUserName}`}>
            <span>{initials(currentUserName)}</span>
            <strong>{currentUserName}</strong>
            <small>{accessRoleLabel(currentUserRole)}{selectedOwnerCodes.length ? ` · ${selectedOwnerCodes.join(', ')}` : ''}</small>
          </button>
        </div>
      </header>

      {!hasOwnerMapping && isCustomerAdmin ? (
        <section className="owner-notice-panel admin-view-notice">
          <strong>Admin view</strong>
          <span>No owner code is mapped to your login, so this workspace opens to all company work. Map an owner code if you want a personal queue.</span>
        </section>
      ) : null}

      {isUnmappedRegularUser ? (
        <section className="owner-notice-panel setup-warning-panel">
          <strong>Owner setup needed</strong>
          <span>Ask a Customer Admin to map your login to the owner initials from the workbook. Item edits stay locked until that mapping exists.</span>
        </section>
      ) : null}

      <section className="workflow-tabs" aria-label="Workflow summary">
        <Link href="/items?status=ready">
          <div>
            <span>Ready</span>
            <strong>{scopedReadyItems.length}</strong>
          </div>
          <p>{showAllOwners ? 'All owners ready' : 'Selected scope ready'}</p>
        </Link>
        <Link href="/items?status=in_progress">
          <div>
            <span>In progress</span>
            <strong>{scopedInProgressItems.length}</strong>
          </div>
          <p>Being worked now</p>
        </Link>
        <Link href="/items?status=submitted">
          <div>
            <span>Submitted</span>
            <strong>{scopedSubmittedItems.length}</strong>
          </div>
          <p>Waiting on response</p>
        </Link>
        <Link href="/items?status=upcoming">
          <div>
            <span>Upcoming</span>
            <strong>{scopedUpcomingItems.length}</strong>
          </div>
          <p>Not ready yet</p>
        </Link>
        <Link href="/items?status=overdue">
          <div>
            <span>Overdue</span>
            <strong>{scopedOverdueItems.length}</strong>
          </div>
          <p>Past expiration</p>
        </Link>
      </section>

      <section className="dashboard-grid queue-grid">
        <div className="main-column">
          <section className="panel priority-panel queue-panel">
            <div className="panel-heading">
              <div>
                <span>{queueScopeLabel}</span>
                <h2>{showAllOwners ? 'Current work queue' : 'My work queue'}</h2>
              </div>
              <div className="queue-actions">
                <Link className="secondary-link" href="/items">All records</Link>
              </div>
            </div>

            <div className="work-table" role="table" aria-label="Actionable compliance items">
              <div className="work-table-row queue-table-row work-table-head" role="row">
                <span>Owner</span>
                <span>Vessel</span>
                <span>Item</span>
                <span>Status</span>
                <span>Notes</span>
                <span>Start</span>
                <span>Expiration</span>
              </div>
              {actionableItems.length === 0 ? (
                <div className="empty-state">
                  <CheckCircle2 aria-hidden="true" />
                  <h3>{isUnmappedRegularUser ? 'No owner queue yet' : 'No actionable items right now'}</h3>
                  <p>{isUnmappedRegularUser ? 'Your queue will appear after a Customer Admin maps your login to an owner code.' : 'Items will appear here when their start-working date arrives, or when they are in progress, submitted, or overdue.'}</p>
                </div>
              ) : actionableItems.slice(0, 12).map((item) => (
                <Link className="work-table-row queue-table-row" href={`/items/${item.id}`} role="row" key={item.id}>
                  <span>{item.owner_current ?? 'Unassigned'}</span>
                  <span>{itemVessel(item)}</span>
                  <strong>{item.item_name}<small>{item.agency_type ?? 'No agency'} · {item.compliance_area ?? 'Other'}</small></strong>
                  <span className={`status-chip state-${stateClassName(displayState(item))}`}>{displayState(item)}</span>
                  <span className="notes-cell">{item.status_notes || 'No notes'}</span>
                  <span>{shortDate(item.start_working_on)}</span>
                  <span>{shortDate(item.expiration_date)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="right-column">
          <section className="panel vessel-panel">
            <span>Filter by owner</span>
            <div className="owner-count-list">
              <Link href="/?owner=all" className={showAllOwners ? 'active' : ''}>
                <strong>All owners</strong>
                <span>{openItems.length}</span>
              </Link>
              {ownerCodeRows.map((owner) => {
                const count = openItems.filter((item) => item.owner_current === owner).length;
                return (
                  <Link href={`/?owner=${encodeURIComponent(owner)}`} key={owner} className={selectedOwnerCodes.length === 1 && selectedOwnerCodes[0] === owner && !showAllOwners ? 'active' : ''}>
                    <strong>{owner}</strong>
                    <span>{count}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="panel week-panel">
            <span>Due in 30 days</span>
            <strong>{soonItems.length}</strong>
            <p>Expirations approaching soon in the selected queue. Review these alongside submitted and ready work.</p>
            <Link href="/calendar">Open calendar</Link>
          </section>

          {isCustomerAdmin ? (
            <section className="panel activity-panel risk-count-panel">
              <span>Company risk</span>
              <ul>
                <li><strong>{overdueItems.length}</strong> overdue across all owners</li>
                <li><strong>{readyItems.length}</strong> ready across all owners</li>
                <li><strong>{submittedItems.length}</strong> submitted across all owners</li>
              </ul>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
