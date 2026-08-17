import Link from 'next/link';
import { type ReactNode } from 'react';
import { Columns3, Plus } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { StatusBadge } from '@/components/status-badge';
import { type ComplianceItem, displayState, displayStateParam, formatDate, itemIsOverdue } from '@/lib/compliance';
import { getCompanyOwnerCodes, getCustomerContext, getCustomerItems, itemVessel } from '@/lib/customer-data';
import { accessRoleLabel, canCreateComplianceItems } from '@/lib/roles';

type ItemsPageProps = {
  searchParams?: {
    q?: string;
    status?: string;
    owner?: string;
    vessel?: string;
    area?: string;
    sort?: string;
    dir?: string;
    columns?: string;
    page?: string;
  };
};

type ColumnKey = 'item' | 'vessel' | 'owner' | 'agency' | 'frequency' | 'start' | 'expiration' | 'status' | 'note' | 'itemNumber';
type SortKey = 'item' | 'vessel' | 'owner' | 'agency' | 'frequency' | 'start' | 'expiration' | 'status';

const pageSize = 10;

const columns: Array<{ key: ColumnKey; label: string }> = [
  { key: 'item', label: 'Item' },
  { key: 'vessel', label: 'Vessel' },
  { key: 'owner', label: 'Assigned to' },
  { key: 'agency', label: 'Agency' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'start', label: 'Start' },
  { key: 'expiration', label: 'Expiration' },
  { key: 'status', label: 'Status' },
  { key: 'note', label: 'Latest note' },
  { key: 'itemNumber', label: 'Item #' }
];

const defaultColumns: ColumnKey[] = ['item', 'vessel', 'owner', 'agency', 'frequency', 'start', 'expiration', 'status', 'note'];
const sortKeys = new Set<SortKey>(['item', 'vessel', 'owner', 'agency', 'frequency', 'start', 'expiration', 'status']);
const statusFilterOptions = [
  { value: 'due', label: 'Due' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'not_due_yet', label: 'Not due yet' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'complete', label: 'Complete' },
  { value: 'did_not_renew', label: 'Did not renew' }
];

function selectedColumns(value?: string) {
  const requested = (value ?? '')
    .split(',')
    .map((column) => column.trim())
    .filter((column): column is ColumnKey => columns.some((candidate) => candidate.key === column));
  const unique = Array.from(new Set(requested));
  return unique.length > 0 ? unique : defaultColumns;
}

function itemsHref(searchParams: ItemsPageProps['searchParams'], updates: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();

  for (const key of ['q', 'status', 'owner', 'vessel', 'area', 'sort', 'dir', 'columns', 'page']) {
    const value = Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : searchParams?.[key as keyof NonNullable<ItemsPageProps['searchParams']>];
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return query ? `/items?${query}` : '/items';
}

function sortValue(item: ComplianceItem, sort: SortKey) {
  if (sort === 'owner') return item.owner_current ?? '';
  if (sort === 'vessel') return itemVessel(item);
  if (sort === 'item') return item.item_name;
  if (sort === 'agency') return item.agency_type ?? '';
  if (sort === 'frequency') return item.frequency_label ?? '';
  if (sort === 'start') return item.start_working_on ?? '9999-12-31';
  if (sort === 'expiration') return item.expiration_date ?? '9999-12-31';
  return operationalStatusRank(item);
}

function operationalStatusRank(item: ComplianceItem) {
  if (itemIsOverdue(item)) return 0;
  if (displayState(item) === 'Due') return 1;
  if (item.status === 'in_progress') return 2;
  if (item.status === 'submitted') return 3;
  if (displayState(item) === 'Not due yet') return 4;
  if (item.status === 'complete') return 5;
  return 6;
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function sortItems(items: ComplianceItem[], sort: SortKey, dir: 'asc' | 'desc') {
  const multiplier = dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const compared = compareSortValues(sortValue(a, sort), sortValue(b, sort));
    if (compared !== 0) return compared * multiplier;

    const startCompared = String(a.start_working_on ?? '9999-12-31').localeCompare(String(b.start_working_on ?? '9999-12-31'));
    if (startCompared !== 0) return startCompared;

    const expirationCompared = String(a.expiration_date ?? '9999-12-31').localeCompare(String(b.expiration_date ?? '9999-12-31'));
    return expirationCompared === 0 ? a.item_name.localeCompare(b.item_name) : expirationCompared;
  });
}

