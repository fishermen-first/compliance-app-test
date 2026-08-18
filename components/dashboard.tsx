import Link from 'next/link';
import { type ReactNode } from 'react';
import { CalendarDays, Columns3, Plus } from 'lucide-react';
import { accessRoleLabel, isCustomerOwnerRole } from '@/lib/roles';
import {
  type ComplianceItem,
  daysUntil,
  displayState,
  displayStateParam,
  formatDate,
  itemHasAnyOwnerCode,
  itemOwnersLabel,
  isWorkQueueItem,
  itemIsOverdue,
  shortDate
} from '@/lib/compliance';
import { itemVessel } from '@/lib/customer-data';
import { StatusBadge } from '@/components/status-badge';

export type DashboardFilters = {
  owner?: string;
  status?: string;
  type?: string;
  vessel?: string;
  frequency?: string;
  sort?: string;
  dir?: string;
  columns?: string;
};

type ColumnKey = 'item' | 'vessel' | 'owner' | 'agency' | 'start' | 'expiration' | 'status' | 'note' | 'frequency' | 'itemNumber';
type SortKey = 'item' | 'vessel' | 'owner' | 'agency' | 'start' | 'expiration' | 'status';

const columns: Array<{ key: ColumnKey; label: string }> = [
  { key: 'item', label: 'Item' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'owner', label: 'Owner' },
  { key: 'agency', label: 'Agency' },
  { key: 'start', label: 'Start' },
  { key: 'expiration', label: 'Expires' },
  { key: 'status', label: 'Status' },
  { key: 'note', label: 'Latest note' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'itemNumber', label: 'Item #' }
];

const defaultColumns: ColumnKey[] = ['item', 'vessel', 'owner', 'agency', 'start', 'expiration', 'status', 'note'];
const sortKeys = new Set<SortKey>(['item', 'vessel', 'owner', 'agency', 'start', 'expiration', 'status']);
const dashboardFilterKeys = ['owner', 'status', 'type', 'vessel', 'frequency', 'sort', 'dir', 'columns'] as const;

