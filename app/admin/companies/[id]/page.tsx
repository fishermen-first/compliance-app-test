import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, AlertTriangle, ClipboardList, MailWarning, Ship, Users } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { accessRoleLabel } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type CompanyAdminPageProps = {
  params: { id: string };
};

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function isOpenItem(status: string) {
  return status !== 'complete' && status !== 'discontinued';
}

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function profileName(row: any) {
  const profile = relation(row.profiles);
  return profile?.full_name ?? profile?.email ?? 'Unknown user';
}

function profileEmail(row: any) {
  return relation(row.profiles)?.email ?? 'Profile pending';
}

function vesselName(row: any) {
  return relation(row.vessels)?.name ?? 'Company-wide';
}

export default async function CompanyAdminPage({ params }: CompanyAdminPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) {
    redirect('/');
  }

  const companyId = params.id;
  const [
    { data: company },
    { data: memberships },
    { data: invitations },
    { data: vessels },
    { data: items },
    { data: reminderLogs },
    { data: emailQueue },
    { data: appAdmins }
  ] = await Promise.all([
    supabase.from('companies').select('id, name, timezone, created_at').eq('id', companyId).maybeSingle(),
    supabase
      .from('company_memberships')
      .select('company_id, user_id, role, created_at, profiles(email, full_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase.from('vessels').select('id, name, active').eq('company_id', companyId).order('name'),
    supabase
      .from('compliance_items')
      .select('id, item_name, owner_current, expiration_date, start_working_on, status, compliance_area, vessels(name)')
      .eq('company_id', companyId)
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .limit(250),
    supabase
      .from('reminder_send_log')
      .select('recipient_email, subject, status, scheduled_for, sent_at, failure_reason')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('email_queue')
      .select('recipient_email, subject, status, scheduled_for, failure_reason')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('app_admins').select('email')
  ]);

  if (!company) {
    notFound();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const itemRows = items ?? [];
  const openItems = itemRows.filter((item) => isOpenItem(item.status));
  const overdueItems = openItems.filter((item) => item.expiration_date && new Date(item.expiration_date) < today);
  const emailRows = [...(reminderLogs ?? []), ...(emailQueue ?? [])];
  const failedEmails = emailRows.filter((row) => row.status === 'failed');
  const pendingInvites = (invitations ?? []).filter((invite) => !invite.accepted_at);
  const appAdminEmailSet = new Set((appAdmins ?? []).map((admin) => admin.email.toLowerCase()));
  const customerMemberships = (memberships ?? []).filter((membership) => !appAdminEmailSet.has(profileEmail(membership).toLowerCase()));

  return (
    <main className="admin-console admin-detail-console">
      <aside className="admin-rail">
        <Link className="admin-back-link" href="/admin">
          <ArrowLeft aria-hidden="true" />
          Admin console
        </Link>
        <div className="admin-rail-footer">
          <span>Support view</span>
          <strong>{company.name}</strong>
          <form action={signOut}>
            <button className="admin-logout" type="submit">Log out</button>
          </form>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Customer support view</p>
            <h1>{company.name}</h1>
          </div>
          <span className="admin-subtle-pill">{company.timezone}</span>
        </header>

        <section className="admin-stat-grid" aria-label="Company summary">
          <article>
            <Users aria-hidden="true" />
            <span>Customer users</span>
            <strong>{customerMemberships.length}</strong>
            <p>{pendingInvites.length} pending invites</p>
          </article>
          <article>
            <Ship aria-hidden="true" />
            <span>Active vessels</span>
            <strong>{(vessels ?? []).filter((vessel) => vessel.active).length}</strong>
            <p>{(vessels ?? []).length} total vessel records</p>
          </article>
          <article>
            <ClipboardList aria-hidden="true" />
            <span>Open items</span>
            <strong>{openItems.length}</strong>
            <p>{itemRows.length} total imported items</p>
          </article>
          <article>
            <MailWarning aria-hidden="true" />
            <span>Needs review</span>
            <strong>{overdueItems.length + failedEmails.length}</strong>
            <p>{overdueItems.length} overdue · {failedEmails.length} failed emails</p>
          </article>
        </section>

        <section className="admin-grid-main">
          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Compliance items</span>
                <h2>Open work</h2>
              </div>
            </div>
            <div className="support-item-table">
              {openItems.slice(0, 18).map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.item_name}</strong>
                    <span>{vesselName(item)} · {item.compliance_area ?? 'Other'} · {item.owner_current ?? 'Unassigned'}</span>
                  </div>
                  <span>{formatDate(item.start_working_on)}</span>
                  <span>{formatDate(item.expiration_date)}</span>
                  <span className={item.expiration_date && new Date(item.expiration_date) < today ? 'risk-chip risk-chip-hot' : 'risk-chip'}>
                    {item.status.replaceAll('_', ' ')}
                  </span>
                </article>
              ))}
              {openItems.length === 0 ? <p className="muted-panel-copy">No open items.</p> : null}
            </div>
          </section>

          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Customer access</span>
                <h2>Users and invites</h2>
              </div>
            </div>
            <div className="support-access-list">
              {customerMemberships.map((membership) => (
                <article key={`${membership.user_id}-${membership.company_id}`}>
                  <div>
                    <strong>{profileName(membership)}</strong>
                    <span>{profileEmail(membership)}</span>
                  </div>
                  <span>{accessRoleLabel(membership.role)}</span>
                </article>
              ))}
              {pendingInvites.map((invite) => (
                <article key={`${invite.email}-${invite.created_at}`}>
                  <div>
                    <strong>{invite.email}</strong>
                    <span>Invite pending · {formatDate(invite.created_at)}</span>
                  </div>
                  <span>{accessRoleLabel(invite.role)}</span>
                </article>
              ))}
              {customerMemberships.length === 0 && pendingInvites.length === 0 ? <p className="muted-panel-copy">No users or pending invites.</p> : null}
            </div>
          </section>
        </section>

        <section className="admin-grid-secondary">
          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Vessels</span>
                <h2>Fleet records</h2>
              </div>
            </div>
            <div className="support-vessel-list">
              {(vessels ?? []).map((vessel) => (
                <article key={vessel.id}>
                  <strong>{vessel.name}</strong>
                  <span className={vessel.active ? 'risk-chip' : 'risk-chip risk-chip-muted'}>{vessel.active ? 'Active' : 'Inactive'}</span>
                </article>
              ))}
              {(vessels ?? []).length === 0 ? <p className="muted-panel-copy">No vessel records.</p> : null}
            </div>
          </section>

          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Email health</span>
                <h2>Recent reminder activity</h2>
              </div>
            </div>
            <div className="support-email-list">
              {emailRows.slice(0, 8).map((row) => (
                <article key={`${row.recipient_email}-${row.scheduled_for}-${row.subject}`}>
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <strong>{row.subject}</strong>
                    <span>{row.recipient_email} · {row.status} · {formatDate(row.scheduled_for)}</span>
                  </div>
                </article>
              ))}
              {emailRows.length === 0 ? <p className="muted-panel-copy">No reminder activity yet.</p> : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
