import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ClipboardList,
  MailWarning,
  ShieldCheck,
  UserPlus,
  Users
} from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { createInvitation } from '@/app/actions/invitations';
import { accessRoleLabel } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type AdminPageProps = {
  searchParams?: { message?: string };
};

type CompanyHealth = {
  id: string;
  name: string;
  vessels: number;
  customerUsers: number;
  openItems: number;
  overdueItems: number;
  dueSoonItems: number;
  pendingInvites: number;
  failedEmails: number;
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

function companyName(row: any) {
  return relation(row.companies)?.name ?? 'Unknown company';
}

function profileName(row: any) {
  const profile = relation(row.profiles);
  return profile?.full_name ?? profile?.email ?? 'Unknown user';
}

function profileEmail(row: any) {
  return relation(row.profiles)?.email ?? 'Profile pending';
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) {
    redirect('/');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoWeeksFromNow = new Date(today);
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

  const [
    { data: companies },
    { data: memberships },
    { data: invitations },
    { data: appAdmins },
    { data: vessels },
    { data: items },
    { data: reminderLogs },
    { data: emailQueue }
  ] = await Promise.all([
    supabase.from('companies').select('id, name, timezone, created_at').order('name'),
    supabase
      .from('company_memberships')
      .select('company_id, user_id, role, created_at, profiles(email, full_name), companies(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at, company_id, companies(name)')
      .order('created_at', { ascending: false })
      .limit(40),
    supabase.from('app_admins').select('email, created_at').order('created_at', { ascending: false }),
    supabase.from('vessels').select('id, company_id, active'),
    supabase
      .from('compliance_items')
      .select('id, company_id, item_name, owner_current, expiration_date, start_working_on, status, companies(name), vessels(name)')
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .limit(400),
    supabase
      .from('reminder_send_log')
      .select('company_id, recipient_email, subject, status, scheduled_for, sent_at, failure_reason, companies(name)')
      .order('created_at', { ascending: false })
      .limit(75),
    supabase
      .from('email_queue')
      .select('company_id, recipient_email, subject, status, scheduled_for, failure_reason, companies(name)')
      .order('created_at', { ascending: false })
      .limit(75)
  ]);

  const companyRows = companies ?? [];
  const membershipRows = memberships ?? [];
  const invitationRows = invitations ?? [];
  const appAdminRows = appAdmins ?? [];
  const vesselRows = vessels ?? [];
  const itemRows = items ?? [];
  const appAdminEmailSet = new Set(appAdminRows.map((admin) => admin.email.toLowerCase()));
  const customerMembershipRows = membershipRows.filter((membership) => !appAdminEmailSet.has(profileEmail(membership).toLowerCase()));
  const message = searchParams?.message;
  const pendingInvites = invitationRows.filter((invite) => !invite.accepted_at);
  const openItems = itemRows.filter((item) => isOpenItem(item.status));
  const overdueItems = openItems.filter((item) => item.expiration_date && new Date(item.expiration_date) < today);
  const dueSoonItems = openItems.filter((item) => {
    if (!item.expiration_date) return false;
    const date = new Date(item.expiration_date);
    return date >= today && date <= twoWeeksFromNow;
  });
  const emailRows = [...(reminderLogs ?? []), ...(emailQueue ?? [])];
  const failedEmails = emailRows.filter((row) => row.status === 'failed');
  const queuedEmails = emailRows.filter((row) => ['queued', 'scheduled'].includes(row.status));

  const companyHealth: CompanyHealth[] = companyRows.map((company) => {
    const companyItems = openItems.filter((item) => item.company_id === company.id);
    return {
      id: company.id,
      name: company.name,
      vessels: vesselRows.filter((vessel) => vessel.company_id === company.id && vessel.active).length,
      customerUsers: customerMembershipRows.filter((membership) => membership.company_id === company.id).length,
      openItems: companyItems.length,
      overdueItems: companyItems.filter((item) => item.expiration_date && new Date(item.expiration_date) < today).length,
      dueSoonItems: companyItems.filter((item) => {
        if (!item.expiration_date) return false;
        const date = new Date(item.expiration_date);
        return date >= today && date <= twoWeeksFromNow;
      }).length,
      pendingInvites: pendingInvites.filter((invite) => invite.company_id === company.id).length,
      failedEmails: failedEmails.filter((row) => row.company_id === company.id).length
    };
  });
  const attentionCompanies = companyHealth.filter((company) => company.overdueItems > 0 || company.failedEmails > 0);
  const recentCustomerUsers = customerMembershipRows.slice(0, 10);
  const urgentItems = [...overdueItems, ...dueSoonItems].slice(0, 8);

  return (
    <main className="admin-console">
      <aside className="admin-rail">
        <div className="admin-mark">FF</div>
        <nav className="admin-rail-nav" aria-label="Admin console sections">
          <a href="#workspaces"><Building2 aria-hidden="true" /><span>Workspaces</span></a>
          <a href="#access"><Users aria-hidden="true" /><span>Access</span></a>
          <a href="#health"><MailWarning aria-hidden="true" /><span>Health</span></a>
        </nav>
        <div className="admin-rail-footer">
          <span>Signed in</span>
          <strong>{userData.user.email}</strong>
          <form action={signOut}>
            <button className="admin-logout" type="submit">Log out</button>
          </form>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Internal operations</p>
            <h1>FF Admin Console</h1>
          </div>
          <span className="admin-subtle-pill">FF Admin</span>
        </header>

        {message ? <p className="form-message admin-message">{message}</p> : null}

        <section className="admin-stat-grid" aria-label="Platform summary">
          <article>
            <Building2 aria-hidden="true" />
            <span>Workspaces</span>
            <strong>{companyRows.length}</strong>
            <p>{attentionCompanies.length} need attention</p>
          </article>
          <article>
            <Users aria-hidden="true" />
            <span>Customer users</span>
            <strong>{customerMembershipRows.length}</strong>
            <p>{pendingInvites.length} pending invites</p>
          </article>
          <article>
            <ClipboardList aria-hidden="true" />
            <span>Open items</span>
            <strong>{openItems.length}</strong>
            <p>{overdueItems.length} overdue · {dueSoonItems.length} due soon</p>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" />
            <span>FF admins</span>
            <strong>{appAdminRows.length}</strong>
            <p>{failedEmails.length} failed emails · {queuedEmails.length} queued</p>
          </article>
        </section>

        <section className="admin-grid-main">
          <section className="panel admin-panel" id="workspaces">
            <div className="admin-panel-heading">
              <div>
                <span>Customer workspaces</span>
                <h2>Support overview</h2>
              </div>
            </div>
            <div className="admin-company-list">
              {companyHealth.map((company) => (
                <article key={company.id}>
                  <div className="admin-company-name">
                    <strong>{company.name}</strong>
                    <span className={company.overdueItems || company.failedEmails ? 'risk-chip risk-chip-hot' : 'risk-chip'}>
                      {company.overdueItems || company.failedEmails ? 'Attention' : 'Normal'}
                    </span>
                  </div>
                  <span>{company.customerUsers} users</span>
                  <span>{company.vessels} vessels</span>
                  <span>{company.openItems} open</span>
                  <span>{company.overdueItems} overdue</span>
                  <Link href={`/admin/companies/${company.id}`}>
                    Support view
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="panel admin-panel" id="access">
            <div className="admin-panel-heading">
              <div>
                <span>Access</span>
                <h2>Add or update a user</h2>
              </div>
              <UserPlus aria-hidden="true" />
            </div>
            <form action={createInvitation} className="admin-role-form">
              <label>
                Email
                <input name="email" type="email" placeholder="name@company.com" required />
              </label>
              <label>
                Role
                <select name="role" defaultValue="office_user">
                  <option value="app_admin">FF Admin</option>
                  <option value="owner">Customer Admin</option>
                  <option value="office_admin">Office Admin</option>
                  <option value="office_user">Office User</option>
                </select>
              </label>
              <label>
                Company
                <select name="companyId">
                  <option value="">No customer workspace</option>
                  {companyRows.map((company) => (
                    <option value={company.id} key={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
              <button type="submit">Save access</button>
            </form>
          </section>
        </section>

        <section className="admin-grid-secondary" id="health">
          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Customer users</span>
                <h2>Recent memberships</h2>
              </div>
            </div>
            <div className="admin-user-table">
              {recentCustomerUsers.map((membership) => (
                <article key={`${membership.user_id}-${membership.company_id}`}>
                  <div>
                    <strong>{profileName(membership)}</strong>
                    <span>{profileEmail(membership)}</span>
                  </div>
                  <span>{accessRoleLabel(membership.role)}</span>
                  <span>{companyName(membership)}</span>
                </article>
              ))}
              {recentCustomerUsers.length === 0 ? <p className="muted-panel-copy">No customer memberships yet.</p> : null}
            </div>
          </section>

          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Internal admins</span>
                <h2>FF access</h2>
              </div>
            </div>
            <div className="admin-admin-list">
              {appAdminRows.map((admin) => (
                <article key={admin.email}>
                  <ShieldCheck aria-hidden="true" />
                  <div>
                    <strong>{admin.email}</strong>
                    <span>{formatDate(admin.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Compliance health</span>
                <h2>Near-term risk</h2>
              </div>
            </div>
            <div className="admin-risk-list">
              {urgentItems.map((item) => (
                <article key={item.id}>
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <strong>{item.item_name}</strong>
                    <span>{companyName(item)} · {item.owner_current ?? 'Unassigned'} · {formatDate(item.expiration_date)}</span>
                  </div>
                  <span className={item.expiration_date && new Date(item.expiration_date) < today ? 'risk-chip risk-chip-hot' : 'risk-chip'}>
                    {item.expiration_date && new Date(item.expiration_date) < today ? 'Overdue' : 'Due soon'}
                  </span>
                </article>
              ))}
              {urgentItems.length === 0 ? <p className="muted-panel-copy">No overdue or near-term items.</p> : null}
            </div>
          </section>

          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Invites</span>
                <h2>Pending access</h2>
              </div>
            </div>
            <div className="admin-invite-list">
              {pendingInvites.slice(0, 10).map((invite) => (
                <article key={`${invite.email}-${invite.company_id}`}>
                  <div>
                    <strong>{invite.email}</strong>
                    <span>{accessRoleLabel(invite.role)} · {companyName(invite)}</span>
                  </div>
                  <span>{formatDate(invite.created_at)}</span>
                </article>
              ))}
              {pendingInvites.length === 0 ? <p className="muted-panel-copy">No pending invitations.</p> : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
