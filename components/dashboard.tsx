import Link from 'next/link';
import { Mail, Plus } from 'lucide-react';

export type DashboardEvent = {
  id: string;
  title: string;
  vessel: string;
  owner: string;
  dueDate: string;
  daysAway: number;
  status: 'draft' | 'active' | 'waiting_on_vessel' | 'office_review' | 'complete' | 'archived';
  priority: 'low' | 'medium' | 'high';
  category: string;
};

export type DashboardVessel = {
  id: string;
  name: string;
  activeEvents: number;
  color: string;
};

const statusLabels: Record<DashboardEvent['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  waiting_on_vessel: 'Waiting on Vessel',
  office_review: 'Office Review',
  complete: 'Complete',
  archived: 'Archived'
};

function statusClass(status: string) {
  return status.replaceAll('_', '-');
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function pluralize(count: number, singular: string, plural = singular + 's') {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function Dashboard({
  events,
  vessels,
  currentUserName,
  activity
}: {
  events: DashboardEvent[];
  vessels: DashboardVessel[];
  currentUserName: string;
  activity: string[];
}) {
  const nextEvent = events[0];
  const dueNextThirty = events.filter((event) => event.daysAway <= 30).length;
  const waitingOnVessel = events.filter((event) => event.status === 'waiting_on_vessel').length;
  const officeReview = events.filter((event) => event.status === 'office_review').length;
  const highPriority = events.filter((event) => event.priority === 'high').length;
  const maxVesselEvents = Math.max(1, ...vessels.map((vessel) => vessel.activeEvents));
  const thisWeekCount = events.filter((event) => event.daysAway >= 0 && event.daysAway <= 7).length;

  return (
    <main className="workspace">
      <header className="topbar">
        <article className="next-due-banner">
          <div>
            <span>Next due</span>
            <strong>{nextEvent?.dueDate ?? 'None'}</strong>
          </div>
          <div>
            <h1>{nextEvent?.title ?? 'No compliance events yet'}</h1>
            <p>
              {nextEvent
                ? `${nextEvent.vessel} · ${nextEvent.daysAway} days · ${nextEvent.owner}`
                : 'Create your first event to start tracking deadlines.'}
            </p>
          </div>
          <strong className="due-soon">{nextEvent && nextEvent.daysAway <= 14 ? 'Due soon' : 'Ready'}</strong>
        </article>

        <Link className="secondary-action" href="#">
          <Mail aria-hidden="true" />
          <span>Email Queue</span>
        </Link>
        <Link className="primary-action" href="/events/new">
          <Plus aria-hidden="true" />
          <span>New Event</span>
        </Link>
        <button className="user-pill" type="button" aria-label={`Current user ${currentUserName}`}>
          <span>{initials(currentUserName)}</span>
          <strong>{currentUserName}</strong>
        </button>
      </header>

      <section className="dashboard-grid">
        <div className="main-column">
          <section className="metric-strip" aria-label="Compliance summary">
            <article>
              <span>Next 30 days</span>
              <strong>{dueNextThirty}</strong>
              <p>{pluralize(highPriority, 'high priority item')}</p>
            </article>
            <article>
              <span>Waiting on vessel</span>
              <strong>{waitingOnVessel}</strong>
              <p>Response needed</p>
            </article>
            <article>
              <span>Office review</span>
              <strong>{officeReview}</strong>
              <p>Ready to confirm</p>
            </article>
            <article>
              <span>High priority</span>
              <strong>{highPriority}</strong>
              <p>Open items</p>
            </article>
          </section>

          <section className="panel priority-panel">
            <div className="panel-heading">
              <div>
                <span>Priority queue</span>
                <h2>Upcoming deadlines</h2>
              </div>
              <div className="legend">
                <span><i className="red-dot" />≤7d</span>
                <span><i className="amber-dot" />≤14d</span>
                <span><i className="green-dot" />≤30d</span>
              </div>
            </div>

            <div className="event-list">
              {events.length === 0 ? (
                <div className="empty-state">
                  <h3>No events yet</h3>
                  <p>Add your first compliance deadline so reminders, status tracking, and vessel visibility have real data to work from.</p>
                  <Link className="primary-action" href="/events/new">
                    <Plus aria-hidden="true" />
                    <span>Create first event</span>
                  </Link>
                </div>
              ) : (
                events.map((event) => (
                  <article className="event-row" key={event.id}>
                    <i className={`category-dot ${event.category.toLowerCase()}`} />
                    <div>
                      <h3>{event.title}</h3>
                      <p><span>{event.vessel}</span> {event.owner}</p>
                    </div>
                    <strong className={`status-chip ${statusClass(event.status)}`}>{statusLabels[event.status]}</strong>
                    <span className="due-chip">{event.daysAway} days</span>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="right-column">
          <section className="panel vessel-panel">
            <span>By vessel</span>
            {vessels.length === 0 ? <p className="muted-panel-copy">No vessels added yet.</p> : null}
            {vessels.map((vessel) => (
              <div className="vessel-bar" key={vessel.id}>
                <div>
                  <strong>{vessel.name}</strong>
                  <span>{vessel.activeEvents}</span>
                </div>
                <progress value={vessel.activeEvents} max={maxVesselEvents} style={{ accentColor: vessel.color }} />
              </div>
            ))}
          </section>

          <section className="panel week-panel">
            <span>This week</span>
            <strong>{pluralize(thisWeekCount, 'item')}</strong>
            <p>{thisWeekCount === 0 ? 'No deadlines in the next seven days.' : 'Items due soon are ready for reminders and office follow-up.'}</p>
            <Link href="#">View schedule</Link>
          </section>

          <section className="panel activity-panel">
            <span>Recent activity</span>
            {activity.length === 0 ? <p className="muted-panel-copy">No activity yet.</p> : null}
            <ul>
              {activity.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
