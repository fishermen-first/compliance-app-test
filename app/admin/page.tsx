import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, Building2, CheckCircle2, ClipboardList, Database, LogOut, UserPlus } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { createCompany } from '@/app/actions/companies';
import { createClient } from '@/lib/supabase/server';

type AdminPageProps = {
  searchParams?: { message?: string };
};

type CompanySetup = {
  id: string;
  name: string;
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

function setupStage(company: CompanySetup) {
  if (company.totalItems === 0 && company.vessels === 0) {
    return {
      label: 'Workspace created',
      detail: 'Import the customer workbook next.',
      action: 'Import workbook',
      href: `/admin/companies/${company.id}#import`,
      tone: 'blocked'
    };
  }

  if (company.ownerCodes === 0) {
    return {
      label: 'Data needs review',
      detail: 'No owner codes were detected yet.',
      action: 'Review import',
      href: `/admin/companies/${company.id}#import`,
      tone: 'blocked'
    };
  }

  if (company.mappedOwnerCodes < company.ownerCodes) {
    return {
      label: 'Map owners',
      detail: `${company.ownerCodes - company.mappedOwnerCodes} owner codes still unmapped.`,
      action: 'Map owners',
      href: `/admin/companies/${company.id}#mapping`,
      tone: 'attention'
    };
  }

  if (company.users === 0 && company.pendingInvites === 0) {
    return {
      label: 'Ready for invites',
      detail: 'Owner mapping is ready. Invite the customer team.',
      action: 'Invite users',
      href: `/admin/companies/${company.id}#access`,
      tone: 'ready'
    };
  }

  return {
    label: 'Customer access started',
    detail: `${company.users} active users · ${company.pendingInvites} pending invites.`,
    action: 'View workspace',
    href: `/admin/companies/${company.id}`,
    tone: 'ready'
  };
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

  const [
    { data: companies },
    { data: memberships },
    { data: invitations },
    { data: appAdmins },
    { data: vessels },
    { data: items },
    { data: ownerCodes }
  ] = await Promise.all([
    supabase.from('companies').select('id, name, timezone, created_at').order('created_at', { ascending: true }),
    supabase
      .from('company_memberships')
      .select('company_id, user_id, role, created_at, profiles(email, full_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at, company_id')
      .order('created_at', { ascending: false }),
    supabase.from('app_admins').select('email, created_at'),
    supabase.from('vessels').select('id, company_id, active'),
    supabase.from('compliance_items').select('id, company_id'),
    supabase.from('company_owner_codes').select('id, company_id, user_id, pending_email')
  ]);

  const companyRows = companies ?? [];
  const appAdminEmailSet = new Set((appAdmins ?? []).map((admin) => admin.email.toLowerCase()));
  const customerMembershipRows = (memberships ?? []).filter((membership) => !appAdminEmailSet.has(profileEmail(membership).toLowerCase()));
  const pendingInvites = (invitations ?? []).filter((invite) => !invite.accepted_at);

  const companySetup: CompanySetup[] = companyRows.map((company) => {
    const companyOwnerCodes = (ownerCodes ?? []).filter((owner) => owner.company_id === company.id);
    return {
      id: company.id,
      name: company.name,
      vessels: (vessels ?? []).filter((vessel) => vessel.company_id === company.id && vessel.active).length,
      users: customerMembershipRows.filter((membership) => membership.company_id === company.id).length,
      totalItems: (items ?? []).filter((item) => item.company_id === company.id).length,
      ownerCodes: companyOwnerCodes.length,
      mappedOwnerCodes: companyOwnerCodes.filter((owner) => owner.user_id || owner.pending_email).length,
      pendingInvites: pendingInvites.filter((invite) => invite.company_id === company.id).length
    };
  });

  const blockedCount = companySetup.filter((company) => setupStage(company).tone === 'blocked').length;
  const readyCount = companySetup.filter((company) => setupStage(company).label === 'Ready for invites').length;
  const nextCompany = companySetup.find((company) => setupStage(company).tone !== 'ready') ?? companySetup[0];
  const nextStage = nextCompany ? setupStage(nextCompany) : null;

  return (
    <main className="admin-console admin-setup-console">
      <aside className="admin-rail">
        <div className="admin-mark">FF</div>
        <nav className="admin-rail-nav" aria-label="Admin setup sections">
          <a href="#workspaces"><Building2 aria-hidden="true" /><span>Workspaces</span></a>
          <a href="#new-workspace"><ClipboardList aria-hidden="true" /><span>New setup</span></a>
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
        <header className="admin-topbar admin-setup-topbar">
          <div>
            <p className="eyebrow">Private FF workspace</p>
            <h1>Customer setup</h1>
          </div>
          <span className="admin-subtle-pill">Solo admin</span>
        </header>

        {searchParams?.message ? <p className="form-message admin-message">{searchParams.message}</p> : null}

        <section className="admin-setup-hero" aria-label="Setup overview">
          <div>
            <span>Next action</span>
            <h2>{nextCompany && nextStage ? `${nextStage.action} for ${nextCompany.name}` : 'Create your first customer workspace'}</h2>
            <p>{nextStage?.detail ?? 'Start with the customer name, then import the compliance workbook before inviting anyone.'}</p>
          </div>
          {nextCompany && nextStage ? (
            <Link href={nextStage.href}>
              {nextStage.action}
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ) : (
            <a href="#new-workspace">Create workspace</a>
          )}
        </section>

        <section className="admin-setup-summary" aria-label="Customer setup summary">
          <article>
            <span>Customer workspaces</span>
            <strong>{companySetup.length}</strong>
          </article>
          <article>
            <span>Blocked setup</span>
            <strong>{blockedCount}</strong>
          </article>
          <article>
            <span>Ready for invites</span>
            <strong>{readyCount}</strong>
          </article>
          <article>
            <span>Pending customer invites</span>
            <strong>{pendingInvites.length}</strong>
          </article>
        </section>

        <section className="admin-grid-main admin-onboarding-grid">
          <section className="panel admin-panel" id="workspaces">
            <div className="admin-panel-heading">
              <div>
                <span>Customer workspaces</span>
                <h2>Setup status</h2>
              </div>
            </div>
            {companySetup.length === 0 ? (
              <div className="admin-empty-state">
                <Building2 aria-hidden="true" />
                <h3>No customer workspaces yet</h3>
                <p>Create the customer workspace first. After that, the detail page will walk you through import, owner mapping, and invites.</p>
                <a href="#new-workspace">Create customer workspace</a>
              </div>
            ) : (
              <div className="admin-workspace-list">
                {companySetup.map((company) => {
                  const stage = setupStage(company);
                  return (
                    <article key={company.id}>
                      <div className="admin-workspace-primary">
                        <strong>{company.name}</strong>
                        <span className={`setup-chip setup-chip-${stage.tone}`}>{stage.label}</span>
                      </div>
                      <div className="admin-workspace-checks" aria-label={`${company.name} setup checks`}>
                        <span className={company.totalItems > 0 ? 'complete' : ''}><Database aria-hidden="true" /> {company.totalItems} items</span>
                        <span className={company.ownerCodes > 0 && company.mappedOwnerCodes === company.ownerCodes ? 'complete' : ''}>
                          <CheckCircle2 aria-hidden="true" /> {company.mappedOwnerCodes}/{company.ownerCodes} owners mapped
                        </span>
                        <span className={company.users > 0 || company.pendingInvites > 0 ? 'complete' : ''}>
                          <UserPlus aria-hidden="true" /> {company.users} users · {company.pendingInvites} pending
                        </span>
                      </div>
                      <p>{stage.detail}</p>
                      <Link href={stage.href}>
                        {stage.action}
                        <ArrowUpRight aria-hidden="true" />
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="admin-side-stack" id="new-workspace">
            <section className="panel admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <span>Start here</span>
                  <h2>Create workspace</h2>
                </div>
                <Building2 aria-hidden="true" />
              </div>
              <form action={createCompany} className="admin-role-form">
                <label>
                  Customer company name
                  <input name="companyName" placeholder="Arctic Storm Management Group" required />
                </label>
                <label className="wide-admin-field">
                  Timezone
                  <select name="timezone" defaultValue="America/Los_Angeles">
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="America/Anchorage">Alaska Time</option>
                    <option value="America/New_York">Eastern Time</option>
                  </select>
                </label>
                <button type="submit">Create customer workspace</button>
              </form>
            </section>

            <section className="panel admin-panel admin-personal-note">
              <div className="admin-panel-heading">
                <div>
                  <span>Workflow</span>
                  <h2>Order matters</h2>
                </div>
              </div>
              <ol>
                <li>Create the customer workspace.</li>
                <li>Import the workbook they sent.</li>
                <li>Review detected vessels, items, and owner codes.</li>
                <li>Map owner codes to real users.</li>
                <li>Invite the customer only after mapping is ready.</li>
              </ol>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
