import Link from 'next/link';
import { type CSSProperties } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { type ComplianceItem, displayState, formatDate, stateClassName } from '@/lib/compliance';
import { getCustomerContext, getCustomerItems, titleCase } from '@/lib/customer-data';
import { accessRoleLabel, isCustomerOwnerRole } from '@/lib/roles';

type ItemsPageProps = {
  searchParams?: { status?: string; owner?: string; vessel?: string; area?: string; sort?: string; dir?: string; columns?: string };
};

type ColumnKey = 'owner' | 'vessel' | 'item' | 'agency' | 'area' | 'frequency' | 'start' | 'expiration' | 'status' | 'notes';
type SortKey = 'owner' | 'vessel' | 'item' | 'agency' | 'area' | 'frequency' | 'start' | 'expiration' | 'status';

const columns: Array<{ key: ColumnKey; label: string; track: string }> = [
  { key: 'owner', label: 'Owner', track: '62px' },
  { key: 'vessel', label: 'Vessel', track: 'minmax(118px, 145px)' },
  { key: 'item', label: 'Item', track: 'minmax(250px, 1.4fr)' },
  { key: 'agency', label: 'Agency', track: 'minmax(80px, 0.45fr)' },
  { key: 'area', label: 'Area', track: 'minmax(130px, 0.75fr)' },
  { key: 'frequency', label: 'Frequency', track: 'minmax(105px, 0.6fr)' },
  { key: 'start', label: 'Start', track: 'minmax(112px, 0.65fr)' },
  { key: 'expiration', label: 'Expiration', track: 'minmax(112px, 0.65fr)' },
  { key: 'status', label: 'Status', track: 'minmax(112px, 0.65fr)' },
  { key: 'notes', label: 'Notes', track: 'minmax(160px, 0.9fr)' }
];

const defaultColumns = columns.map((column) => column.key);
const sortKeys = new Set<SortKey>(['owner', 'vessel', 'item', 'agency', 'area', 'frequency', 'start', 'expiration', 'status']);
const statusRank: Record<string, number> = {
  Overdue: 0,
  Ready: 1,
  'In Progress': 2,
  Submitted: 3,
  Upcoming: 4,
  Complete: 5,
  Discontinued: 6
};

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

  for (const key of ['status', 'owner', 'vessel', 'area', 'sort', 'dir', 'columns']) {
    const value = Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : searchParams?.[key as keyof NonNullable<ItemsPageProps['searchParams']>];
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return query ? `/items?${query}` : '/items';
}

function sortValue(item: ComplianceItem, sort: SortKey) {
  if (sort === 'owner') return item.owner_current ?? '';
  if (sort === 'vessel') return item.vessel_name ?? 'Company-wide';
  if (sort === 'item') return item.item_name;
  if (sort === 'agency') return item.agency_type ?? '';
  if (sort === 'area') return item.compliance_area ?? '';
  if (sort === 'frequency') return item.frequency_label ?? '';
  if (sort === 'start') return item.start_working_on ?? '9999-12-31';
  if (sort === 'expiration') return item.expiration_date ?? '9999-12-31';
  return statusRank[displayState(item)] ?? 99;
}

function sortItems(items: ComplianceItem[], sort: SortKey, dir: 'asc' | 'desc') {
  const multiplier = dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const aValue = sortValue(a, sort);
    const bValue = sortValue(b, sort);
    const compared = typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue));

    return compared === 0 ? a.item_name.localeCompare(b.item_name) : compared * multiplier;
  });
}

function tableStyle(visibleColumns: ColumnKey[]): CSSProperties {
  return {
    '--item-grid-template': columns
      .filter((column) => visibleColumns.includes(column.key))
      .map((column) => column.track)
      .join(' ')
  } as CSSProperties;
}

