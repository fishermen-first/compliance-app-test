import Link from 'next/link';
import { ItemQueueControls } from '@/components/item-queue-controls';
import { AlertTriangle, Bell, CalendarDays, Check, ChevronRight, Circle, ClipboardCheck, Clock3, Link2, ListTodo, ShieldAlert, UserRound } from 'lucide-react';
import { createWorkspaceTask, dismissWorkspaceTaskReminder, setWorkspaceTaskCompletion, snoozeWorkspaceTaskReminder } from '@/app/actions/tasks';
import { daysUntil, displayState, isWorkQueueItem, itemIsOverdue, itemIsSnoozed, matchesSearch, workspaceToday, shortDate, type ComplianceItem } from '@/lib/compliance';
import { itemVessel } from '@/lib/customer-data';
import { formatTaskReminder, taskReminderIsDue } from '@/lib/task-reminders';

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
  compliance_item_id: string | null;
  reminder_at: string | null;
  reminder_dismissed_at: string | null;
  compliance_items: { id: string; item_name: string } | null;
};

export type DashboardMember = { user_id: string; full_name: string | null; email: string | null };

function personLabel(person: DashboardMember | undefined) {
  return person?.full_name ?? person?.email ?? 'Workspace user';
}

function dateMeta(value: string | null, prefix = 'Due', today?: string) {
  const days = daysUntil(value, today);
  if (days === null) return 'No due date';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return `${prefix} today`;
  if (days === 1) return `${prefix} tomorrow`;
  return `${prefix} ${shortDate(value)}`;
}

