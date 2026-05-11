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
import { itemVessel } from '@/lib/customer-data';

export type DashboardFilters = {
  owner?: string;
  status?: string;
  type?: string;
  vessel?: string;
  frequency?: string;
};

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

function uniqueSorted(items: ComplianceItem[], getValue: (item: ComplianceItem) => string | null | undefined) {
  return Array.from(new Set(items.map(getValue).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function displayStateParam(item: ComplianceItem) {
  return displayState(item).toLowerCase().replaceAll(' ', '_');
}

const dashboardFilterKeys = ['owner', 'status', 'type', 'vessel', 'frequency'] as const;

function dashboardHref(filters: DashboardFilters, updates: Partial<Record<keyof DashboardFilters, string | null | undefined>>) {
  const params = new URLSearchParams();

  dashboardFilterKeys.forEach((key) => {
    const value = Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : filters[key];
    if (value) params.set(key, value);
  });

  const query = params.toString();
  return query ? `/?${query}` : '/';
}

function limitedOptions(options: string[], selected: string | undefined, limit = 10) {
  const limited = options.slice(0, limit);

  if (selected && options.includes(selected) && !limited.includes(selected)) {
    return [...limited, selected];
  }

  return limited;
}

const statusFilterOptions = [
  { value: 'ready', label: 'Ready' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'upcoming', label: 'Upcoming' }
];

export function Dashboard({
  companyName,
  items,
  currentUserName,
  currentUserRole,
  selectedOwnerCodes,
  showAllOwners,
  hasOwnerMapping,
  ownerFilterCodes,
  canCreateItems,
  filters
}: {
  companyName: string;
  items: ComplianceItem[];
  currentUserName: string;
  currentUserRole: string;
  selectedOwnerCodes: string[];
  showAllOwners: boolean;
  hasOwnerMapping: boolean;
  ownerFilterCodes: string[];
  canCreateItems: boolean;
  filters: DashboardFilters;
}) {
  const isCustomerAdmin = ['owner', 'office_admin'].includes(currentUserRole);
  const isUnmappedRegularUser = !isCustomerAdmin && !hasOwnerMapping;
  const openItems = items.filter((item) => !['complete', 'discontinued'].includes(item.status));
  const scopedItems = showAllOwners
    ? openItems
    : selectedOwnerCodes.length > 0
      ? openItems.filter((item) => item.owner_current && selectedOwnerCodes.includes(item.owner_current))
      : [];
  const overdueItems = openItems.filter((item) => displayState(item) === 'Overdue');
  const readyItems = openItems.filter((item) => displayState(item) === 'Ready');
  const submittedItems = openItems.filter((item) => item.status === 'submitted');
  const scopedOverdueItems = scopedItems.filter((item) => displayState(item) === 'Overdue');
  const scopedReadyItems = scopedItems.filter((item) => displayState(item) === 'Ready');
  const scopedInProgressItems = scopedItems.filter((item) => item.status === 'in_progress');
  const scopedSubmittedItems = scopedItems.filter((item) => item.status === 'submitted');
  const scopedUpcomingItems = scopedItems.filter((item) => displayState(item) === 'Upcoming');
  const typeOptions = uniqueSorted(scopedItems, (item) => item.agency_type);
  const vesselOptions = uniqueSorted(scopedItems, itemVessel);
  const frequencyOptions = uniqueSorted(scopedItems, (item) => item.frequency_label);
  const filteredScopedItems = scopedItems.filter((item) => {
    if (filters.status && item.status !== filters.status && displayStateParam(item) !== filters.status) return false;
    if (filters.type && item.agency_type !== filters.type) return false;
    if (filters.vessel && itemVessel(item) !== filters.vessel) return false;
    if (filters.frequency && item.frequency_label !== filters.frequency) return false;
    return true;
  });
  const hasColumnFilters = Boolean(filters.status || filters.type || filters.vessel || filters.frequency);
  const queueItems = sortedByStart(filteredScopedItems.filter((item) => {
    if (filters.status) return true;
    const state = displayState(item);
    return ['Ready', 'In Progress', 'Submitted', 'Overdue'].includes(state);
  }));
  const soonItems = filteredScopedItems.filter((item) => {
    const expirationDays = daysUntil(item.expiration_date);
    return expirationDays !== null && expirationDays >= 0 && expirationDays <= 30;
  });
  const queueScopeLabel = showAllOwners
    ? 'All owners'
    : selectedOwnerCodes.length
      ? `Owner ${selectedOwnerCodes.join(', ')}`
      : 'Setup needed';
  const defaultOwnerLabel = isCustomerAdmin ? 'Admin default' : 'My owners';
  const queueHeading = hasColumnFilters ? 'Filtered work queue' : showAllOwners ? 'Current work queue' : 'My work queue';

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

      <section className={`queue-overview-grid${isCustomerAdmin ? '' : ' single-card'}`} aria-label="Queue snapshot">
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
      </section>

      <section className="workflow-tabs" aria-label="Workflow summary">
        <Link className={filters.status === 'ready' ? 'active' : ''} href={dashboardHref(filters, { status: 'ready' })}>
          <div>
            <span>Ready</span>
            <strong>{scopedReadyItems.length}</strong>
          </div>
          <p>{showAllOwners ? 'All owners ready' : 'Selected scope ready'}</p>
        </Link>
        <Link className={filters.status === 'in_progress' ? 'active' : ''} href={dashboardHref(filters, { status: 'in_progress' })}>
          <div>
            <span>In progress</span>
            <strong>{scopedInProgressItems.length}</strong>
          </div>
          <p>Being worked now</p>
        </Link>
        <Link className={filters.status === 'submitted' ? 'active' : ''} href={dashboardHref(filters, { status: 'submitted' })}>
          <div>
            <span>Submitted</span>
            <strong>{scopedSubmittedItems.length}</strong>
          </div>
          <p>Waiting on response</p>
        </Link>
        <Link className={filters.status === 'upcoming' ? 'active' : ''} href={dashboardHref(filters, { status: 'upcoming' })}>
          <div>
            <span>Upcoming</span>
            <strong>{scopedUpcomingItems.length}</strong>
          </div>
          <p>Not ready yet</p>
        </Link>
        <Link className={filters.status === 'overdue' ? 'active' : ''} href={dashboardHref(filters, { status: 'overdue' })}>
          <div>
            <span>Overdue</span>
            <strong>{scopedOverdueItems.length}</strong>
          </div>
          <p>Past expiration</p>
        </Link>
      </section>

      <section className="panel queue-filter-panel" aria-label="Queue filters">
        <div className="queue-filter-heading">
          <div>
            <span>Queue filters</span>
            <h2>Refine work queue</h2>
          </div>
          {(filters.owner || hasColumnFilters) ? <Link className="secondary-link" href="/">Clear filters</Link> : null}
        </div>
        <div className="queue-filter-rows">
          <div className="queue-filter-row">
            <span>Owner</span>
            <Link className={!filters.owner ? 'active' : ''} href={dashboardHref(filters, { owner: undefined })}>{defaultOwnerLabel}</Link>
            {isCustomerAdmin ? <Link className={filters.owner === 'all' ? 'active' : ''} href={dashboardHref(filters, { owner: 'all' })}>All owners</Link> : null}
            {ownerFilterCodes.map((owner) => (
              <Link className={filters.owner === owner ? 'active' : ''} href={dashboardHref(filters, { owner })} key={owner}>{owner}</Link>
            ))}
          </div>
          <div className="queue-filter-row">
            <span>Status</span>
            <Link className={!filters.status ? 'active' : ''} href={dashboardHref(filters, { status: undefined })}>All active</Link>
            {statusFilterOptions.map((option) => (
              <Link className={filters.status === option.value ? 'active' : ''} href={dashboardHref(filters, { status: option.value })} key={option.value}>{option.label}</Link>
            ))}
          </div>
          <div className="queue-filter-row">
            <span>Agency/Type</span>
            <Link className={!filters.type ? 'active' : ''} href={dashboardHref(filters, { type: undefined })}>All types</Link>
            {limitedOptions(typeOptions, filters.type).map((type) => (
              <Link className={filters.type === type ? 'active' : ''} href={dashboardHref(filters, { type })} key={type}>{type}</Link>
            ))}
          </div>
          <div className="queue-filter-row">
            <span>Vessel</span>
            <Link className={!filters.vessel ? 'active' : ''} href={dashboardHref(filters, { vessel: undefined })}>All vessels</Link>
            {limitedOptions(vesselOptions, filters.vessel).map((vessel) => (
              <Link className={filters.vessel === vessel ? 'active' : ''} href={dashboardHref(filters, { vessel })} key={vessel}>{vessel}</Link>
            ))}
          </div>
          <div className="queue-filter-row">
            <span>Frequency</span>
            <Link className={!filters.frequency ? 'active' : ''} href={dashboardHref(filters, { frequency: undefined })}>All frequencies</Link>
            {limitedOptions(frequencyOptions, filters.frequency).map((frequency) => (
              <Link className={filters.frequency === frequency ? 'active' : ''} href={dashboardHref(filters, { frequency })} key={frequency}>{frequency}</Link>
            ))}
          </div>
        </div>
      </section>

      <section className="panel priority-panel queue-panel">
        <div className="panel-heading">
          <div>
            <span>{hasColumnFilters ? `${queueItems.length} matching items · ${queueScopeLabel}` : queueScopeLabel}</span>
            <h2>{queueHeading}</h2>
          </div>
          <div className="queue-actions">
            <Link className="secondary-link" href="/items">All records</Link>
          </div>
        </div>

        <div className="queue-list" aria-label="Actionable compliance items">
          {queueItems.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 aria-hidden="true" />
              <h3>{isUnmappedRegularUser ? 'No owner queue yet' : hasColumnFilters ? 'No items match these filters' : 'No actionable items right now'}</h3>
              <p>{isUnmappedRegularUser ? 'Your queue will appear after a Customer Admin maps your login to an owner code.' : hasColumnFilters ? 'Clear or adjust the filters to bring more compliance work back into view.' : 'Items will appear here when their start-working date arrives, or when they are in progress, submitted, or overdue.'}</p>
            </div>
          ) : queueItems.slice(0, 12).map((item) => (
            <Link className="queue-item-row" href={`/items/${item.id}`} key={item.id}>
              <div className="queue-item-main">
                <div className="queue-item-kicker">
                  <span>{item.owner_current ?? 'Unassigned'}</span>
                  <span>{itemVessel(item)}</span>
                  <span>{item.agency_type ?? 'No agency'} · {item.compliance_area ?? 'Other'}</span>
                  <span>{item.frequency_label ?? 'No frequency'}</span>
                </div>
                <strong>{item.item_name}</strong>
                <p>{item.status_notes || 'No notes'}</p>
              </div>
              <div className="queue-item-side">
                <span className={`status-chip state-${stateClassName(displayState(item))}`}>{displayState(item)}</span>
                <dl className="queue-item-dates">
                  <div>
                    <dt>Start</dt>
                    <dd>{shortDate(item.start_working_on)}</dd>
                  </div>
                  <div>
                    <dt>Expiration</dt>
                    <dd>{shortDate(item.expiration_date)}</dd>
                  </div>
                </dl>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