const statusFilterOptions = [
  { value: 'due', label: 'Due' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'not_due_yet', label: 'Not due yet' }
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function uniqueSorted(items: ComplianceItem[], getValue: (item: ComplianceItem) => string | null | undefined) {
  return Array.from(new Set(items.map(getValue).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function dashboardHref(filters: DashboardFilters, updates: Partial<Record<keyof DashboardFilters, string | null | undefined>>) {
  const params = new URLSearchParams();

  dashboardFilterKeys.forEach((key) => {
    const value = Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : filters[key];
    if (value) params.set(key, value);
  });

  const query = params.toString();
  return query ? `/?${query}` : '/';
}

function selectedColumns(value?: string) {
  const requested = (value ?? '')
    .split(',')
    .map((column) => column.trim())
    .filter((column): column is ColumnKey => columns.some((candidate) => candidate.key === column));
  const unique = Array.from(new Set(requested));
  return unique.length > 0 ? unique : defaultColumns;
}

function ownerSplit(items: ComplianceItem[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const owners = itemOwnersLabel(item);
    counts.set(owners, (counts.get(owners) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([owner, count]) => `${owner} ${count}`)
    .join(' · ');
}

function sortValue(item: ComplianceItem, sort: SortKey) {
  if (sort === 'item') return item.item_name;
  if (sort === 'vessel') return itemVessel(item);
  if (sort === 'owner') return itemOwnersLabel(item);
  if (sort === 'agency') return item.agency_type ?? '';
  if (sort === 'start') return item.start_working_on ?? '9999-12-31';
  if (sort === 'expiration') return item.expiration_date ?? '9999-12-31';
  return operationalStatusRank(item);
}

function operationalStatusRank(item: ComplianceItem) {
  if (itemIsOverdue(item)) return 0;
  if (displayState(item) === 'Due') return 1;
  if (item.status === 'in_progress') return 2;
  if (item.status === 'submitted') return 3;
  return 4;
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function sortItems(items: ComplianceItem[], sort: SortKey, dir: 'asc' | 'desc') {
  const multiplier = dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const compared = compareSortValues(sortValue(a, sort), sortValue(b, sort));
    return compared === 0 ? a.item_name.localeCompare(b.item_name) : compared * multiplier;
  });
}

function FilterMenu({
  label,
  selectedLabel,
  children
}: {
  label: string;
  selectedLabel: string;
  children: ReactNode;
}) {
  return (
    <details className="filter-chip-menu">
      <summary>{label}: {selectedLabel}</summary>
      <div className="filter-pop">{children}</div>
    </details>
  );
}

function SortHeader({ column, filters, sort, dir }: { column: { key: ColumnKey; label: string }; filters: DashboardFilters; sort: SortKey; dir: 'asc' | 'desc' }) {
  if (!sortKeys.has(column.key as SortKey)) return <span>{column.label}</span>;

  const key = column.key as SortKey;
  const active = sort === key;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';

  return (
    <Link className="th-sort" data-sorted={active ? 'true' : undefined} href={dashboardHref(filters, { sort: key, dir: nextDir })} scroll={false}>
      <span>{column.label}</span>
      <span className="arr">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </Link>
  );
}

function ColumnChooser({ filters, visibleColumns }: { filters: DashboardFilters; visibleColumns: ColumnKey[] }) {
  return (
    <details className="column-menu">
      <summary><Columns3 aria-hidden="true" /> Columns</summary>
      <div className="colpop">
        {columns.map((column) => {
          const nextColumns = visibleColumns.includes(column.key)
            ? visibleColumns.filter((key) => key !== column.key)
            : [...visibleColumns, column.key];
          const safeColumns = nextColumns.length > 0 ? nextColumns : visibleColumns;
          const value = safeColumns.length === defaultColumns.length ? undefined : safeColumns.join(',');

          return (
            <Link className={visibleColumns.includes(column.key) ? 'active' : ''} href={dashboardHref(filters, { columns: value })} key={column.key} scroll={false}>
              <span>{column.label}</span>
              <span>{visibleColumns.includes(column.key) ? '✓' : ''}</span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function QueueCell({ item, column, isMine }: { item: ComplianceItem; column: ColumnKey; isMine: boolean }) {
  if (column === 'item') {
    return (
      <td>
        <Link className="item-link" href={`/items/${item.id}`}>
          <span>{item.item_name}</span>
          <small className="subline">{item.item_number ? `#${item.item_number} · ` : ''}{item.compliance_area ?? 'Other'}</small>
        </Link>
      </td>
    );
  }
  if (column === 'vessel') {
    return <td><span>{itemVessel(item)}</span><small className="subline">{item.vessel_id ? 'Vessel' : 'Office'}</small></td>;
  }
  if (column === 'owner') return <td><span className={`own-chip${isMine ? ' is-me' : ''}`}>{itemOwnersLabel(item)}</span></td>;
  if (column === 'agency') return <td>{item.agency_type ?? '-'}</td>;
  if (column === 'start') return <td>{shortDate(item.start_working_on)}</td>;
  if (column === 'expiration') return <td>{shortDate(item.expiration_date)}</td>;
  if (column === 'status') return <td><StatusBadge item={item} /></td>;
  if (column === 'note') return <td><span className="cell-note">{item.status_notes || 'No note yet'}</span></td>;
  if (column === 'frequency') return <td>{item.frequency_label ?? '-'}</td>;
  return <td>{item.item_number ?? '-'}</td>;
}

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
  const isCustomerOwner = isCustomerOwnerRole(currentUserRole);
  const canViewEveryone = isCustomerOwner || currentUserRole === 'office_user';
  const isUnmappedRegularUser = !isCustomerOwner && !hasOwnerMapping;
  const openItems = items.filter((item) => !['complete', 'discontinued'].includes(item.status));
  const scopedItems = showAllOwners
    ? openItems
    : selectedOwnerCodes.length > 0
      ? openItems.filter((item) => itemHasAnyOwnerCode(item, selectedOwnerCodes))
      : [];
  const sort = sortKeys.has(filters.sort as SortKey) ? filters.sort as SortKey : 'start';
  const dir = filters.dir === 'desc' ? 'desc' : 'asc';
  const visibleColumns = selectedColumns(filters.columns);
  const typeOptions = uniqueSorted(scopedItems, (item) => item.agency_type);
  const vesselOptions = uniqueSorted(scopedItems, itemVessel);
  const frequencyOptions = uniqueSorted(scopedItems, (item) => item.frequency_label);
  const filteredScopedItems = scopedItems.filter((item) => {
    if (filters.status === 'overdue' && !itemIsOverdue(item)) return false;
    if (filters.status && filters.status !== 'overdue' && item.status !== filters.status && displayStateParam(item) !== filters.status) return false;
    if (filters.type && item.agency_type !== filters.type) return false;
    if (filters.vessel && itemVessel(item) !== filters.vessel) return false;
    if (filters.frequency && item.frequency_label !== filters.frequency) return false;
    return true;
  });
  const hasColumnFilters = Boolean(filters.status || filters.type || filters.vessel || filters.frequency);
  const dueNowItems = scopedItems.filter((item) => displayState(item) === 'Due' && !itemIsOverdue(item));
  const inProgressItems = scopedItems.filter((item) => item.status === 'in_progress');
  const submittedItems = scopedItems.filter((item) => item.status === 'submitted');
  const overdueItems = scopedItems.filter(itemIsOverdue);
  const queueItems = sortItems(filteredScopedItems.filter((item) => {
    if (filters.status) return true;
    return isWorkQueueItem(item);
  }), sort, dir);
  const soonItems = sortItems(filteredScopedItems.filter((item) => {
    if (isWorkQueueItem(item)) return false;
    const startDays = daysUntil(item.start_working_on);
    return startDays !== null && startDays > 0 && startDays <= 30;
  }), 'start', 'asc');
  const hasSpecificOwnerFilter = Boolean(filters.owner && filters.owner !== 'all');
  const specificOwnerLabel = hasSpecificOwnerFilter ? filters.owner : null;
  const queueScopeLabel = specificOwnerLabel
    ? `Owner ${specificOwnerLabel}`
    : showAllOwners
      ? 'Everyone'
      : selectedOwnerCodes.length
        ? selectedOwnerCodes.join(', ')
        : 'Setup needed';
  let queueHeading = showAllOwners ? 'Current work queue' : 'My work queue';
  if (specificOwnerLabel) queueHeading = `Owner ${specificOwnerLabel} work queue`;
  if (hasColumnFilters) queueHeading = specificOwnerLabel ? `Filtered ${specificOwnerLabel} work queue` : 'Filtered work queue';
  const intro = specificOwnerLabel
    ? `Items assigned to ${specificOwnerLabel} whose start-working date has arrived, plus work already in progress, submitted, or overdue.`
    : showAllOwners
      ? 'Team items whose start-working date has arrived, plus work already in progress, submitted, or overdue.'
      : 'Items you own whose start-working date has arrived, plus work already in progress, submitted, or overdue.';
  const statusLabel = statusFilterOptions.find((option) => option.value === filters.status)?.label ?? 'Actionable';
  const ownerLabel = filters.owner === 'all' ? 'Everyone' : filters.owner ?? (showAllOwners ? 'Everyone' : 'Mine');
  const agencyLabel = filters.type ?? 'All';
  const vesselLabel = filters.vessel ?? 'All';
  const frequencyLabel = filters.frequency ?? 'All';

  return (
    <main className="workspace">
      <header className="page-header">
        <div>
          <p className="eyebrow">{companyName}</p>
          <h1>{queueHeading}</h1>
          <p className="intro">{intro}</p>
        </div>

        <div className="header-actions">
          <div className="scope-seg" aria-label="Queue scope">
            <Link href={dashboardHref(filters, { owner: undefined })} aria-current={!showAllOwners && !hasSpecificOwnerFilter ? 'true' : undefined} scroll={false}>
              Mine - {selectedOwnerCodes.length ? selectedOwnerCodes.join(', ') : 'setup'}
            </Link>
            {hasSpecificOwnerFilter ? <span aria-current="true">Owner {filters.owner}</span> : null}
            {canViewEveryone ? (
              <Link href={dashboardHref(filters, { owner: 'all' })} aria-current={showAllOwners ? 'true' : undefined} scroll={false}>
                Everyone
              </Link>
            ) : null}
          </div>
          <Link className="btn" href="/calendar">
            <CalendarDays aria-hidden="true" />
            <span>Compliance schedule</span>
          </Link>
          {canCreateItems ? (
            <Link className="btn primary" href="/items/new">
              <Plus aria-hidden="true" />
              <span>New item</span>
            </Link>
          ) : null}
          <button className="user-pill" type="button" aria-label={`Current user ${currentUserName}`}>
            <span className="avatar">{initials(currentUserName)}</span>
            <strong>{currentUserName}</strong>
            <small>{accessRoleLabel(currentUserRole)}{selectedOwnerCodes.length ? ` · ${selectedOwnerCodes.join(', ')}` : ''}</small>
          </button>
        </div>
      </header>

      {!hasOwnerMapping && isCustomerOwner ? (
        <div className="admin-notice">
          <span className="pill">Admin view</span>
          <span>No owner code is mapped to your login - this workspace opens to <strong>all company work</strong>. Map an owner code for a personal queue.</span>
          <Link href="/settings">Map owner code</Link>
        </div>
      ) : null}

      {isUnmappedRegularUser ? (
        <section className="owner-notice-panel setup-warning-panel">
          <strong>Owner setup needed</strong>
          <span>Ask a workspace owner to map your login to the owner initials from the workbook. Item edits stay locked until that mapping exists.</span>
        </section>
      ) : null}

      <section className="snapshot redesign-snapshot" aria-label="Queue snapshot">
        <article className="stat-card">
          <span>Due now</span>
          <strong>{dueNowItems.length}</strong>
          <p>{showAllOwners ? ownerSplit(dueNowItems) || 'No owner split yet' : 'Start-working date has arrived.'}</p>
        </article>
        <article className="stat-card">
          <span>In progress</span>
          <strong>{inProgressItems.length}</strong>
          <p>Renewals, filings, audits, or checks being worked now.</p>
        </article>
        <article className="stat-card">
          <span>Submitted</span>
          <strong>{submittedItems.length}</strong>
          <p>Waiting on an agency, auditor, certifier, or confirmation.</p>
        </article>
        <article className={`stat-card${overdueItems.length > 0 ? ' hot' : ' calm'}`}>
          <span>Overdue</span>
          <strong>{overdueItems.length}</strong>
          <p>Past expiration while still open.</p>
        </article>
      </section>

      <section className="panel queue-filter-panel" aria-label="Queue filters">
        <div className="queue-tools">
          <div className="filter-chip-bar">
            <FilterMenu label="Vessel" selectedLabel={vesselLabel}>
              <Link className={!filters.vessel ? 'active' : ''} href={dashboardHref(filters, { vessel: undefined })} scroll={false}>All vessels</Link>
              {vesselOptions.map((vessel) => (
                <Link className={filters.vessel === vessel ? 'active' : ''} href={dashboardHref(filters, { vessel })} key={vessel} scroll={false}>{vessel}</Link>
              ))}
            </FilterMenu>
            {canViewEveryone ? (
              <FilterMenu label="Owner" selectedLabel={ownerLabel}>
                <Link className={!filters.owner && !showAllOwners ? 'active' : ''} href={dashboardHref(filters, { owner: undefined })} scroll={false}>Mine</Link>
                <Link className={filters.owner === 'all' || showAllOwners ? 'active' : ''} href={dashboardHref(filters, { owner: 'all' })} scroll={false}>Everyone</Link>
                {ownerFilterCodes.map((owner) => (
                  <Link className={filters.owner === owner ? 'active' : ''} href={dashboardHref(filters, { owner })} key={owner} scroll={false}>{owner}</Link>
                ))}
              </FilterMenu>
            ) : null}
            <FilterMenu label="Agency" selectedLabel={agencyLabel}>
              <Link className={!filters.type ? 'active' : ''} href={dashboardHref(filters, { type: undefined })} scroll={false}>All agencies</Link>
              {typeOptions.map((type) => (
                <Link className={filters.type === type ? 'active' : ''} href={dashboardHref(filters, { type })} key={type} scroll={false}>{type}</Link>
              ))}
            </FilterMenu>
            <FilterMenu label="Status" selectedLabel={statusLabel}>
              <Link className={!filters.status ? 'active' : ''} href={dashboardHref(filters, { status: undefined })} scroll={false}>Actionable</Link>
              {statusFilterOptions.map((option) => (
                <Link className={filters.status === option.value ? 'active' : ''} href={dashboardHref(filters, { status: option.value })} key={option.value} scroll={false}>{option.label}</Link>
              ))}
            </FilterMenu>
            <FilterMenu label="+ Filter" selectedLabel={frequencyLabel}>
              <Link className={!filters.frequency ? 'active' : ''} href={dashboardHref(filters, { frequency: undefined })} scroll={false}>All frequencies</Link>
              {frequencyOptions.map((frequency) => (
                <Link className={filters.frequency === frequency ? 'active' : ''} href={dashboardHref(filters, { frequency })} key={frequency} scroll={false}>{frequency}</Link>
              ))}
            </FilterMenu>
          </div>
          <div className="table-tools">
            {(filters.owner || hasColumnFilters) ? <Link className="secondary-link" href="/" scroll={false}>Clear filters</Link> : null}
            <ColumnChooser filters={filters} visibleColumns={visibleColumns} />
          </div>
        </div>
      </section>

      <section className="panel priority-panel queue-panel">
        <div className="panel-heading">
          <div>
            <span>{hasColumnFilters ? `${queueItems.length} matching items · ${queueScopeLabel}` : `${queueItems.length} live items · ${queueScopeLabel}`}</span>
            <h2>{queueHeading}</h2>
          </div>
          <div className="queue-actions">
            <Link className="secondary-link" href="/items">All items</Link>
          </div>
        </div>

        <div className="redesign-table-wrap">
          <table className="redesign-table" aria-label="Actionable compliance items">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column}><SortHeader column={columns.find((candidate) => candidate.key === column)!} filters={filters} sort={sort} dir={dir} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queueItems.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length}>
                    <div className="empty-state">
                      <h3>{isUnmappedRegularUser ? 'No owner queue yet' : hasColumnFilters ? 'No items match these filters' : 'No actionable items right now'}</h3>
                      <p>{isUnmappedRegularUser ? 'Your queue will appear after a workspace owner maps your login to an owner code.' : hasColumnFilters ? 'Clear or adjust the filters to bring more compliance work back into view.' : 'Actionable items appear here when their start-working date arrives, or when they are in progress, submitted, or overdue.'}</p>
                    </div>
                  </td>
                </tr>
              ) : queueItems.map((item) => (
                <tr key={item.id}>
                  {visibleColumns.map((column) => (
                    <QueueCell column={column} isMine={itemHasAnyOwnerCode(item, selectedOwnerCodes)} item={item} key={column} />
                  ))}
                </tr>
              ))}
              {soonItems.length > 0 ? (
                <>
                  <tr className="row-group"><td colSpan={visibleColumns.length}>Starting soon - next 30 days</td></tr>
                  {soonItems.map((item) => (
                    <tr key={`soon-${item.id}`}>
                      {visibleColumns.map((column) => (
                        <QueueCell column={column} isMine={itemHasAnyOwnerCode(item, selectedOwnerCodes)} item={item} key={column} />
                      ))}
                    </tr>
                  ))}
                </>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
