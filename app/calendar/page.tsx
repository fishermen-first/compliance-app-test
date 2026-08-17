import Link from 'next/link';
import { AppSidebar } from '@/components/app-sidebar';
import { StatusBadge } from '@/components/status-badge';
import { daysUntil, displayState, formatDate, isWorkQueueItem, itemHasAnyOwnerCode, itemOwnerCodes, itemIsOverdue, type ComplianceItem } from '@/lib/compliance';
import { getCompanyOwnerCodes, getCustomerContext, getCustomerItems, itemVessel } from '@/lib/customer-data';
import { accessRoleLabel, isCustomerOwnerRole } from '@/lib/roles';

type CalendarPageProps = {
  searchParams?: { owner?: string; scope?: string };
};

function calendarHref(params: { scope?: string; owner?: string }) {
  const search = new URLSearchParams();
  if (params.scope) search.set('scope', params.scope);
  if (params.owner) search.set('owner', params.owner);
  const query = search.toString();
  return query ? `/calendar?${query}` : '/calendar';
}

function relativeDate(value: string | null) {
  const days = daysUntil(value);
  if (days === null) return 'No date';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

function byDate(field: 'start_working_on' | 'expiration_date') {
  return (a: ComplianceItem, b: ComplianceItem) => (a[field] ?? '9999-12-31').localeCompare(b[field] ?? '9999-12-31');
}

function byNextRelevantDate(a: ComplianceItem, b: ComplianceItem) {
  const aDate = [a.start_working_on, a.expiration_date].filter(Boolean).sort()[0] ?? '9999-12-31';
  const bDate = [b.start_working_on, b.expiration_date].filter(Boolean).sort()[0] ?? '9999-12-31';
  return aDate.localeCompare(bDate);
}

function takeSection(items: ComplianceItem[], assignedIds: Set<string>, predicate: (item: ComplianceItem) => boolean, sortFn: (a: ComplianceItem, b: ComplianceItem) => number) {
  const sectionItems = items.filter((item) => !assignedIds.has(item.id) && predicate(item)).sort(sortFn);
  sectionItems.forEach((item) => assignedIds.add(item.id));
  return sectionItems;
}

function planningSections(items: ComplianceItem[]) {
  const assignedIds = new Set<string>();
  const needsWorkNow = takeSection(
    items,
    assignedIds,
    (item) => isWorkQueueItem(item) || (daysUntil(item.start_working_on) ?? 1) <= 0,
    byDate('expiration_date')
  );
  const startingSoon = takeSection(
    items,
    assignedIds,
    (item) => {
      const days = daysUntil(item.start_working_on);
      return days !== null && days > 0 && days <= 30;
    },
    byDate('start_working_on')
  );
  const expiringSoon = takeSection(
    items,
    assignedIds,
    (item) => {
      const days = daysUntil(item.expiration_date);
      return days !== null && days >= 0 && days <= 60;
    },
    byDate('expiration_date')
  );
  const later = takeSection(items, assignedIds, () => true, byNextRelevantDate);

  return [
    {
      title: 'Needs work now',
      description: 'Start date has arrived, or the item is already in progress, submitted, ready, or overdue.',
      items: needsWorkNow,
      empty: 'No items need work right now.'
    },
    {
      title: 'Starting in the next 30 days',
      description: 'Start-working dates that are not active yet.',
      items: startingSoon,
      empty: 'No start dates in the next 30 days.'
    },
    {
      title: 'Expiring in the next 60 days',
      description: 'Hard deadlines that are not already in the active work list.',
      items: expiringSoon,
      empty: 'No additional expirations in the next 60 days.'
    },
    {
      title: 'Later scheduled work',
      description: 'Open compliance items with dates farther out or still missing one of the two dates.',
      items: later,
      empty: 'No later scheduled work in this scope.'
    }
  ];
}

function PlanningRow({ item, ownerNames }: { item: ComplianceItem; ownerNames: Map<string, string> }) {
  return (
    <Link className="planning-row" href={`/items/${item.id}`}>
      <span className="planning-owner-pill">{item.owner_current ? ownerNames.get(item.owner_current) ?? item.owner_current : 'Unassigned'}</span>
      <div className="planning-entity">
        <strong>{itemVessel(item)}</strong>
        <span>{item.agency_type ?? 'No agency'} · {item.compliance_area ?? 'Other'}</span>
      </div>
      <div className="planning-item">
        <b>{item.item_name}</b>
        <p>{item.status_notes || 'No notes'}</p>
      </div>
      <div className="planning-date-cell">
        <span>Start working on</span>
        <strong>{formatDate(item.start_working_on)}</strong>
        <small>{relativeDate(item.start_working_on)}</small>
      </div>
      <div className="planning-date-cell">
        <span>Expiration</span>
        <strong>{formatDate(item.expiration_date)}</strong>
        <small>{relativeDate(item.expiration_date)}</small>
      </div>
      <StatusBadge item={item} />
    </Link>
  );
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const { membership, company, profile, user } = await getCustomerContext();
  const [items, ownerCodes] = await Promise.all([
    getCustomerItems(membership.company_id),
    getCompanyOwnerCodes(membership.company_id)
  ]);
  const openItems = items.filter((item) => !['complete', 'discontinued'].includes(item.status));
  const ownerNames = new Map(ownerCodes.map((owner) => [owner.code, owner.display_name ?? owner.code]));
  const ownerCodeRows = Array.from(new Set([
    ...ownerCodes.map((owner) => owner.code),
    ...openItems.flatMap(itemOwnerCodes)
  ])).sort();
  const mappedOwnerCodes = ownerCodes.filter((owner) => owner.is_assigned_to_current_user).map((owner) => owner.code);
  const canViewAllOwners = isCustomerOwnerRole(membership.role);
  const requestedOwner = searchParams?.owner && searchParams.owner !== 'all' ? decodeURIComponent(searchParams.owner) : null;
  const hasValidRequestedOwner = requestedOwner ? ownerCodeRows.includes(requestedOwner) : false;
  const showAllOwners = canViewAllOwners && (
    searchParams?.scope === 'all'
    || searchParams?.owner === 'all'
    || (!searchParams?.scope && !searchParams?.owner && mappedOwnerCodes.length === 0)
  );
  const selectedOwnerCodes = hasValidRequestedOwner
    ? [requestedOwner as string]
    : showAllOwners
      ? []
      : mappedOwnerCodes;
  const scopedItems = showAllOwners
    ? openItems
    : selectedOwnerCodes.length > 0
      ? openItems.filter((item) => itemHasAnyOwnerCode(item, selectedOwnerCodes))
      : [];
  const sections = planningSections(scopedItems);
  const needsWorkNow = sections[0]?.items ?? [];
  const startingSoon = sections[1]?.items ?? [];
  const expiringSoon = sections[2]?.items ?? [];
  const scopeLabel = showAllOwners
    ? 'All owners'
    : selectedOwnerCodes.length
      ? `Owner ${selectedOwnerCodes.join(', ')}`
      : 'Owner setup needed';
  const dueCount = items.filter((item) => !['complete', 'discontinued'].includes(item.status) && (displayState(item) === 'Due' || itemIsOverdue(item))).length;

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={profile?.full_name ?? user.email}
        userEmail={user.email}
        dueCount={dueCount}
        activePath="/calendar"
      />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Planning calendar · {scopeLabel}</p>
            <h1>Compliance planning dates</h1>
            <p>Use this list to plan around the two dates from the workbook: when to start work, and when the item expires or is due.</p>
          </div>
          <Link className="primary-action" href="/">Work queue</Link>
        </header>

        <section className="customer-summary-grid" aria-label="Calendar summary">
          <article>
            <span>Needs work now</span>
            <strong>{needsWorkNow.length}</strong>
            <p>Start date arrived or status is active</p>
          </article>
          <article>
            <span>Starting soon</span>
            <strong>{startingSoon.length}</strong>
            <p>Start-working dates in 30 days</p>
          </article>
          <article>
            <span>Expiring soon</span>
            <strong>{expiringSoon.length}</strong>
            <p>Additional deadlines in 60 days</p>
          </article>
        </section>

        <section className="panel planning-toolbar" aria-label="Planning filters">
          <div>
            <span>Scope</span>
            <Link className={!showAllOwners && !hasValidRequestedOwner ? 'active' : ''} href={calendarHref({ scope: 'my' })}>My items</Link>
            {canViewAllOwners ? <Link className={showAllOwners ? 'active' : ''} href={calendarHref({ scope: 'all' })}>All owners</Link> : null}
          </div>
          {canViewAllOwners ? (
            <div>
              <span>Assigned to</span>
              <Link className={showAllOwners ? 'active' : ''} href={calendarHref({ scope: 'all' })}>All</Link>
              {ownerCodeRows.map((owner) => (
                <Link className={selectedOwnerCodes.length === 1 && selectedOwnerCodes[0] === owner ? 'active' : ''} href={calendarHref({ owner })} key={owner}>{owner}</Link>
              ))}
            </div>
          ) : null}
        </section>

        {selectedOwnerCodes.length === 0 && !showAllOwners ? (
          <section className="owner-notice-panel setup-warning-panel">
            <strong>Owner setup needed</strong>
            <span>Your planning list will appear after a workspace owner maps your login to owner initials from the workbook.</span>
          </section>
        ) : null}

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <span>{scopedItems.length} open items</span>
              <h2>Planning list</h2>
            </div>
          </div>

          {scopedItems.length === 0 ? (
            <div className="empty-state"><h3>No planned items in this scope</h3><p>Adjust the owner filter or add start and expiration dates to build the planning list.</p></div>
          ) : null}

          <div className="planning-list">
            {sections.map((section) => (
              <section className="planning-section" key={section.title}>
                <div className="planning-section-heading">
                  <div>
                    <h3>{section.title}</h3>
                    <p>{section.description}</p>
                  </div>
                  <strong>{section.items.length}</strong>
                </div>
                {section.items.length > 0 ? (
                  <div className="planning-table">
                    <div className="planning-table-head" aria-hidden="true">
                      <span>Assigned to</span>
                      <span>Vessel / company</span>
                      <span>Item and notes</span>
                      <span>Start working on</span>
                      <span>Expiration</span>
                      <span>Status</span>
                    </div>
                    {section.items.map((item) => <PlanningRow item={item} ownerNames={ownerNames} key={item.id} />)}
                  </div>
                ) : (
                  <p className="planning-empty">{section.empty}</p>
                )}
              </section>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
