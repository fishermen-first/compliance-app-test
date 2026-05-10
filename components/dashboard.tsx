import Link from 'next/link';
import { CheckCircle2, ListFilter, Mail, Plus } from 'lucide-react';
import {
  type ComplianceItem,
  displayState,
  formatDate,
  daysUntil,
  stateClassName,
  shortDate
} from '@/lib/compliance';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    owner: 'Company Admin',
    office_admin: 'Office Admin',
    office_user: 'Office User'
  };

  return labels[role] ?? role.replaceAll('_', ' ');
}

function itemVessel(item: ComplianceItem) {
  return item.vessel_name || 'Company-wide';
}

function sortedByStart(items: ComplianceItem[]) {
  return [...items].sort((a, b) => (a.start_working_on ?? '9999-12-31').localeCompare(b.start_working_on ?? '9999-12-31'));
}

export function Dashboard({
  companyName,
  items,
  currentUserName,
  currentUserRole,
  currentOwnerCode,
  showAllOwners,
  canCreateItems
}: {
  companyName: string;
  items: ComplianceItem[];
  currentUserName: string;
  currentUserRole: string;
  currentOwnerCode: string | null;
  showAllOwners: boolean;
  canCreateItems: boolean;
}) {
  const openItems = items.filter((item) => !['complete', 'discontinued'].includes(item.status));
  const ownerItems = currentOwnerCode && !showAllOwners
    ? openItems.filter((item) => item.owner_current === currentOwnerCode)
    : openItems;
  const actionableItems = sortedByStart(ownerItems.filter((item) => {
    const state = displayState(item);
    return ['Ready', 'In Progress', 'Submitted', 'Overdue'].includes(state);
  }));
  const overdueItems = openItems.filter((item) => displayState(item) === 'Overdue');
  const readyItems = openItems.filter((item) => displayState(item) === 'Ready');
  const inProgressItems = openItems.filter((item) => item.status === 'in_progress');
  const submittedItems = openItems.filter((item) => item.status === 'submitted');
  const nextItem = actionableItems[0] ?? sortedByStart(openItems)[0];
  const ownerCodes = Array.from(new Set(openItems.map((item) => item.owner_current).filter(Boolean) as string[])).sort();
  const soonItems = openItems.filter((item) => {
    const expirationDays = daysUntil(item.expiration_date);
    return expirationDays !== null && expirationDays >= 0 && expirationDays <= 30;
  });

  return (
    <main className="workspace">
      <header className="topbar compliance-topbar">
        <article className="next-due-banner">
          <div>
            <span>Next action</span>
            <strong>{nextItem ? shortDate(nextItem.start_working_on) : 'None'}</strong>
          </div>
          <div>
            <h1>{nextItem?.item_name ?? 'No compliance items yet'}</h1>
            <p>
              {nextItem
                ? `${itemVessel(nextItem)} · ${nextItem.owner_current ?? 'Unassigned'} · expires ${shortDate(nextItem.expiration_date)}`
                : 'Import the Due Dates sheet or add the first item to build the work queue.'}
            </p>
          </div>
          <strong className={nextItem ? `due-soon state-${stateClassName(displayState(nextItem))}` : 'due-soon'}>
            {nextItem ? displayState(nextItem) : 'Ready'}
          </strong>
        </article>

        <Link className="secondary-action" href="/reminders">
          <Mail aria-hidden="true" />
          <span>Reminders</span>
        </Link>
        {canCreateItems ? (
          <Link className="primary-action" href="/items/new">
            <Plus aria-hidden="true" />
            <span>New Item</span>
          </Link>
        ) : null}
        <button className="user-pill" type="button" aria-label={`Current user ${currentUserName}`}>
          <span>{initials(currentUserName)}</span>
          <strong>{currentUserName}</strong>
          <small>{roleLabel(currentUserRole)}{currentOwnerCode ? ` · ${currentOwnerCode}` : ''}</small>
        </button>
      </header>

      <section className="metric-strip" aria-label="Compliance summary">
        <article>
          <span>My work queue</span>
          <strong>{actionableItems.length}</strong>
          <p>{showAllOwners ? 'All owners selected' : currentOwnerCode ? `Owner ${currentOwnerCode}` : 'All actionable items'}</p>
        </article>
        <article>
          <span>Ready to start</span>
          <strong>{readyItems.length}</strong>
          <p>Start date has arrived</p>
        </article>
        <article>
          <span>Due in 30 days</span>
          <strong>{soonItems.length}</strong>
          <p>Expiration date approaching</p>
        </article>
        <article>
          <span>Overdue</span>
          <strong>{overdueItems.length}</strong>
          <p>Past expiration date</p>
        </article>
      </section>

      <section className="dashboard-grid queue-grid">
        <div className="main-column">
          <section className="panel priority-panel">
            <div className="panel-heading">
              <div>
                <span>{companyName}</span>
                <h2>{showAllOwners ? 'All actionable items' : 'My work queue'}</h2>
              </div>
              <div className="queue-actions">
                <Link className="secondary-link" href={showAllOwners ? '/' : '/?owner=all'}>
                  <ListFilter aria-hidden="true" />
                  {showAllOwners ? 'Show Mine' : 'All Owners'}
                </Link>
                <Link className="secondary-link" href="/items">All Items</Link>
              </div>
            </div>

            {ownerCodes.length > 0 ? (
              <div className="owner-filter-row">
                {ownerCodes.map((owner) => (
                  <Link href={`/?owner=${owner}`} key={owner} className={currentOwnerCode === owner && !showAllOwners ? 'active' : ''}>{owner}</Link>
                ))}
              </div>
            ) : null}

            <div className="work-table" role="table" aria-label="Actionable compliance items">
              <div className="work-table-row work-table-head" role="row">
                <span>Owner</span>
                <span>Vessel</span>
                <span>Item</span>
                <span>Area</span>
                <span>Start</span>
                <span>Expiration</span>
                <span>Status</span>
              </div>
              {actionableItems.length === 0 ? (
                <div className="empty-state">
                  <CheckCircle2 aria-hidden="true" />
                  <h3>No actionable items right now</h3>
                  <p>Items will appear here when their start-working date arrives, or when they are in progress, submitted, or overdue.</p>
                </div>
              ) : actionableItems.slice(0, 12).map((item) => {
                const state = displayState(item);
                return (
                  <Link className="work-table-row" href={`/items/${item.id}`} role="row" key={item.id}>
                    <span>{item.owner_current ?? 'Unassigned'}</span>
                    <span>{itemVessel(item)}</span>
                    <strong>{item.item_name}</strong>
                    <span>{item.compliance_area ?? 'Other'}</span>
                    <span>{formatDate(item.start_working_on)}</span>
                    <span>{formatDate(item.expiration_date)}</span>
                    <span className={`status-chip state-${stateClassName(state)}`}>{state}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="right-column">
          <section className="panel vessel-panel">
            <span>By Owner</span>
            {ownerCodes.map((owner) => {
              const count = openItems.filter((item) => item.owner_current === owner).length;
              return (
                <div className="vessel-bar" key={owner}>
                  <div>
                    <strong>{owner}</strong>
                    <span>{count}</span>
                  </div>
                  <progress value={count} max={Math.max(1, openItems.length)} />
                </div>
              );
            })}
          </section>

          <section className="panel week-panel">
            <span>Submitted</span>
            <strong>{submittedItems.length} items</strong>
            <p>Waiting on agencies, auditors, certifiers, or confirmation paperwork.</p>
            <Link href="/items?status=submitted">Review submitted</Link>
          </section>

          <section className="panel activity-panel">
            <span>Import health</span>
            <ul>
              <li>{items.length} total imported/current items</li>
              <li>{openItems.length} open items</li>
              <li>{items.filter((item) => item.source_row_number).length} rows linked to spreadsheet source</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
