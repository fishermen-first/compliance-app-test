import Link from 'next/link';
import { Download } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { displayState, formatDate, itemIsOverdue } from '@/lib/compliance';
import { getCompanyOwnerCodes, getCustomerContext, getCustomerItems, itemVessel } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type CompletedPageProps = {
  searchParams?: { year?: string; owner?: string; vessel?: string; sort?: string; dir?: string };
};

type CompleteHistoryRow = {
  item_id: string;
  changed_at: string;
  notes: string | null;
  profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

type SortKey = 'item' | 'vessel' | 'owner' | 'completed' | 'by';

const sortKeys = new Set<SortKey>(['item', 'vessel', 'owner', 'completed', 'by']);

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function actorLabel(row: CompleteHistoryRow | undefined) {
  const profile = relation(row?.profiles);
  return profile?.full_name ?? profile?.email ?? '-';
}

function completedHref(searchParams: CompletedPageProps['searchParams'], updates: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();

  for (const key of ['year', 'owner', 'vessel', 'sort', 'dir']) {
    const value = Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : searchParams?.[key as keyof NonNullable<CompletedPageProps['searchParams']>];
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return query ? `/completed?${query}` : '/completed';
}

function csvEscape(value: string | null | undefined) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function SortHeader({ label, sortKey, searchParams, sort, dir }: { label: string; sortKey: SortKey; searchParams: CompletedPageProps['searchParams']; sort: SortKey; dir: 'asc' | 'desc' }) {
  const active = sort === sortKey;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';

  return (
    <Link className="th-sort" data-sorted={active ? 'true' : undefined} href={completedHref(searchParams, { sort: sortKey, dir: nextDir })} scroll={false}>
      <span>{label}</span>
      <span className="arr">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </Link>
  );
}

export default async function CompletedPage({ searchParams }: CompletedPageProps) {
  const { membership, company, profile, user, supabase } = await getCustomerContext();
  const [items, ownerCodes] = await Promise.all([getCustomerItems(membership.company_id), getCompanyOwnerCodes(membership.company_id)]);
  const ownerNames = new Map(ownerCodes.map((owner) => [owner.code, owner.display_name ?? owner.code]));
  const assignedTo = (item: (typeof items)[number]) => item.owner_current ? ownerNames.get(item.owner_current) ?? item.owner_current : 'Unassigned';
  const completedItems = items.filter((item) => item.status === 'complete');
  const completedIds = completedItems.map((item) => item.id);
  const { data: completeHistory } = completedIds.length > 0
    ? await supabase
        .from('compliance_item_status_history')
        .select('item_id, changed_at, notes, profiles(full_name, email)')
        .eq('company_id', membership.company_id)
        .eq('to_status', 'complete')
        .in('item_id', completedIds)
        .order('changed_at', { ascending: false })
    : { data: [] as CompleteHistoryRow[] };
  const historyByItem = new Map<string, CompleteHistoryRow>();
  ((completeHistory ?? []) as CompleteHistoryRow[]).forEach((row) => {
    if (!historyByItem.has(row.item_id)) historyByItem.set(row.item_id, row);
  });
  const years = Array.from(new Set(completedItems.map((item) => item.completed_at?.slice(0, 4)).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a));
  const owners = ownerCodes.map((owner) => owner.code).sort();
  const vessels = Array.from(new Set(completedItems.map(itemVessel))).sort();
  const sort = sortKeys.has(searchParams?.sort as SortKey) ? searchParams?.sort as SortKey : 'completed';
  const dir = searchParams?.dir === 'asc' ? 'asc' : 'desc';

  const filtered = completedItems.filter((item) => {
    if (searchParams?.year && item.completed_at?.slice(0, 4) !== searchParams.year) return false;
    if (searchParams?.owner && item.owner_current !== searchParams.owner) return false;
    if (searchParams?.vessel && itemVessel(item) !== searchParams.vessel) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const multiplier = dir === 'desc' ? -1 : 1;
    const aHistory = historyByItem.get(a.id);
    const bHistory = historyByItem.get(b.id);
    const values: Record<SortKey, [string, string]> = {
      item: [a.item_name, b.item_name],
      vessel: [itemVessel(a), itemVessel(b)],
      owner: [assignedTo(a), assignedTo(b)],
      completed: [a.completed_at ?? '', b.completed_at ?? ''],
      by: [actorLabel(aHistory), actorLabel(bHistory)]
    };
    const compared = values[sort][0].localeCompare(values[sort][1]);
    return compared === 0 ? a.item_name.localeCompare(b.item_name) : compared * multiplier;
  });

  const csv = [
    ['Item', 'Vessel', 'Assigned to', 'Completed', 'By', 'Final note', 'Proof'].map(csvEscape).join(','),
    ...sorted.map((item) => [
      item.item_name,
      itemVessel(item),
      assignedTo(item),
      item.completed_at ?? '',
      actorLabel(historyByItem.get(item.id)),
      item.status_notes ?? '',
      item.sharepoint_url ?? ''
    ].map(csvEscape).join(','))
  ].join('\n');
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  const dueCount = items.filter((item) => !['complete', 'discontinued'].includes(item.status) && (displayState(item) === 'Due' || itemIsOverdue(item))).length;
  const userName = profile?.full_name ?? user.email ?? 'User';

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={userName}
        userEmail={user.email}
        dueCount={dueCount}
        activePath="/completed"
      />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Completed</p>
            <h1>Completed</h1>
            <p>Completed records with the final note, proof link, owner, and completion trail.</p>
          </div>
          <a className="primary-action" href={csvHref} download="completed-compliance-items.csv">
            <Download aria-hidden="true" />
            <span>Export CSV</span>
          </a>
        </header>

        <section className="panel queue-filter-panel" aria-label="Completed filters">
          <div className="completed-filter-bar">
            <div className="filter-chip-bar">
              <Link className={`dropdown-chip${!searchParams?.year ? ' active' : ''}`} href={completedHref(searchParams, { year: undefined })} scroll={false}>All years</Link>
              {years.map((year) => <Link className={`dropdown-chip${searchParams?.year === year ? ' active' : ''}`} href={completedHref(searchParams, { year })} key={year} scroll={false}>{year}</Link>)}
              <Link className={`dropdown-chip${!searchParams?.owner ? ' active' : ''}`} href={completedHref(searchParams, { owner: undefined })} scroll={false}>All owners</Link>
              {owners.map((owner) => <Link className={`dropdown-chip${searchParams?.owner === owner ? ' active' : ''}`} href={completedHref(searchParams, { owner })} key={owner} scroll={false}>{owner}</Link>)}
              <Link className={`dropdown-chip${!searchParams?.vessel ? ' active' : ''}`} href={completedHref(searchParams, { vessel: undefined })} scroll={false}>All vessels</Link>
              {vessels.slice(0, 8).map((vessel) => <Link className={`dropdown-chip${searchParams?.vessel === vessel ? ' active' : ''}`} href={completedHref(searchParams, { vessel })} key={vessel} scroll={false}>{vessel}</Link>)}
            </div>
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <span>{sorted.length} records</span>
              <h2>Proof archive</h2>
            </div>
          </div>

          <div className="redesign-table-wrap">
            <table className="redesign-table" aria-label="Completed compliance records">
              <thead>
                <tr>
                  <th><SortHeader dir={dir} label="Item" searchParams={searchParams} sort={sort} sortKey="item" /></th>
                  <th><SortHeader dir={dir} label="Vessel" searchParams={searchParams} sort={sort} sortKey="vessel" /></th>
                  <th><SortHeader dir={dir} label="Assigned to" searchParams={searchParams} sort={sort} sortKey="owner" /></th>
                  <th><SortHeader dir={dir} label="Completed" searchParams={searchParams} sort={sort} sortKey="completed" /></th>
                  <th><SortHeader dir={dir} label="By" searchParams={searchParams} sort={sort} sortKey="by" /></th>
                  <th>Final note</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><h3>No completed records in this view</h3><p>Completed items will appear here once work is marked complete.</p></div></td></tr>
                ) : sorted.map((item) => {
                  const history = historyByItem.get(item.id);
                  return (
                    <tr key={item.id}>
                      <td><Link className="item-link" href={`/items/${item.id}`}>{item.item_name}</Link></td>
                      <td>{itemVessel(item)}</td>
                      <td><span className="own-chip">{assignedTo(item)}</span></td>
                      <td>{formatDate(item.completed_at)}</td>
                      <td>{actorLabel(history)}</td>
                      <td><span className="cell-note">{item.status_notes ?? history?.notes ?? 'No final note'}</span></td>
                      <td>{item.sharepoint_url ? <a className="proof-chip" href={item.sharepoint_url}>Proof</a> : <span className="proof-chip is-empty">- none filed</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