function itemCell(item: ComplianceItem, column: ColumnKey) {
  const state = displayState(item);

  if (column === 'owner') return <span>{item.owner_current ?? 'Unassigned'}</span>;
  if (column === 'vessel') return <span>{item.vessel_name ?? 'Company-wide'}</span>;
  if (column === 'item') return <strong>{item.item_name}</strong>;
  if (column === 'agency') return <span>{item.agency_type ?? '-'}</span>;
  if (column === 'area') return <span>{item.compliance_area ?? 'Other'}</span>;
  if (column === 'frequency') return <span>{item.frequency_label ?? '-'}</span>;
  if (column === 'start') return <span>{formatDate(item.start_working_on)}</span>;
  if (column === 'expiration') return <span>{formatDate(item.expiration_date)}</span>;
  if (column === 'status') return <span className={`status-chip state-${stateClassName(state)}`}>{state}</span>;
  return <span>{item.status_notes || '-'}</span>;
}

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const { membership, company } = await getCustomerContext();
  const allItems = await getCustomerItems(membership.company_id);
  const canCreateItems = isCustomerOwnerRole(membership.role);
  const owners = Array.from(new Set(allItems.map((item) => item.owner_current).filter(Boolean) as string[])).sort();
  const vessels = Array.from(new Set(allItems.map((item) => item.vessel_name).filter(Boolean) as string[])).sort();
  const areas = Array.from(new Set(allItems.map((item) => item.compliance_area).filter(Boolean) as string[])).sort();
  const sort = sortKeys.has(searchParams?.sort as SortKey) ? searchParams?.sort as SortKey : 'expiration';
  const dir = searchParams?.dir === 'desc' ? 'desc' : 'asc';
  const visibleColumns = selectedColumns(searchParams?.columns);
  const rowStyle = tableStyle(visibleColumns);

  const filteredItems = sortItems(allItems.filter((item) => {
    const state = displayState(item).toLowerCase().replaceAll(' ', '_');
    if (searchParams?.status && searchParams.status !== item.status && searchParams.status !== state) return false;
    if (searchParams?.owner && item.owner_current !== searchParams.owner) return false;
    if (searchParams?.vessel === 'company-wide' && item.vessel_name) return false;
    if (searchParams?.vessel && searchParams.vessel !== 'company-wide' && item.vessel_name !== searchParams.vessel) return false;
    if (searchParams?.area && item.compliance_area !== searchParams.area) return false;
    return true;
  }), sort, dir);

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} activePath="" />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Records</p>
            <h1>Compliance item list</h1>
            <p>Search the full imported spreadsheet replacement: current, upcoming, submitted, overdue, complete, and discontinued items.</p>
          </div>
          {canCreateItems ? <Link className="primary-action" href="/items/new">New Item</Link> : null}
        </header>

        <section className="panel filter-panel">
          <div>
            <span>Owner</span>
            <Link className={!searchParams?.owner ? 'active' : ''} href={itemsHref(searchParams, { owner: undefined })} scroll={false}>All</Link>
            {owners.map((owner) => <Link className={searchParams?.owner === owner ? 'active' : ''} href={itemsHref(searchParams, { owner })} key={owner} scroll={false}>{owner}</Link>)}
          </div>
          <div>
            <span>Status</span>
            {['all', 'ready', 'overdue', 'in_progress', 'submitted', 'complete', 'discontinued'].map((status) => (
              <Link className={(status === 'all' && !searchParams?.status) || searchParams?.status === status ? 'active' : ''} href={itemsHref(searchParams, { status: status === 'all' ? undefined : status })} key={status} scroll={false}>{titleCase(status)}</Link>
            ))}
          </div>
          <div>
            <span>Area</span>
            <Link className={!searchParams?.area ? 'active' : ''} href={itemsHref(searchParams, { area: undefined })} scroll={false}>All areas</Link>
            {areas.slice(0, 8).map((area) => <Link className={searchParams?.area === area ? 'active' : ''} href={itemsHref(searchParams, { area })} key={area} scroll={false}>{area}</Link>)}
          </div>
          <div>
            <span>Vessel</span>
            <Link className={!searchParams?.vessel ? 'active' : ''} href={itemsHref(searchParams, { vessel: undefined })} scroll={false}>All vessels</Link>
            <Link className={searchParams?.vessel === 'company-wide' ? 'active' : ''} href={itemsHref(searchParams, { vessel: 'company-wide' })} scroll={false}>Company-wide</Link>
            {vessels.slice(0, 10).map((vessel) => <Link className={searchParams?.vessel === vessel ? 'active' : ''} href={itemsHref(searchParams, { vessel })} key={vessel} scroll={false}>{vessel}</Link>)}
          </div>
          <div>
            <span>Sort</span>
            {columns.filter((column) => sortKeys.has(column.key as SortKey)).map((column) => {
              const active = sort === column.key;
              const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
              return <Link className={active ? 'active' : ''} href={itemsHref(searchParams, { sort: column.key, dir: nextDir })} key={column.key} scroll={false}>{column.label}{active ? ` ${dir}` : ''}</Link>;
            })}
          </div>
          <div>
            <span>Columns</span>
            {columns.map((column) => {
              const nextColumns = visibleColumns.includes(column.key)
                ? visibleColumns.filter((key) => key !== column.key)
                : [...visibleColumns, column.key];
              const safeColumns = nextColumns.length > 0 ? nextColumns : visibleColumns;
              const value = safeColumns.length === defaultColumns.length ? undefined : safeColumns.join(',');
              return <Link className={visibleColumns.includes(column.key) ? 'active' : ''} href={itemsHref(searchParams, { columns: value })} key={column.key} scroll={false}>{column.label}</Link>;
            })}
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
            <div className="work-table-row work-table-head" role="row" style={rowStyle}>
              {columns.filter((column) => visibleColumns.includes(column.key)).map((column) => <span key={column.key}>{column.label}</span>)}
            </div>
            {filteredItems.map((item) => {
              return (
                <Link className="work-table-row" href={`/items/${item.id}`} role="row" key={item.id} style={rowStyle}>
                  {visibleColumns.map((column) => <span className="item-cell" key={column}>{itemCell(item, column)}</span>)}
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
