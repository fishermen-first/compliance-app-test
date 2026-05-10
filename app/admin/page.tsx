import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, ClipboardList, DatabaseZap, MailWarning, ShieldCheck, Users } from 'lucide-react';
import { createInvitation } from '@/app/actions/invitations';
import { createClient } from '@/lib/supabase/server';

type AdminPageProps = {
  searchParams?: { message?: string };
};

type CompanyHealth = {
  id: string;
  name: string;
  vessels: number;
  members: number;
  openItems: number;
  overdueItems: number;
  pendingInvites: number;
  failedReminders: number;
};

function roleLabel(role: string) {
  if (role === 'app_admin') return 'FF Admin';
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function isOpenItem(status: string) {
  return status !== 'complete' && status !== 'discontinued';
}

function companyName(row: any) {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  return company?.name ?? 'Unknown company';
}

function profileName(row: any) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return profile?.full_name ?? profile?.email ?? 'Unknown user';
}

function profileEmail(row: any) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return profile?.email ?? 'Profile pending';
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
      .limit(25),
    supabase.from('app_admins').select('email, created_at').order('created_at', { ascending: false }),
    supabase.from('vessels').select('id, company_id, active, companies(name)'),
    supabase
      .from('compliance_items')
      .select('id, company_id, item_name, owner_current, expiration_date, start_working_on, status, companies(name), vessels(name)')
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .limit(300),
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
  const reminderRows = reminderLogs ?? [];
  const queueRows = emailQueue ?? [];

  const openItems = itemRows.filter((item) => isOpenItem(item.status));
  const overdueItems = openItems.filter((item) => item.expiration_date && new Date(item.expiration_date) < today);
  const dueSoonItems = openItems.filter((item) => {
    if (!item.expiration_date) return false;
    const date = new Date(item.expiration_date);
    return date >= today && date <= twoWeeksFromNow;
  });
  const pendingInvites = invitationRows.filter((invite) => !invite.accepted_at);
  const failedReminders = [...reminderRows, ...queueRows].filter((row) => row.status === 'failed');
  const queuedEmails = [...reminderRows, ...queueRows].filter((row) => row.status === 'queued');

  const uniquePeople = new Set([
    ...appAdminRows.map((admin) => admin.email),
    ...membershipRows.map((membership) => profileEmail(membership)).filter((email) => email !== 'Profile pending')
  ]);
  const companyHealth: CompanyHealth[] = companyRows.map((company) => {
    const companyItems = openItems.filter((item) => item.company_id === company.id);
    return {
      id: company.id,
      name: company.name,
      vessels: vesselRows.filter((vessel) => vessel.company_id === company.id && vessel.active).length,
      members: membershipRows.filter((membership) => membership.company_id === company.id).length,
      openItems: companyItems.length,
      overdueItems: companyItems.filter((item) => item.expiration_date && new Date(item.expiration_date) < today).length,
      pendingInvites: pendingInvites.filter((invite) => invite.company_id === company.id).length,
      failedReminders: failedReminders.filter((log) => log.company_id === company.id).length
    };
  });

  const atRiskCompanies = companyHealth.filter((company) => company.overdueItems > 0 || company.failedReminders > 0);
  const recentPeople = [
    ...appAdminRows.map((admin) => ({
      email: admin.email,
      name: admin.email,
      role: 'FF Admin',
      company: 'Platform',
      createdAt: admin.created_at
    })),
    ...membershipRows.map((membership) => ({
      email: profileEmail(membership),
      name: profileName(membership),
      role: roleLabel(membership.role),
      company: companyName(membership),
      createdAt: membership.created_at
    }))
  ].slice(0, 14);

  const urgentItems = [...overdueItems, ...dueSoonItems].slice(0, 8);

  return (
    <main className="admin-console">
      <aside className="admin-rail">
        <div className="brand-block admin-brand-block">
          <div className="brand-mark">FF</div>
          <div>
            <p>FF Compliance</p>
            <strong>Site Admin</strong>
            <small>Platform control</small>
          </div>
        </div>
        <nav className="admin-rail-nav" aria-label="Admin console sections">
          <a href="#overview"><ShieldCheck aria-hidden="true" /><span>Overview</span></a>
          <a href="#companies"><Building2 aria-hidden="true" /><span>Companies</span></a>
          <a href="#users"><Users aria-hidden="true" /><span>Users & roles</span></a>
          <a href="#health"><MailWarning aria-hidden="true" /><span>Health</span></a>
        </nav>
        <Link className="secondary-link admin-rail-link" href="/items">Company item view</Link>
      </aside>

      <section className="admin-workspace">
        <header className="admin-hero" id="overview">
          <div>
            <p className="eyebrow">Site admin</p>
            <h1>Platform command center.</h1>
            <p>Manage FF admins, company workspaces, invite status, compliance risk, and reminder health from one place.</p>
          </div>
          <div className="admin-identity">
            <span>Signed in as</span>
            <strong>{userData.user.email}</strong>
          </div>
        </header>

        {searchParams?.message ? <p className="form-message admin-message">{searchParams.message}</p> : null}

        <section className="admin-metric-grid" aria-label="Platform metrics">
          <article>
            <Building2 aria-hidden="true" />
            <span>Companies</span>
            <strong>{companyRows.length}</strong>
            <p>{atRiskCompanies.length} need attention</p>
          </article>
          <article>
            <Users aria-hidden="true" />
            <span>Known users</span>
            <strong>{uniquePeople.size}</strong>
            <p>{pendingInvites.length} pending invites</p>
          </article>
          <article>
            <ClipboardList aria-hidden="true" />
            <span>Open items</span>
            <strong>{openItems.length}</strong>
            <p>{overdueItems.length} overdue · {dueSoonItems.length} due soon</p>
          </article>
          <article>
            <MailWarning aria-hidden="true" />
            <span>Email health</span>
            <strong>{failedReminders.length}</strong>
            <p>{queuedEmails.length} queued reminders</p>
          </article>
        </section>

        <section className="admin-two-column">
          <div className="panel" id="companies">
            <div className="panel-heading compact-heading">
              <div>
                <span>Company workspaces</span>
                <h2>Client health</h2>
              </div>
            </div>
            <div className="admin-company-grid">
              {companyHealth.map((company) => (
                <article className="admin-company-card" key={company.id}>
                  <div>
                    <h3>{company.name}</h3>
                    <span className={company.overdueItems || company.failedReminders ? 'risk-chip risk-chip-hot' : 'risk-chip'}>
                      {company.overdueItems || company.failedReminders ? 'Needs attention' : 'Operational'}
                    </span>
                  </div>
                  <dl>
                    <div><dt>Vessels</dt><dd>{company.vessels}</dd></div>
                    <div><dt>Users</dt><dd>{company.members}</dd></div>
                    <div><dt>Open</dt><dd>{company.openItems}</dd></div>
                    <div><dt>Overdue</dt><dd>{company.overdueItems}</dd></div>
                  </dl>
                  <p>{company.pendingInvites} pending invite{company.pendingInvites === 1 ? '' : 's'} · {company.failedReminders} failed reminder{company.failedReminders === 1 ? '' : 's'}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="panel" id="users">
            <div className="panel-heading compact-heading">
              <div>
                <span>Users & roles</span>
                <h2>Create access</h2>
              </div>
            </div>
            <form action={createInvitation} className="admin-role-form">
              <label>
                Email
                <input name="email" type="email" placeholder="person@company.com" required />
              </label>
              <label>
                Role
                <select name="role" defaultValue="office_user">
                  <option value="app_admin">FF Admin</option>
                  <option value="owner">Company Admin</option>
                  <option value="office_admin">Office Admin</option>
                  <option value="office_user">Office User</option>
                </select>
              </label>
              <label>
                Company
                <select name="companyId">
                  <option value="">Platform role only</option>
                  {companyRows.map((company) => (
                    <option value={company.id} key={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
              <button type="submit">Save user access</button>
            </form>

            <div className="admin-list-table" aria-label="Recent user roles">
              {recentPeople.map((person) => (
                <article key={`${person.email}-${person.company}-${person.role}`}>
                  <div>
                    <strong>{person.name}</strong>
                    <span>{person.email}</span>
                  </div>
                  <span>{person.role}</span>
                  <span>{person.company}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-two-column admin-lower-grid" id="health">
          <div className="panel">
            <div className="panel-heading compact-heading">
              <div>
                <span>Compliance health</span>
                <h2>Needs attention</h2>
              </div>
            </div>
            <div className="admin-risk-list">
              {urgentItems.length === 0 ? <p className="muted-panel-copy">No overdue or near-term compliance items.</p> : null}
              {urgentItems.map((item) => (
                <article key={item.id}>
                  <DatabaseZap aria-hidden="true" />
                  <div>
                    <strong>{item.item_name}</strong>
                    <span>{companyName(item)} · {item.owner_current ?? 'No owner'} · expires {formatDate(item.expiration_date)}</span>
                  </div>
                  <span className={item.expiration_date && new Date(item.expiration_date) < today ? 'risk-chip risk-chip-hot' : 'risk-chip'}>
                    {item.expiration_date && new Date(item.expiration_date) < today ? 'Overdue' : 'Due soon'}
                  </span>
                </article>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading compact-heading">
              <div>
                <span>Invites & email</span>
                <h2>Access queue</h2>
              </div>
            </div>
            <div className="admin-invite-list">
              {pendingInvites.length === 0 ? <p className="muted-panel-copy">No pending invitations.</p> : null}
              {pendingInvites.slice(0, 10).map((invite) => (
                <article key={`${invite.email}-${invite.created_at}`}>
                  <div>
                    <strong>{invite.email}</strong>
                    <span>{roleLabel(invite.role)} · {companyName(invite)}</span>
                  </div>
                  <span>{formatDate(invite.created_at)}</span>
                </article>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