function SortHeader({ column, searchParams, sort, dir }: { column: { key: ColumnKey; label: string }; searchParams: ItemsPageProps['searchParams']; sort: SortKey; dir: 'asc' | 'desc' }) {
  if (!sortKeys.has(column.key as SortKey)) return <span>{column.label}</span>;

  const key = column.key as SortKey;
  const active = sort === key;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';

  return (
    <Link className="th-sort" data-sorted={active ? 'true' : undefined} href={itemsHref(searchParams, { sort: key, dir: nextDir, page: undefined })} scroll={false}>
      <span>{column.label}</span>
      <span className="arr">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </Link>
  );
}

function ColumnChooser({ searchParams, visibleColumns }: { searchParams: ItemsPageProps['searchParams']; visibleColumns: ColumnKey[] }) {
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
            <Link className={visibleColumns.includes(column.key) ? 'active' : ''} href={itemsHref(searchParams, { columns: value, page: undefined })} key={column.key} scroll={false}>
              <span>{column.label}</span>
              <span>{visibleColumns.includes(column.key) ? '✓' : ''}</span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function FilterMenu({ label, selectedLabel, children }: { label: string; selectedLabel: string; children: ReactNode }) {
  return (
    <details className="filter-chip-menu">
      <summary>{label}: {selectedLabel}</summary>
      <div className="filter-pop">{children}</div>
    </details>
  );
}

function ItemCell({ item, column, ownerNames }: { item: ComplianceItem; column: ColumnKey; ownerNames: Map<string, string> }) {
  if (column === 'item') {
    return (
      <td>
        <Link className="item-link" href={`/items/${item.id}`}>
          <span>{item.item_name}</span>
          <small className="subline">{item.compliance_area ?? 'Other'}</small>
        </Link>
      </td>
    );
  }
  if (column === 'vessel') return <td>{itemVessel(item)}</td>;
  if (column === 'owner') return <td><span className="own-chip">{item.owner_current ? ownerNames.get(item.owner_current) ?? item.owner_current : 'Unassigned'}</span></td>;
  if (column === 'agency') return <td>{item.agency_type ?? '-'}</td>;
  if (column === 'frequency') return <td>{item.frequency_label ?? '-'}</td>;
  if (column === 'start') return <td>{formatDate(item.start_working_on)}</td>;
  if (column === 'expiration') return <td>{formatDate(item.expiration_date)}</td>;
  if (column === 'status') return <td><StatusBadge item={item} /></td>;
  if (column === 'note') return <td><span className="cell-note">{item.status_notes || 'No note yet'}</span></td>;
  return <td>{item.item_number ?? '-'}</td>;
}

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const { membership, company, profile, user } = await getCustomerContext();
  const [allItems, ownerCodes] = await Promise.all([getCustomerItems(membership.company_id), getCompanyOwnerCodes(membership.company_id)]);
  const ownerNames = new Map(ownerCodes.map((owner) => [owner.code, owner.display_name ?? owner.code]));
  const canCreateItems = canCreateComplianceItems(membership.role);
  const owners = ownerCodes.map((owner) => owner.code).sort();
  const vessels = Array.from(new Set(allItems.map(itemVessel))).sort();
  const sort = sortKeys.has(searchParams?.sort as SortKey) ? searchParams?.sort as SortKey : 'status';
  const dir = searchParams?.dir === 'desc' ? 'desc' : 'asc';
  const visibleColumns = selectedColumns(searchParams?.columns);
  const q = (searchParams?.q ?? '').trim().toLowerCase();
  const currentPage = Math.max(1, Number(searchParams?.page ?? 1) || 1);

  const filteredItems = sortItems(allItems.filter((item) => {
    if (q) {
      const haystack = [item.item_name, itemVessel(item), item.item_number].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (searchParams?.status === 'overdue' && !itemIsOverdue(item)) return false;
    if (searchParams?.status && searchParams.status !== 'overdue' && searchParams.status !== item.status && searchParams.status !== displayStateParam(item)) return false;
    if (searchParams?.owner && item.owner_current !== searchParams.owner) return false;
    if (searchParams?.vessel && itemVessel(item) !== searchParams.vessel) return false;
    return true;
  }), sort, dir);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * pageSize;
  const pagedItems = filteredItems.slice(startIndex, startIndex + pageSize);
  const showingStart = filteredItems.length === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + pageSize, filteredItems.length);
  const dueCount = allItems.filter((item) => !['complete', 'discontinued'].includes(item.status) && (displayState(item) === 'Due' || itemIsOverdue(item))).length;
  const userName = profile?.full_name ?? user.email ?? 'User';
  const statusLabel = statusFilterOptions.find((option) => option.value === searchParams?.status)?.label ?? 'All';
  const vesselLabel = searchParams?.vessel ?? 'All';
  const ownerLabel = searchParams?.owner ?? 'All';

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={userName}
        userEmail={user.email}
        dueCount={dueCount}
        activePath="/items"
      />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Records</p>
            <h1>All items</h1>
            <p>Every record in the workspace - current, upcoming, complete, and discontinued.</p>
          </div>
          <div className="header-action-row">
            <form action="/items" className="search-form">
              <input name="q" defaultValue={searchParams?.q ?? ''} placeholder="Search item, vessel, or item #" />
              <button className="secondary-action" type="submit">Search</button>
            </form>
            {canCreateItems ? (
              <Link className="primary-action" href="/items/new">
                <Plus aria-hidden="true" />
                <span>New item</span>
              </Link>
            ) : null}
          </div>
        </header>

        <section className="panel queue-filter-panel" aria-label="Item filters">
          <div className="queue-tools">
            <div className="filter-chip-bar">
              <FilterMenu label="Assigned to" selectedLabel={ownerLabel}>
                <Link className={!searchParams?.owner ? 'active' : ''} href={itemsHref(searchParams, { owner: undefined, page: undefined })} scroll={false}>All owners</Link>
                {owners.map((owner) => <Link className={searchParams?.owner === owner ? 'active' : ''} href={itemsHref(searchParams, { owner, page: undefined })} key={owner} scroll={false}>{owner}</Link>)}
              </FilterMenu>
              <FilterMenu label="Vessel" selectedLabel={vesselLabel}>
                <Link className={!searchParams?.vessel ? 'active' : ''} href={itemsHref(searchParams, { vessel: undefined, page: undefined })} scroll={false}>All vessels</Link>
                {vessels.map((vessel) => <Link className={searchParams?.vessel === vessel ? 'active' : ''} href={itemsHref(searchParams, { vessel, page: undefined })} key={vessel} scroll={false}>{vessel}</Link>)}
              </FilterMenu>
              <FilterMenu label="Status" selectedLabel={statusLabel}>
                <Link className={!searchParams?.status ? 'active' : ''} href={itemsHref(searchParams, { status: undefined, page: undefined })} scroll={false}>All statuses</Link>
                {statusFilterOptions.map((status) => <Link className={searchParams?.status === status.value ? 'active' : ''} href={itemsHref(searchParams, { status: status.value, page: undefined })} key={status.value} scroll={false}>{status.label}</Link>)}
              </FilterMenu>
            </div>
            <div className="table-tools">
              {(searchParams?.q || searchParams?.owner || searchParams?.vessel || searchParams?.status) ? <Link className="secondary-link" href="/items" scroll={false}>Clear filters</Link> : null}
              <ColumnChooser searchParams={searchParams} visibleColumns={visibleColumns} />
            </div>
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <span>{filteredItems.length} records</span>
              <h2>Workspace records</h2>
            </div>
          </div>

          <div className="redesign-table-wrap">
            <table className="redesign-table" aria-label="All compliance items">
              <thead>
                <tr>
                  {visibleColumns.map((columnKey) => {
                    const column = columns.find((candidate) => candidate.key === columnKey)!;
                    return <th key={column.key}><SortHeader column={column} dir={dir} searchParams={searchParams} sort={sort} /></th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {pagedItems.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length}>
                      <div className="empty-state">
                        <h3>No items match this view</h3>
                        <p>Adjust the search or filters to bring more compliance records back into view.</p>
                      </div>
                    </td>
                  </tr>
                ) : pagedItems.map((item) => (
                  <tr key={item.id}>
                    {visibleColumns.map((column) => <ItemCell column={column} item={item} ownerNames={ownerNames} key={column} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tbl-foot">
            <span>Showing {showingStart}-{showingEnd} of {filteredItems.length}</span>
            <div className="pagination-links">
              {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 8).map((pageNumber) => (
                <Link className={`page-link${pageNumber === page ? ' active' : ''}`} href={itemsHref(searchParams, { page: pageNumber === 1 ? undefined : String(pageNumber) })} key={pageNumber} scroll={false}>
                  {pageNumber}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
