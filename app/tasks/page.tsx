import Link from 'next/link';
import { Archive, CalendarDays, Check, ChevronRight, Circle, ListTodo, Plus, UserRound } from 'lucide-react';
import {
  createWorkspaceTask,
  setWorkspaceTaskArchived,
  setWorkspaceTaskCompletion,
  updateWorkspaceTask
} from '@/app/actions/tasks';
import { AppSidebar } from '@/components/app-sidebar';
import { displayState, itemIsOverdue } from '@/lib/compliance';
import { getCustomerContext, getCustomerItems } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type TaskPageProps = {
  searchParams?: { view?: string; status?: string };
};

type ProfileRelation = { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null;

type WorkspaceTask = {
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
  assignee: ProfileRelation;
};

type WorkspaceMember = {
  user_id: string;
  profiles: ProfileRelation;
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function personLabel(profile: ProfileRelation) {
  const person = relation(profile);
  return person?.full_name ?? person?.email ?? 'Workspace user';
}

function taskDate(value: string | null) {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function taskHref(view: string, status: string) {
  const params = new URLSearchParams();
  if (view !== 'mine') params.set('view', view);
  if (status !== 'open') params.set('status', status);
  const query = params.toString();
  return query ? `/tasks?${query}` : '/tasks';
}

function TaskEditor({ task, members, canManageAll, currentUserId }: {
  task: WorkspaceTask;
  members: WorkspaceMember[];
  canManageAll: boolean;
  currentUserId: string;
}) {
  return (
    <details className="task-details">
      <summary aria-label={`Edit ${task.title}`}><ChevronRight aria-hidden="true" /></summary>
      <div className="task-detail-card">
        <form action={updateWorkspaceTask} className="task-edit-form">
          <input type="hidden" name="taskId" value={task.id} />
          {!canManageAll ? <input type="hidden" name="assignedTo" value={currentUserId} /> : null}
          <label className="task-field task-title-field">
            <span>Task</span>
            <input name="title" defaultValue={task.title} maxLength={240} required />
          </label>
          <label className="task-field task-full-field">
            <span>Details</span>
            <textarea name="details" defaultValue={task.details ?? ''} maxLength={5000} rows={4} placeholder="Add details" />
          </label>
          <label className="task-field">
            <span>Due date</span>
            <input type="date" name="dueDate" defaultValue={task.due_date ?? ''} />
          </label>
          <label className="task-field">
            <span>Priority</span>
            <select name="priority" defaultValue={task.priority}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          {canManageAll ? (
            <label className="task-field task-full-field">
              <span>Assigned to</span>
              <select name="assignedTo" defaultValue={task.assigned_to}>
                {members.map((member) => <option value={member.user_id} key={member.user_id}>{personLabel(member.profiles)}</option>)}
              </select>
            </label>
          ) : null}
          <div className="task-edit-actions">
            <button className="secondary-action" type="submit">Save changes</button>
          </div>
        </form>
        <form action={setWorkspaceTaskArchived}>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="archive" value={task.archived_at ? 'false' : 'true'} />
          <button className="task-archive-button" type="submit"><Archive aria-hidden="true" />{task.archived_at ? 'Restore task' : 'Archive task'}</button>
        </form>
      </div>
    </details>
  );
}

export default async function TasksPage({ searchParams }: TaskPageProps) {
  const { membership, company, profile, user, supabase } = await getCustomerContext();
  const canManageAll = membership.role === 'owner' || membership.role === 'office_admin';
  const view = canManageAll && searchParams?.view === 'all' ? 'all' : 'mine';
  const allowedStatuses = new Set(['open', 'completed', 'archived']);
  const status = allowedStatuses.has(searchParams?.status ?? '') ? searchParams?.status as 'open' | 'completed' | 'archived' : 'open';

  let query = (supabase as any)
    .from('workspace_tasks')
    .select('id, title, details, assigned_to, status, priority, due_date, completed_at, archived_at, created_at, assignee:profiles!workspace_tasks_assigned_to_fkey(full_name, email)')
    .eq('company_id', membership.company_id);

  if (view === 'mine') query = query.eq('assigned_to', user.id);
  if (status === 'archived') query = query.not('archived_at', 'is', null);
  else query = query.is('archived_at', null).eq('status', status);

  const [{ data: taskRows, error: taskError }, { data: memberRows }, complianceItems] = await Promise.all([
    query.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }),
    supabase
      .from('company_memberships')
      .select('user_id, profiles(full_name, email)')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: true }),
    getCustomerItems(membership.company_id)
  ]);

  if (taskError) throw new Error(taskError.message);

  const tasks = (taskRows ?? []) as WorkspaceTask[];
  const members = (memberRows ?? []) as unknown as WorkspaceMember[];
  const openCount = tasks.filter((task) => task.status === 'open' && !task.archived_at).length;
  const overdueCount = tasks.filter((task) => task.status === 'open' && task.due_date && task.due_date < todayIso() && !task.archived_at).length;
  const dueCount = complianceItems.filter((item) => !['complete', 'discontinued'].includes(item.status) && (displayState(item) === 'Due' || itemIsOverdue(item))).length;

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={profile?.full_name ?? user.email}
        userEmail={user.email}
        dueCount={dueCount}
        activePath="/tasks"
      />
      <main className="workspace tasks-workspace">
        <header className="tasks-header">
          <div>
            <p className="eyebrow">Workspace tasks</p>
            <h1>{view === 'all' ? 'All tasks' : 'My tasks'}</h1>
            <p>Keep everyday work separate from recurring compliance records.</p>
          </div>
          <div className="task-summary" aria-label="Task summary">
            <span><strong>{openCount}</strong> open</span>
            <span className={overdueCount ? 'is-overdue' : ''}><strong>{overdueCount}</strong> overdue</span>
          </div>
        </header>

        <section className="task-surface" aria-label="Tasks">
          <nav className="task-tabs" aria-label="Task views">
            <div>
              <Link className={status === 'open' ? 'active' : ''} href={taskHref(view, 'open')}>Open</Link>
              <Link className={status === 'completed' ? 'active' : ''} href={taskHref(view, 'completed')}>Completed</Link>
              <Link className={status === 'archived' ? 'active' : ''} href={taskHref(view, 'archived')}>Archived</Link>
            </div>
            {canManageAll ? (
              <div className="task-scope-tabs">
                <Link className={view === 'mine' ? 'active' : ''} href={taskHref('mine', status)}><UserRound aria-hidden="true" /> Mine</Link>
                <Link className={view === 'all' ? 'active' : ''} href={taskHref('all', status)}><ListTodo aria-hidden="true" /> Everyone</Link>
              </div>
            ) : null}
          </nav>

          {status === 'open' ? (
            <details className="task-quick-add">
              <summary><Plus aria-hidden="true" /><span>Add a task</span></summary>
              <form action={createWorkspaceTask} className="task-add-form">
                {!canManageAll ? <input type="hidden" name="assignedTo" value={user.id} /> : null}
                <label className="task-field task-title-field">
                  <span>Task</span>
                  <input name="title" maxLength={240} placeholder="What needs to be done?" autoFocus required />
                </label>
                <label className="task-field task-full-field">
                  <span>Details</span>
                  <textarea name="details" maxLength={5000} rows={3} placeholder="Add details (optional)" />
                </label>
                <label className="task-field">
                  <span>Due date</span>
                  <input type="date" name="dueDate" />
                </label>
                <label className="task-field">
                  <span>Priority</span>
                  <select name="priority" defaultValue="normal">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
                {canManageAll ? (
                  <label className="task-field task-full-field">
                    <span>Assigned to</span>
                    <select name="assignedTo" defaultValue={user.id}>
                      {members.map((member) => <option value={member.user_id} key={member.user_id}>{personLabel(member.profiles)}</option>)}
                    </select>
                  </label>
                ) : null}
                <div className="task-add-actions"><button className="primary-action" type="submit">Add task</button></div>
              </form>
            </details>
          ) : null}

          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="task-empty">
                <span><Check aria-hidden="true" /></span>
                <h2>{status === 'open' ? 'You’re all caught up' : `No ${status} tasks`}</h2>
                <p>{status === 'open' ? 'Add a task when something new comes up.' : 'Tasks will appear here when their status changes.'}</p>
              </div>
            ) : tasks.map((task) => {
              const overdue = task.status === 'open' && Boolean(task.due_date && task.due_date < todayIso());
              return (
                <article className={`task-row${task.status === 'completed' ? ' is-complete' : ''}`} key={task.id}>
                  <form action={setWorkspaceTaskCompletion} className="task-check-form">
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="complete" value={task.status === 'completed' ? 'false' : 'true'} />
                    <button type="submit" aria-label={task.status === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}>
                      {task.status === 'completed' ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                    </button>
                  </form>
                  <div className="task-row-main">
                    <strong>{task.title}</strong>
                    {task.details ? <p>{task.details}</p> : null}
                    <div className="task-meta">
                      <span className={overdue ? 'task-due is-overdue' : 'task-due'}><CalendarDays aria-hidden="true" />{taskDate(task.due_date)}</span>
                      {canManageAll || view === 'all' ? <span><UserRound aria-hidden="true" />{personLabel(task.assignee)}</span> : null}
                      {task.priority !== 'normal' ? <span className={`task-priority ${task.priority}`}>{task.priority} priority</span> : null}
                    </div>
                  </div>
                  <TaskEditor task={task} members={members} canManageAll={canManageAll} currentUserId={user.id} />
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
