import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, Building2, CheckCircle2, Database, LogOut, Plus, Ship, UserPlus, Users } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { createCompany } from '@/app/actions/companies';
import { getAppAdminClassification } from '@/lib/app-admins';
import { createClient } from '@/lib/supabase/server';

type AdminPageProps = {
  searchParams?: { message?: string };
};

type CompanyIndexRow = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  vessels: number;
  users: number;
  totalItems: number;
  ownerCodes: number;
  mappedOwnerCodes: number;
  pendingInvites: number;
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function profileEmail(row: any) {
  return relation(row.profiles)?.email ?? 'Profile pending';
}

function customerConsoleHref(companyId: string) {
  return `/admin/customers/${companyId}/overview`;
}

function handoffStage(company: CompanyIndexRow) {
  if (company.totalItems === 0 && company.vessels === 0) {
    return {
      label: 'Workbook needed',
      detail: 'No imported workbook data yet.',
      href: customerConsoleHref(company.id),
      tone: 'attention'
    };
  }

  if (company.ownerCodes === 0) {
    return {
      label: 'Review import',
      detail: 'Imported data is present. Owner codes need review.',
      href: customerConsoleHref(company.id),
      tone: 'attention'
    };
  }

  if (company.mappedOwnerCodes < company.ownerCodes) {
    return {
      label: 'Map owners',
      detail: `${company.ownerCodes - company.mappedOwnerCodes} owner code${company.ownerCodes - company.mappedOwnerCodes === 1 ? '' : 's'} need a customer email.`,
      href: customerConsoleHref(company.id),
      tone: 'attention'
    };
  }

  if (company.users === 0 && company.pendingInvites === 0) {
    return {
      label: 'Add users',
      detail: 'Owner mapping is ready. Add customer users next.',
      href: customerConsoleHref(company.id),
      tone: 'attention'
    };
  }

  return {
    label: 'Users active',
    detail: `${company.users} active user${company.users === 1 ? '' : 's'} · ${company.pendingInvites} pending invite${company.pendingInvites === 1 ? '' : 's'}.`,
    href: customerConsoleHref(company.id),
    tone: 'ready'
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const classification = await getAppAdminClassification();
  const viewerEmail = userData.user.email?.trim().toLowerCase();

  if (classification.status === 'unverified' || !viewerEmail || !classification.appAdminEmails.has(viewerEmail)) {
    redirect('/');
  }

  const [
    { data: companies },
    { data: memberships },
    { data: invitations },
    { data: vessels },
    { data: items },
    { data: ownerCodes }
  ] = await Promise.all([
    supabase.from('companies').select('id, name, timezone, created_at').order('name', { ascending: true }),
    supabase
      .from('company_memberships')
      .select('company_id, user_id, role, created_at, profiles(email, full_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at, company_id')
      .order('created_at', { ascending: false }),
    supabase.from('vessels').select('id, company_id, active'),
    supabase.from('compliance_items').select('id, company_id'),
    supabase.from('company_owner_codes').select('id, company_id, user_id, pending_email')
  ]);

  const companyRows = companies ?? [];
  const customerMembershipRows = (memberships ?? []).filter(
    (membership) => !classification.appAdminEmails.has(profileEmail(membership).toLowerCase())
  );
  const pendingInvites = (invitations ?? []).filter(
    (invite) => !invite.accepted_at && !classification.appAdminEmails.has((invite.email ?? '').toLowerCase())
  );

  const customerRows: CompanyIndexRow[] = companyRows.map((company) => {
    const companyOwnerCodes = (ownerCodes ?? []).filter((owner) => owner.company_id === company.id);

    return {
      id: company.id,
      name: company.name,
      timezone: company.timezone,
      createdAt: company.created_at,
      vessels: (vessels ?? []).filter((vessel) => vessel.company_id === company.id && vessel.active).length,
      users: customerMembershipRows.filter((membership) => membership.company_id === company.id).length,
      totalItems: (items ?? []).filter((item) => item.company_id === company.id).length,
      ownerCodes: companyOwnerCodes.length,
      mappedOwnerCodes: companyOwnerCodes.filter((owner) => owner.user_id || owner.pending_email).length,
      pendingInvites: pendingInvites.filter((invite) => invite.company_id === company.id).length
    };
  });

  const totalItems = customerRows.reduce((sum, company) => sum + company.totalItems, 0);
  const totalUsers = customerRows.reduce((sum, company) => sum + company.users, 0);
  const pendingInvitationCount = customerRows.reduce((sum, company) => sum + company.pendingInvites, 0);
  const customersNeedingWork = customerRows.filter((company) => handoffStage(company).tone === 'attention').length;
  const hasCustomers = customerRows.length > 0;

  return (
    <main className="admin-console admin-index-console">
      <aside className="admin-rail">
        <div className="admin-mark">FF</div>
        <nav className="admin-rail-nav" aria-label="Admin sections">
          <a href="#customers"><Building2 aria-hidden="true" /><span>Customers</span></a>
          <a href="#new-customer"><Plus aria-hidden="true" /><span>Add customer</span></a>
        </nav>
        <div className="admin-rail-footer">
          <span>Signed in</span>
          <strong>{userData.user.email}</strong>
          <form action={signOut}>
            <button className="admin-logout" type="submit"><LogOut aria-hidden="true" /> Log out</button>
          </form>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Private FF workspace</p>
            <h1>Customers</h1>
          </div>
          <span className="admin-subtle-pill">{customerRows.length} customer{customerRows.length === 1 ? '' : 's'}</span>
        </header>

        {searchParams?.message ? <p className="form-message admin-message">{searchParams.message}</p> : null}

        <section className="admin-stat-grid" aria-label="Customer portfolio summary">
          <article>
            <Building2 aria-hidden="true" />
            <span>Customers</span>
            <strong>{customerRows.length}</strong>
            <p>{customersNeedingWork} need handoff work</p>
          </article>
          <article>
            <Database aria-hidden="true" />
            <span>Imported work</span>
            <strong>{totalItems}</strong>
            <p>Compliance items across workspaces</p>
          </article>
          <article>
            <Users aria-hidden="true" />
            <span>Customer users</span>
            <strong>{totalUsers}</strong>
            <p>{pendingInvitationCount} pending invite{pendingInvitationCount === 1 ? '' : 's'}</p>
          </article>
          <article>
            <Ship aria-hidden="true" />
            <span>Active vessels</span>
            <strong>{customerRows.reduce((sum, company) => sum + company.vessels, 0)}</strong>
            <p>Across all customer workspaces</p>
          </article>
        </section>

        <section className="admin-index-grid">
          <section className="panel admin-panel admin-workspace-overview" id="customers">
            <div className="admin-panel-heading">
              <div>
                <span>All customers</span>
                <h2>{hasCustomers ? 'Customer workspaces' : 'No customers yet'}</h2>
              </div>
            </div>

            {hasCustomers ? (
              <div className="admin-workspace-list admin-workspace-list-compact">
                {customerRows.map((company) => {
                  const stage = handoffStage(company);
                  return (
                    <article key={company.id}>
                      <div className="admin-workspace-primary">
                        <strong>{company.name}</strong>
                        <span className={`setup-chip setup-chip-${stage.tone}`}>{stage.label}</span>
                        <p>Created {formatDate(company.createdAt)} · {company.timezone}</p>
                      </div>
                      <div className="admin-workspace-checks" aria-label={`${company.name} readiness checks`}>
                        <span className={company.totalItems > 0 ? 'complete' : ''}><Database aria-hidden="true" /> {company.totalItems} items</span>
                        <span className={company.ownerCodes > 0 && company.mappedOwnerCodes === company.ownerCodes ? 'complete' : ''}>
                          <CheckCircle2 aria-hidden="true" /> {company.mappedOwnerCodes}/{company.ownerCodes} owners
                        </span>
                        <span className={company.users > 0 || company.pendingInvites > 0 ? 'complete' : ''}>
                          <UserPlus aria-hidden="true" /> {company.users} users · {company.pendingInvites} pending
                        </span>
                      </div>
                      <Link href={stage.href} aria-label={`Open ${company.name}`}>
                        Open customer
                        <ArrowUpRight aria-hidden="true" />
                      </Link>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="admin-empty-note">
                <p>Create the first customer workspace, then open it to import the workbook, map owner codes, and manage users.</p>
              </div>
            )}
          </section>

          <section className="panel admin-panel" id="new-customer">
            <div className="admin-panel-heading">
              <div>
                <span>Add customer</span>
                <h2>New workspace</h2>
              </div>
            </div>
            <form action={createCompany} className="admin-create-form">
              <label>
                Customer company name
                <input name="companyName" placeholder="Arctic Storm Management Group" required />
              </label>
              <label>
                Timezone
                <select name="timezone" defaultValue="America/Los_Angeles">
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="America/Anchorage">Alaska Time</option>
                  <option value="America/New_York">Eastern Time</option>
                </select>
              </label>
              <button type="submit">
                Create customer
                <ArrowUpRight aria-hidden="true" />
              </button>
            </form>
          </section>
        </section>
      </section>
    </main>
  );
}
