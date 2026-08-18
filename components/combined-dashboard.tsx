import Link from 'next/link';
import { AlertTriangle, CalendarDays, Check, ChevronRight, Circle, ClipboardCheck, Clock3, ListTodo, ShieldAlert, UserRound } from 'lucide-react';
import { createWorkspaceTask, setWorkspaceTaskCompletion } from '@/app/actions/tasks';
import { daysUntil, displayState, isWorkQueueItem, itemIsOverdue, shortDate, type ComplianceItem } from '@/lib/compliance';
import { itemVessel } from '@/lib/customer-data';

export type DashboardTask = {
  id: string;
  title: string;
  details: string | null;
  assigned_to: string;
  status: 'open' | 'completed';
  priority: 'low' | 'normal' | 'high';
  due_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export type DashboardMember = { user_id: string; full_name: string | null; email: string | null };

function personLabel(person: DashboardMember | undefined) {
  return person?.full_name ?? person?.email ?? 'Workspace user';
}

function dateMeta(value: string | null, prefix = 'Due') {
  const days = daysUntil(value);
  if (days === null) return 'No due date';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return `${prefix} today`;
  if (days === 1) return `${prefix} tomorrow`;
  return `${prefix} ${shortDate(value)}`;
}

function attentionRank(entry: { kind: 'task'; task: DashboardTask } | { kind: 'compliance'; item: ComplianceItem }) {
  if (entry.kind === 'task') {
    const days = daysUntil(entry.task.due_date);
    if (days !== null && days < 0) return 0;
    if (days === 0) return 1;
    if (entry.task.priority === 'high') return 2;
    return 4;
  }
  if (itemIsOverdue(entry.item)) return 0;
  if (displayState(entry.item) === 'Due') return 1;
  return 3;
}

export function CombinedDashboard({
  greeting,
  currentUserId,
  currentUserName,
  complianceItems,
  tasks,
  members,
  ownerNames,
  canViewEveryone,
  showEveryone
}: {
  greeting: string;
  currentUserId: string;
  currentUserName: string;
  complianceItems: ComplianceItem[];
  tasks: DashboardTask[];
  members: DashboardMember[];
  ownerNames: Record<string, string>;
  canViewEveryone: boolean;
  showEveryone: boolean;
}) {
  const openTasks = tasks.filter((task) => task.status === 'open' && !task.archived_at);
  const overdueTasks = openTasks.filter((task) => (daysUntil(task.due_date) ?? 0) < 0);
  const overdueCompliance = complianceItems.filter(itemIsOverdue);
  const dueSoonCompliance = complianceItems.filter((item) => !itemIsOverdue(item) && displayState(item) === 'Due');
  const complianceWork = complianceItems.filter(isWorkQueueItem);
  const membersById = new Map(members.map((member) => [member.user_id, member]));
  const attention = [
    ...openTasks.map((task) => ({ kind: 'task' as const, task })),
    ...complianceWork.map((item) => ({ kind: 'compliance' as const, item }))
  ].sort((a, b) => attentionRank(a) - attentionRank(b)).slice(0, 6);

  const upcoming = [
    ...openTasks.flatMap((task) => {
      const days = daysUntil(task.due_date);
      return days !== null && days > 0 && days <= 30 ? [{ kind: 'task' as const, date: task.due_date!, title: task.title }] : [];
    }),
    ...complianceItems.flatMap((item) => {
      const candidates = [item.start_working_on, item.expiration_date].filter(Boolean) as string[];
      const date = candidates.sort().find((value) => { const days = daysUntil(value); return days !== null && days > 0 && days <= 30; });
      return date ? [{ kind: 'compliance' as const, date, title: item.item_name }] : [];
    })
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);

  return (
    <main className="workspace combined-dashboard">
      <header className="cdash-header">
        <div>
          <p className="eyebrow">My dashboard</p>
          <h1>{greeting}, {currentUserName.split(' ')[0]}</h1>
          <p><strong>{openTasks.length + complianceWork.length}</strong> things need your attention</p>
        </div>
        {canViewEveryone ? (
          <nav className="cdash-scope" aria-label="Dashboard scope">
            <Link className={!showEveryone ? 'active' : ''} href="/"><UserRound aria-hidden="true" /> Mine</Link>
            <Link className={showEveryone ? 'active' : ''} href="/?owner=all">Everyone</Link>
          </nav>
        ) : null}
      </header>

      <section className="cdash-stats" aria-label="Work summary">
        <article><span className="danger"><ShieldAlert aria-hidden="true" /></span><div><small>Overdue compliance</small><strong>{overdueCompliance.length}</strong><p>Past expiration</p></div></article>
        <article><span className="warning"><Clock3 aria-hidden="true" /></span><div><small>Due soon</small><strong>{dueSoonCompliance.length}</strong><p>Compliance</p></div></article>
        <article><span className="neutral"><ListTodo aria-hidden="true" /></span><div><small>Open tasks</small><strong>{openTasks.length}</strong><p>{showEveryone ? 'Across the team' : 'Assigned to you'}</p></div></article>
        <article><span className="danger"><AlertTriangle aria-hidden="true" /></span><div><small>Overdue tasks</small><strong>{overdueTasks.length}</strong><p>Past due date</p></div></article>
      </section>

      <section className="cdash-card cdash-attention" aria-labelledby="needs-attention">
        <div className="cdash-card-head">
          <div><h2 id="needs-attention">Needs attention</h2><p>Tasks and compliance work ordered by urgency</p></div>
          <a href="#dashboard-links">View all work <ChevronRight aria-hidden="true" /></a>
        </div>
        <div className="cdash-work-list">
          {attention.length ? attention.map((entry) => entry.kind === 'task' ? (
            <article className="cdash-work-row" key={`task-${entry.task.id}`}>
              <form action={setWorkspaceTaskCompletion}>
                <input type="hidden" name="taskId" value={entry.task.id} /><input type="hidden" name="complete" value="true" />
                <button className="cdash-check" type="submit" aria-label={`Complete ${entry.task.title}`}><Circle aria-hidden="true" /><Check aria-hidden="true" /></button>
              </form>
              <div><span className="cdash-type task">Task</span><h3>{entry.task.title}</h3><p>{dateMeta(entry.task.due_date)} · {personLabel(membersById.get(entry.task.assigned_to))}</p></div>
              {entry.task.priority === 'high' ? <span className="cdash-priority">High priority</span> : null}
              <Link className="cdash-row-link" href="/tasks" aria-label={`Open task ${entry.task.title}`}><ChevronRight aria-hidden="true" /></Link>
            </article>
          ) : (
            <article className="cdash-work-row" key={`compliance-${entry.item.id}`}>
              <span className={`cdash-status-dot ${itemIsOverdue(entry.item) ? 'overdue' : ''}`}><ClipboardCheck aria-hidden="true" /></span>
              <div><span className="cdash-type compliance">Compliance</span><h3>{entry.item.item_name}</h3><p>{dateMeta(entry.item.expiration_date, 'Expires')} · {itemVessel(entry.item)} · {entry.item.owner_current ? ownerNames[entry.item.owner_current] ?? entry.item.owner_current : 'Unassigned'}</p></div>
              <span className={`cdash-state ${itemIsOverdue(entry.item) ? 'overdue' : ''}`}>{itemIsOverdue(entry.item) ? 'Overdue' : displayState(entry.item)}</span>
              <Link className="cdash-row-link" href={`/items/${entry.item.id}`} aria-label={`Open compliance record ${entry.item.item_name}`}><ChevronRight aria-hidden="true" /></Link>
            </article>
          )) : <div className="cdash-empty"><Check aria-hidden="true" /><strong>You’re all caught up</strong><p>No tasks or compliance records need attention.</p></div>}
        </div>
      </section>

      <div className="cdash-lower">
        <section className="cdash-card" aria-labelledby="coming-up">
          <div className="cdash-card-head"><div><h2 id="coming-up">Coming up</h2><p>Next 30 days</p></div><Link href="/calendar">View schedule <ChevronRight aria-hidden="true" /></Link></div>
          <div className="cdash-upcoming">
            {upcoming.length ? upcoming.map((entry, index) => <article key={`${entry.kind}-${entry.title}-${entry.date}-${index}`}><time dateTime={entry.date}><strong>{shortDate(entry.date).split(' ')[1]}</strong><span>{shortDate(entry.date).split(' ')[0]}</span></time><span className={`cdash-type ${entry.kind}`}>{entry.kind}</span><div><h3>{entry.title}</h3><p>{dateMeta(entry.date)}</p></div></article>) : <div className="cdash-empty compact"><CalendarDays aria-hidden="true" /><p>Nothing scheduled in the next 30 days.</p></div>}
          </div>
        </section>

        <section className="cdash-card cdash-quick-add" aria-labelledby="quick-add-task">
          <div className="cdash-card-head"><div><h2 id="quick-add-task">Quick add task</h2><p>Add a to-do without leaving your dashboard</p></div></div>
          <form action={createWorkspaceTask}>
            {!canViewEveryone ? <input type="hidden" name="assignedTo" value={currentUserId} /> : null}
            <label><span>Task</span><input name="title" maxLength={240} placeholder="What needs to get done?" required /></label>
            <div className="cdash-form-row">
              <label><span>Due date</span><input type="date" name="dueDate" /></label>
              <label><span>Priority</span><select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
            </div>
            {canViewEveryone ? <label><span>Assigned to</span><select name="assignedTo" defaultValue={currentUserId}>{members.map((member) => <option value={member.user_id} key={member.user_id}>{personLabel(member)}</option>)}</select></label> : null}
            <button type="submit">Add task</button>
          </form>
        </section>
      </div>

      <nav className="cdash-links" id="dashboard-links" aria-label="All work links"><Link href="/tasks"><ListTodo aria-hidden="true" /> View all tasks <ChevronRight aria-hidden="true" /></Link><Link href="/items"><ClipboardCheck aria-hidden="true" /> View all compliance records <ChevronRight aria-hidden="true" /></Link></nav>
    </main>
  );
}
