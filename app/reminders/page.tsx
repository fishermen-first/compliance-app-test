import { redirect } from 'next/navigation';
import { queueTodaysReminders, sendQueuedReminders } from '@/app/actions/reminders';
import { AppSidebar } from '@/components/app-sidebar';
import { accessRoleLabel } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function RemindersPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect('/');

  const canManageReminders = membership.role === 'owner';
  const [{ data: company }, { data: profile }, { data: logs }, { data: rules }, { data: isAppAdmin }] = await Promise.all([
    supabase.from('companies').select('name').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle(),
    canManageReminders
      ? supabase
          .from('reminder_send_log')
          .select('recipient_email, subject, status, scheduled_for, sent_at, failure_reason')
          .eq('company_id', membership.company_id)
          .order('scheduled_for', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    canManageReminders
      ? supabase
          .from('compliance_item_reminder_rules')
          .select('id')
          .eq('company_id', membership.company_id)
      : Promise.resolve({ data: [] }),
    supabase.rpc('is_app_admin')
  ]);

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={profile?.full_name ?? userData.user.email}
        userEmail={userData.user.email}
        isAppAdmin={Boolean(isAppAdmin)}
        activePath="/reminders"
      />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Reminders</p>
            <h1>Email reminder queue</h1>
            <p>Queue due owner and external-copy reminders, then send scheduled emails through Resend.</p>
          </div>
          {canManageReminders ? (
            <div className="header-action-row">
              <form action={queueTodaysReminders}>
                <button className="secondary-action" type="submit">Queue today</button>
              </form>
              <form action={sendQueuedReminders}>
                <button className="primary-action" type="submit">Send queued</button>
              </form>
            </div>
          ) : null}
        </header>

        {!canManageReminders ? (
          <section className="owner-notice-panel setup-warning-panel">
            <strong>Read only</strong>
            <span>Workspace owners manage reminder scheduling for this workspace.</span>
          </section>
        ) : null}

        <section className="metric-strip" aria-label="Reminder summary">
          <article>
            <span>Rules</span>
            <strong>{rules?.length ?? 0}</strong>
            <p>Configured reminder triggers</p>
          </article>
          <article>
            <span>Queued/Scheduled</span>
            <strong>{(logs ?? []).filter((log: any) => ['scheduled', 'queued'].includes(log.status)).length}</strong>
            <p>Waiting to send</p>
          </article>
          <article>
            <span>Sent</span>
            <strong>{(logs ?? []).filter((log: any) => log.status === 'sent').length}</strong>
            <p>Provider confirmed</p>
          </article>
          <article>
            <span>Failed</span>
            <strong>{(logs ?? []).filter((log: any) => log.status === 'failed').length}</strong>
            <p>Needs review</p>
          </article>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <span>{logs?.length ?? 0} recent records</span>
              <h2>Reminder send log</h2>
            </div>
          </div>
          <div className="work-table reminder-table" role="table" aria-label="Reminder send log">
            <div className="work-table-row work-table-head" role="row">
              <span>Recipient</span>
              <span>Subject</span>
              <span>Status</span>
              <span>Scheduled</span>
              <span>Sent</span>
              <span>Failure</span>
            </div>
            {(logs ?? []).length === 0 ? <div className="empty-state"><h3>No reminders queued yet</h3><p>Queue today after importing data and adding recipients.</p></div> : null}
            {(logs ?? []).map((log: any) => (
              <div className="work-table-row" role="row" key={`${log.recipient_email}-${log.scheduled_for}-${log.subject}`}>
                <span>{log.recipient_email}</span>
                <strong>{log.subject}</strong>
                <span>{titleCase(log.status)}</span>
                <span>{new Date(log.scheduled_for).toLocaleString()}</span>
                <span>{log.sent_at ? new Date(log.sent_at).toLocaleString() : '-'}</span>
                <span>{log.failure_reason ?? '-'}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
