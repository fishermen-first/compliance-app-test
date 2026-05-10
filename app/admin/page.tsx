import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, Building2, CheckCircle2, ClipboardList, Database, LogOut, Upload, UserPlus, Users } from 'lucide-react';
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
      label: 'Import workbook',
      detail: 'Workspace exists. Import the customer workbook next.',
      action: 'Import workbook',
      href: `/admin/companies/${company.id}#import`,
      tone: 'active'
    };
  }

  if (company.ownerCodes === 0) {
    return {
      label: 'Review import',
      detail: 'Imported data needs review before users are added.',
      action: 'Review import',
      href: `/admin/companies/${company.id}#import`,
      tone: 'active'
    };
  }

  if (company.mappedOwnerCodes < company.ownerCodes) {
    return {
      label: 'Map owners',
      detail: `${company.ownerCodes - company.mappedOwnerCodes} owner codes still need people.`,
      action: 'Map owners',
      href: `/admin/companies/${company.id}#mapping`,
      tone: 'active'
    };
  }

  if (company.users === 0 && company.pendingInvites === 0) {
    return {
      label: 'Add users',
      detail: 'Owner mapping is ready. Add customer users to the workspace.',
      action: 'Add users',
      href: `/admin/companies/${company.id}#access`,
      tone: 'ready'
    };
  }

  return {
    label: 'Verify access',
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

  const activeCompany = companySetup.find((company) => setupStage(company).tone === 'active') ?? companySetup[0];
  const activeStage = activeCompany ? setupStage(activeCompany) : null;
  const hasWorkspaces = companySetup.length > 0;

  const wizardSteps = [
    {
      label: 'Create workspace',
      description: hasWorkspaces ? `${companySetup.length} workspace${companySetup.length === 1 ? '' : 's'} created` : 'Start with the customer company name.',
      state: hasWorkspaces ? 'done' : 'active',
      icon: Building2,
      href: '#create-workspace'
    },
    {
      label: 'Import workbook',
      description: hasWorkspaces ? 'Open a workspace and upload the customer sheet.' : 'Available after a workspace exists.',
      state: hasWorkspaces && activeStage?.label === 'Import workbook' ? 'active' : hasWorkspaces ? 'ready' : 'locked',
      icon: Upload,
      href: activeCompany ? `/admin/companies/${activeCompany.id}#import` : '#create-workspace'
    },
    {
      label: 'Map owners',
      description: hasWorkspaces ? 'Connect detected owner codes to customer emails.' : 'Owner codes appear after import.',
      state: hasWorkspaces && activeStage?.label === 'Map owners' ? 'active' : hasWorkspaces ? 'ready' : 'locked',
      icon: Users,
      href: activeCompany ? `/admin/companies/${activeCompany.id}#mapping` : '#create-workspace'
    },
    {
      label: 'Add users',
      description: hasWorkspaces ? 'Invite users after owner mapping is ready.' : 'Users are added after mapping.',
      state: hasWorkspaces && activeStage?.label === 'Add users' ? 'active' : hasWorkspaces ? 'ready' : 'locked',
      icon: UserPlus,
      href: activeCompany ? `/admin/companies/${activeCompany.id}#access` : '#create-workspace'
    }
  ];

  return (
    <main className="admin-console admin-setup-console admin-wizard-console">
      <aside className="admin-rail">
        <div className="admin-mark">FF</div>
        <nav className="admin-rail-nav" aria-label="Admin setup sections">
          <a href="#setup-flow"><ClipboardList aria-hidden="true" /><span>Setup flow</span></a>
          <a href="#workspaces"><Building2 aria-hidden="true" /><span>Workspaces</span></a>
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

        <section className="admin-wizard-shell" id="setup-flow" aria-label="Customer setup wizard">
          <div className="admin-wizard-intro">
            <span>Guided setup</span>
            <h2>{activeCompany && activeStage ? `${activeStage.action} for ${activeCompany.name}` : 'Create your first customer workspace'}</h2>
            <p>{activeStage?.detail ?? 'Create the workspace first. Import, owner mapping, and user invites happen from that workspace page.'}</p>
          </div>

          <div className="admin-wizard-steps" aria-label="Setup steps">
            {wizardSteps.map((step) => {
              const Icon = step.icon;
              const isLocked = step.state === 'locked';
              const content = (
                <>
                  <Icon aria-hidden="true" />
                  <span>{step.label}</span>
                  <p>{step.description}</p>
                </>
              );

              return isLocked ? (
                <article className={`admin-wizard-step admin-wizard-step-${step.state}`} key={step.label}>
                  {content}
                </article>
              ) : (
                <Link className={`admin-wizard-step admin-wizard-step-${step.state}`} href={step.href} key={step.label}>
                  {content}
                </Link>
              );
            })}
          </div>

          {!hasWorkspaces ? (
            <form action={createCompany} className="admin-wizard-create-form" id="create-workspace">
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
              <button type="submit">Create workspace</button>
            </form>
          ) : activeCompany && activeStage ? (
            <div className="admin-wizard-next-action">
              <div>
                <span>Current workspace</span>
                <strong>{activeCompany.name}</strong>
                <p>{activeStage.detail}</p>
              </div>
              <Link href={activeStage.href}>
                {activeStage.action}
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </section>

        <section className="panel admin-panel admin-workspace-overview" id="workspaces">
          <div className="admin-panel-heading">
            <div>
              <span>Customer workspaces</span>
              <h2>{hasWorkspaces ? 'Workspace status' : 'No workspaces yet'}</h2>
            </div>
          </div>
          {hasWorkspaces ? (
            <div className="admin-workspace-list admin-workspace-list-compact">
              {companySetup.map((company) => {
                const stage = setupStage(company);
                return (
                  <article key={company.id}>
                    <div className="admin-workspace-primary">
                      <strong>{company.name}</strong>
                      <span className={`setup-chip setup-chip-${stage.tone === 'active' ? 'attention' : 'ready'}`}>{stage.label}</span>
                    </div>
                    <div className="admin-workspace-checks" aria-label={`${company.name} setup checks`}>
                      <span className={company.totalItems > 0 ? 'complete' : ''}><Database aria-hidden="true" /> {company.totalItems} items</span>
                      <span className={company.ownerCodes > 0 && company.mappedOwnerCodes === company.ownerCodes ? 'complete' : ''}>
                        <CheckCircle2 aria-hidden="true" /> {company.mappedOwnerCodes}/{company.ownerCodes} owners
                      </span>
                      <span className={company.users > 0 || company.pendingInvites > 0 ? 'complete' : ''}>
                        <UserPlus aria-hidden="true" /> {company.users} users · {company.pendingInvites} pending
                      </span>
                    </div>
                    <Link href={stage.href}>
                      {stage.action}
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="admin-empty-note">
              <p>No customer workspaces exist yet. The setup flow above is the only action you need right now.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