function attentionRank(entry: { kind: 'task'; task: DashboardTask } | { kind: 'compliance'; item: ComplianceItem }, today: string) {
  if (entry.kind === 'task') {
    const days = daysUntil(entry.task.due_date, today);
    if (days !== null && days < 0) return 0;
    if (days === 0) return 1;
    if (entry.task.priority === 'high') return 2;
    return 4;
  }
  if (itemIsOverdue(entry.item, today)) return 0;
  if (displayState(entry.item, today) === 'Due') return 1;
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
  showEveryone,
  timeZone,
  manageableItemIds = [],
  fullQueue = false,
  queueView = 'active',
  query = '',
  page = 1
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
  timeZone: string;
  manageableItemIds?: string[];
  fullQueue?: boolean;
  queueView?: string;
  query?: string;
  page?: number;
}) {
  const today = workspaceToday(timeZone);
  const canManage = new Set(manageableItemIds);
  function workHref(updates: { view?: string; owner?: string; page?: string; q?: string } = {}) {
    const params = new URLSearchParams({ owner: updates.owner ?? (showEveryone ? 'all' : 'mine') });
    if ((updates.view ?? queueView) !== 'active') params.set('view', updates.view ?? queueView);
    if (updates.q ?? query) params.set('q', updates.q ?? query);
    if (updates.page) params.set('page', updates.page);
    return `/work?${params}`;
  }
  const openTasks = tasks.filter((task) => task.status === 'open' && !task.archived_at);
  const overdueTasks = openTasks.filter((task) => (daysUntil(task.due_date, today) ?? 0) < 0);
  const overdueCompliance = complianceItems.filter((item) => itemIsOverdue(item, today));
  const dueReminders = openTasks.filter((task) => task.assigned_to === currentUserId && taskReminderIsDue(task));
  const dueSoonCompliance = complianceItems.filter((item) => !itemIsOverdue(item, today) && displayState(item, today) === 'Due');
  const complianceWork = complianceItems.filter((item) => isWorkQueueItem(item, today));
  const membersById = new Map(members.map((member) => [member.user_id, member]));
  const attentionItems = [
    ...(queueView === 'active' ? openTasks : []).filter((task) => matchesSearch(query, [task.title, task.details])).map((task) => ({ kind: 'task' as const, task })),
    ...complianceItems.filter((item) => queueView === 'archived' ? Boolean(item.archived_at) : queueView === 'snoozed' ? itemIsSnoozed(item, today) : queueView === 'awaiting' ? !item.archived_at && item.awaiting_schedule : isWorkQueueItem(item, today)).filter((item) => matchesSearch(query, [item.item_name, itemVessel(item), item.item_number])).map((item) => ({ kind: 'compliance' as const, item }))
  ].sort((a, b) => attentionRank(a, today) - attentionRank(b, today)
    || (a.kind === 'task' ? a.task.due_date ?? '9999-12-31' : a.item.expiration_date ?? '9999-12-31').localeCompare(b.kind === 'task' ? b.task.due_date ?? '9999-12-31' : b.item.expiration_date ?? '9999-12-31'));
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(attentionItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const attention = fullQueue ? attentionItems.slice((currentPage - 1) * pageSize, currentPage * pageSize) : attentionItems.slice(0, 6);

  const upcoming = [
    ...openTasks.flatMap((task) => {
      const days = daysUntil(task.due_date, today);
      return days !== null && days > 0 && days <= 30 ? [{ kind: 'task' as const, date: task.due_date!, title: task.title }] : [];
    }),
    ...complianceItems.filter((item) => !item.archived_at && !item.awaiting_schedule && !['complete', 'discontinued'].includes(item.status)).flatMap((item) => {
      const candidates = [item.start_working_on, item.expiration_date].filter(Boolean) as string[];
      const date = candidates.sort().find((value) => { const days = daysUntil(value, today); return days !== null && days > 0 && days <= 30; });
      return date ? [{ kind: 'compliance' as const, date, title: item.item_name }] : [];
    })
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);

  return (
    <main className="workspace combined-dashboard">
      <header className="cdash-header">
        <div>
          <p className="eyebrow">{fullQueue ? 'Your work' : 'My dashboard'}</p>
          <h1>{fullQueue ? 'All work' : `${greeting}, ${currentUserName.split(' ')[0]}`}</h1>
          <p><strong>{openTasks.length + complianceWork.length}</strong> things need your attention</p>
        </div>
        {canViewEveryone ? (
          <nav className="cdash-scope" aria-label="Dashboard scope">
            <Link className={!showEveryone ? 'active' : ''} href={fullQueue ? workHref({ owner: 'mine' }) : '/?owner=mine'}><UserRound aria-hidden="true" /> Mine</Link>
            <Link className={showEveryone ? 'active' : ''} href={fullQueue ? workHref({ owner: 'all' }) : '/?owner=all'}>Everyone</Link>
          </nav>
        ) : null}
      </header>

      {!fullQueue ? <section className="cdash-stats" aria-label="Work summary">
        <article><span className="danger"><ShieldAlert aria-hidden="true" /></span><div><small>Overdue compliance</small><strong>{overdueCompliance.length}</strong><p>Past expiration</p></div></article>
        <article><span className="warning"><Clock3 aria-hidden="true" /></span><div><small>Due soon</small><strong>{dueSoonCompliance.length}</strong><p>Compliance</p></div></article>
        <article><span className="neutral"><ListTodo aria-hidden="true" /></span><div><small>Open tasks</small><strong>{openTasks.length}</strong><p>{showEveryone ? 'Across the team' : 'Assigned to you'}</p></div></article>
        <article><span className="danger"><AlertTriangle aria-hidden="true" /></span><div><small>Overdue tasks</small><strong>{overdueTasks.length}</strong><p>Past due date</p></div></article>
      </section> : null}

      {dueReminders.length > 0 && !fullQueue ? (
        <section className="cdash-card cdash-reminders" aria-labelledby="dashboard-task-reminders">
          <div className="cdash-card-head"><div><h2 id="dashboard-task-reminders"><Bell aria-hidden="true" /> Task reminders</h2><p>{dueReminders.length} reminder{dueReminders.length === 1 ? '' : 's'} need your attention</p></div><Link href="/tasks">View tasks <ChevronRight aria-hidden="true" /></Link></div>
          <div className="cdash-reminder-list">
            {dueReminders.map((task) => <article key={`dashboard-reminder-${task.id}`}><div><strong>{task.title}</strong><span>Reminded {formatTaskReminder(task.reminder_at, timeZone)}</span></div><div><form action={snoozeWorkspaceTaskReminder}><input type="hidden" name="taskId" value={task.id} /><button type="submit">Snooze</button></form><form action={dismissWorkspaceTaskReminder}><input type="hidden" name="taskId" value={task.id} /><button type="submit">Dismiss</button></form></div></article>)}
          </div>
        </section>
      ) : null}

      {fullQueue ? <>
        <form className="work-search" action="/work"><input name="owner" type="hidden" value={showEveryone ? 'all' : 'mine'} /><input type="hidden" name="view" value={queueView} /><label>Search work<input name="q" defaultValue={query} placeholder="All words, any order" /></label><button type="submit">Search</button>{query ? <Link href={workHref({ q: '' })}>Clear search</Link> : null}</form>
        <nav className="work-scope" aria-label="Queue view">{[['active', 'Active work'], ['snoozed', 'Snoozed'], ['awaiting', 'Awaiting schedule'], ['archived', 'Archived']].map(([value, label]) => <Link className={queueView === value ? 'active' : ''} key={value} href={workHref({ view: value })}>{label}</Link>)}</nav>
      </> : null}
      <section className="cdash-card cdash-attention" aria-labelledby="needs-attention">
        <div className="cdash-card-head">
          <div><h2 id="needs-attention">{fullQueue ? queueView === 'snoozed' ? 'Snoozed work' : queueView === 'archived' ? 'Archived records' : queueView === 'awaiting' ? 'Awaiting schedule' : 'Work queue' : 'Needs attention'}</h2><p>{fullQueue ? `${attentionItems.length} ${attentionItems.length === 1 ? 'record' : 'records'} in this view` : 'Tasks and compliance work ordered by urgency'}</p></div>
          {!fullQueue ? <Link href={workHref()}>View all work <ChevronRight aria-hidden="true" /></Link> : null}
        </div>
        {!fullQueue && complianceItems.some((item) => itemIsSnoozed(item, today)) ? <nav className="work-scope workflow-dashboard-links" aria-label="Deferred work"><Link href={workHref({ view: 'snoozed' })}>Snoozed ({complianceItems.filter((item) => itemIsSnoozed(item, today)).length})</Link></nav> : null}
        <div className="cdash-work-list">
          {attention.length ? attention.map((entry) => entry.kind === 'task' ? (
            <article className="cdash-work-row" key={`task-${entry.task.id}`}>
              <form action={setWorkspaceTaskCompletion}>
                <input type="hidden" name="taskId" value={entry.task.id} /><input type="hidden" name="complete" value="true" />
                <button className="cdash-check" type="submit" aria-label={`Complete ${entry.task.title}`}><Circle aria-hidden="true" /><Check aria-hidden="true" /></button>
              </form>
              <div><span className="cdash-type task">Task</span><h3>{entry.task.title}</h3><p>{dateMeta(entry.task.due_date, 'Due', today)} · {personLabel(membersById.get(entry.task.assigned_to))}{entry.task.compliance_items ? <> · <Link className="cdash-record-link" href={`/items/${entry.task.compliance_items.id}`}><Link2 aria-hidden="true" />{entry.task.compliance_items.item_name}</Link></> : null}</p></div>
              {entry.task.priority === 'high' ? <span className="cdash-priority">High priority</span> : null}
              <Link className="cdash-row-link" href="/tasks" aria-label={`Open task ${entry.task.title}`}><ChevronRight aria-hidden="true" /></Link>
            </article>
          ) : (
            <article className="cdash-work-row" key={`compliance-${entry.item.id}`}>
              <span className={`cdash-status-dot ${itemIsOverdue(entry.item, today) ? 'overdue' : ''}`}><ClipboardCheck aria-hidden="true" /></span>
              <div><span className="cdash-type compliance">Compliance</span><h3>{entry.item.item_name}</h3><p>{dateMeta(entry.item.expiration_date, 'Expires', today)} · {itemVessel(entry.item)} · {entry.item.owner_current ? ownerNames[entry.item.owner_current] ?? entry.item.owner_current : 'Unassigned'}</p>{itemIsSnoozed(entry.item, today) ? <small className="workflow-row-note">Snoozed until {entry.item.snoozed_until} · {entry.item.snooze_reason || 'No reason added'}</small> : entry.item.archived_at ? <small className="workflow-row-note">{entry.item.archive_reason}</small> : null}</div>
              <div className="workflow-row-actions"><span className={`cdash-state ${itemIsOverdue(entry.item, today) ? 'overdue' : ''}`}>{entry.item.archived_at ? 'Archived' : itemIsOverdue(entry.item, today) ? 'Overdue' : displayState(entry.item, today)}</span>
                {canManage.has(entry.item.id) ? <ItemQueueControls returnTo={fullQueue ? workHref({ page: String(currentPage) }) : showEveryone ? '/?owner=all' : '/?owner=mine'} itemId={entry.item.id} itemName={entry.item.item_name} archivedAt={entry.item.archived_at} snoozedUntil={entry.item.snoozed_until} snoozeReason={entry.item.snooze_reason} isOpenItem={!['complete', 'discontinued'].includes(entry.item.status)} today={today} /> : null}
              </div>
              <Link className="cdash-row-link" href={`/items/${entry.item.id}`} aria-label={`Open compliance record ${entry.item.item_name}`}><ChevronRight aria-hidden="true" /></Link>
            </article>
          )) : <div className="cdash-empty"><Check aria-hidden="true" /><strong>{fullQueue ? 'No work in this view' : 'You’re all caught up'}</strong><p>{fullQueue ? 'Try another view or search.' : 'No tasks or compliance records need attention.'}</p></div>}
        </div>
      </section>

      {fullQueue && pageCount > 1 ? <nav className="work-scope" aria-label="Work pages">{currentPage > 1 ? <Link href={workHref({ page: String(currentPage - 1) })}>Previous</Link> : null}<span>Page {currentPage} of {pageCount}</span>{currentPage < pageCount ? <Link href={workHref({ page: String(currentPage + 1) })}>Next</Link> : null}</nav> : null}
      {!fullQueue ? <div className="cdash-lower">
        <section className="cdash-card" aria-labelledby="coming-up">
          <div className="cdash-card-head"><div><h2 id="coming-up">Coming up</h2><p>Next 30 days</p></div><Link href="/calendar">View schedule <ChevronRight aria-hidden="true" /></Link></div>
          <div className="cdash-upcoming">
            {upcoming.length ? upcoming.map((entry, index) => <article key={`${entry.kind}-${entry.title}-${entry.date}-${index}`}><time dateTime={entry.date}><strong>{shortDate(entry.date).split(' ')[1]}</strong><span>{shortDate(entry.date).split(' ')[0]}</span></time><span className={`cdash-type ${entry.kind}`}>{entry.kind}</span><div><h3>{entry.title}</h3><p>{dateMeta(entry.date, 'Due', today)}</p></div></article>) : <div className="cdash-empty compact"><CalendarDays aria-hidden="true" /><p>Nothing scheduled in the next 30 days.</p></div>}
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
      </div> : null}

      <nav className="cdash-links" id="dashboard-links" aria-label="All work links"><Link href="/tasks"><ListTodo aria-hidden="true" /> View all tasks <ChevronRight aria-hidden="true" /></Link><Link href="/items"><ClipboardCheck aria-hidden="true" /> View all compliance records <ChevronRight aria-hidden="true" /></Link></nav>
    </main>
  );
}
