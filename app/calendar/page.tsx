import Link from 'next/link';
import { AppSidebar } from '@/components/app-sidebar';
import { daysUntil, displayState, formatDate, stateClassName, type ComplianceItem } from '@/lib/compliance';
import { getCustomerContext, getCustomerItems, itemVessel } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type AgendaEvent = {
  date: string;
  kind: 'Start' | 'Expiration';
  item: ComplianceItem;
};

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(value + 'T00:00:00'));
}

function buildAgenda(items: ComplianceItem[]) {
  return items
    .filter((item) => !['complete', 'discontinued'].includes(item.status))
    .flatMap((item) => {
      const events: AgendaEvent[] = [];
      if (item.start_working_on) events.push({ date: item.start_working_on, kind: 'Start', item });
      if (item.expiration_date) events.push({ date: item.expiration_date, kind: 'Expiration', item });
      return events;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function urgencyCopy(event: AgendaEvent) {
  const days = daysUntil(event.date);
  if (days === null) return 'No date';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

export default async function CalendarPage() {
  const { membership, company, isAppAdmin } = await getCustomerContext({ allowAppAdmin: true });
  const items = await getCustomerItems(membership.company_id);
  const agenda = buildAgenda(items);
  const grouped = agenda.reduce<Record<string, AgendaEvent[]>>((acc, event) => {
    const key = monthLabel(event.date);
    acc[key] = [...(acc[key] ?? []), event];
    return acc;
  }, {});

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} isAppAdmin={isAppAdmin} activePath="/calendar" />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Calendar</p>
            <h1>Start dates and expirations</h1>
            <p>The spreadsheet used two dates: when to begin the work, and when the certificate, permit, report, or exercise expires.</p>
          </div>
          <Link className="primary-action" href="/">Work queue</Link>
        </header>

        <section className="customer-summary-grid" aria-label="Calendar summary">
          <article>
            <span>Ready now</span>
            <strong>{items.filter((item) => ['Ready', 'Overdue'].includes(displayState(item))).length}</strong>
            <p>Start date has arrived</p>
          </article>
          <article>
            <span>Next 30 days</span>
            <strong>{agenda.filter((event) => {
              const days = daysUntil(event.date);
              return days !== null && days >= 0 && days <= 30;
            }).length}</strong>
            <p>Starts and expirations</p>
          </article>
          <article>
            <span>Expirations</span>
            <strong>{agenda.filter((event) => event.kind === 'Expiration').length}</strong>
            <p>Open item due dates</p>
          </article>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <span>{agenda.length} calendar events</span>
              <h2>Upcoming work</h2>
            </div>
          </div>

          {agenda.length === 0 ? (
            <div className="empty-state"><h3>No calendar dates yet</h3><p>Add start and expiration dates to build the compliance calendar.</p></div>
          ) : null}

          <div className="agenda-list">
            {Object.entries(grouped).map(([month, events]) => (
              <section key={month}>
                <h3>{month}</h3>
                {events.map((event) => {
                  const state = displayState(event.item);
                  return (
                    <Link className="agenda-row" href={`/items/${event.item.id}`} key={`${event.item.id}-${event.kind}`}>
                      <span className={event.kind === 'Expiration' ? 'agenda-kind agenda-kind-expiration' : 'agenda-kind'}>{event.kind}</span>
                      <strong>{formatDate(event.date)}</strong>
                      <div>
                        <b>{event.item.item_name}</b>
                        <p>{itemVessel(event.item)} · {event.item.owner_current ?? 'Unassigned'} · {event.item.agency_type ?? 'No agency'}</p>
                      </div>
                      <span>{urgencyCopy(event)}</span>
                      <span className={`status-chip state-${stateClassName(state)}`}>{state}</span>
                    </Link>
                  );
                })}
              </section>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
