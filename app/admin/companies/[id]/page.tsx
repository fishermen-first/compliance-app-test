import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CheckCircle2, ClipboardList, Database, LogOut, Ship, Upload, UserPlus, Users } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { importComplianceWorkbook } from '@/app/actions/imports';
import { createInvitation } from '@/app/actions/invitations';
import { saveOwnerCodeMapping } from '@/app/actions/owner-codes';
import { accessRoleLabel } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type CompanyAdminPageProps = {
  params: { id: string };
  searchParams?: { message?: string };
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

function stepState(complete: boolean, active: boolean) {
  if (complete) return 'complete';
  if (active) return 'active';
  return 'locked';
}

export default async function CompanyAdminPage({ params, searchParams }: CompanyAdminPageProps) {
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
    { data: reminderRules },
    { data: ownerCodes },
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
      .select('id, item_name, owner_current, expiration_date, start_working_on, status, compliance_area, source_sheet, source_row_number, vessels(name)')
      .eq('company_id', companyId)
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .limit(500),
    supabase.from('compliance_item_reminder_rules').select('id, company_id').eq('company_id', companyId),
    supabase
      .from('company_owner_codes')
      .select('id, company_id, code, display_name, user_id, pending_email, profiles(email, full_name)')
      .eq('company_id', companyId)
      .order('code'),
    supabase.from('app_admins').select('email')
  ]);

  if (!company) {
    notFound();
  }

  const itemRows = items ?? [];
  const activeVessels = (vessels ?? []).filter((vessel) => vessel.active);
  const openItems = itemRows.filter((item) => isOpenItem(item.status));
  const pendingInvites = (invitations ?? []).filter((invite) => !invite.accepted_at);
  const appAdminEmailSet = new Set((appAdmins ?? []).map((admin) => admin.email.toLowerCase()));
  const customerMemberships = (memberships ?? []).filter((membership) => !appAdminEmailSet.has(profileEmail(membership).toLowerCase()));
  const importedOwnerCodes = Array.from(new Set(itemRows.map((item) => item.owner_current).filter(Boolean) as string[])).sort();
  const ownerCodeMap = new Map<string, any>();
  importedOwnerCodes.forEach((code) => ownerCodeMap.set(code, { code, user_id: null, pending_email: null, profiles: null }));
  (ownerCodes ?? []).forEach((owner) => ownerCodeMap.set(owner.code, owner));
  const ownerCodeRows = Array.from(ownerCodeMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  const mappedOwnerCodes = ownerCodeRows.filter((owner) => owner.user_id || owner.pending_email);

  const hasData = itemRows.length > 0 || activeVessels.length > 0;
  const hasOwnerCodes = ownerCodeRows.length > 0;
  const ownerMappingComplete = hasOwnerCodes && mappedOwnerCodes.length === ownerCodeRows.length;
  const hasAccessStarted = customerMemberships.length > 0 || pendingInvites.length > 0;
  const canInvite = hasData && ownerMappingComplete;
  const nextStep =
    !hasData
      ? 'Import the compliance workbook'
      : !hasOwnerCodes
        ? 'Review the import and owner codes'
        : !ownerMappingComplete
          ? 'Map every detected owner code'
          : !hasAccessStarted
            ? 'Add the customer team'
            : 'Verify first login';

  const steps = [
    { label: 'Workspace', detail: 'Created', state: 'complete' },
    { label: 'Import', detail: `${itemRows.length} items`, state: stepState(hasData, !hasData) },
    { label: 'Review', detail: `${activeVessels.length} vessels · ${ownerCodeRows.length} owner codes`, state: stepState(hasData && hasOwnerCodes, hasData && !hasOwnerCodes) },
    { label: 'Map owners', detail: `${mappedOwnerCodes.length}/${ownerCodeRows.length} mapped`, state: stepState(ownerMappingComplete, hasOwnerCodes && !ownerMappingComplete) },
    { label: 'Add users', detail: `${customerMemberships.length} users · ${pendingInvites.length} pending`, state: stepState(hasAccessStarted, canInvite && !hasAccessStarted) },
    { label: 'Verify', detail: hasAccessStarted ? 'Customer access started' : 'Waiting for users', state: stepState(hasAccessStarted, false) }
  ];

  return (
    <main className="admin-console admin-detail-console">
      <aside className="admin-rail">
        <Link className="admin-back-link" href="/admin">
          <ArrowLeft aria-hidden="true" />
          Customer setup
        </Link>
        <nav className="admin-rail-nav" aria-label="Workspace setup steps">
          <a href="#import"><Upload aria-hidden="true" /><span>Import</span></a>
          <a href="#mapping"><Users aria-hidden="true" /><span>Map owners</span></a>
          <a href="#access"><UserPlus aria-hidden="true" /><span>Add users</span></a>
        </nav>
        <div className="admin-rail-footer">
          <span>Workspace</span>
          <strong>{company.name}</strong>
          <form action={signOut}>
            <button className="admin-logout" type="submit"><LogOut aria-hidden="true" /> Log out</button>
          </form>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar admin-setup-topbar">
          <div>
            <p className="eyebrow">Customer onboarding</p>
            <h1>{company.name}</h1>
          </div>
          <span className="admin-subtle-pill">{company.timezone}</span>
        </header>

        {searchParams?.message ? <p className="form-message admin-message">{searchParams.message}</p> : null}

        <section className="admin-setup-hero admin-company-hero" aria-label="Next setup step">
          <div>
            <span>Next action</span>
            <h2>{nextStep}</h2>
            <p>Work through these in order so the customer lands in the right queue on first login.</p>
          </div>
          <Link href={canInvite && !hasAccessStarted ? '#access' : !ownerMappingComplete && hasOwnerCodes ? '#mapping' : '#import'}>
            Continue setup
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </section>

        <section className="admin-stepper" aria-label="Workspace onboarding progress">
          {steps.map((step) => (
            <article className={`admin-step admin-step-${step.state}`} key={step.label}>
              <CheckCircle2 aria-hidden="true" />
              <span>{step.label}</span>
              <strong>{step.detail}</strong>
            </article>
          ))}
        </section>

        <section className="admin-grid-main admin-onboarding-grid">
          <section className="panel admin-panel" id="import">
            <div className="admin-panel-heading">
              <div>
                <span>Step 1</span>
                <h2>Import compliance workbook</h2>
              </div>
              <Upload aria-hidden="true" />
            </div>
            <div className="admin-import-status">
              <article>
                <Database aria-hidden="true" />
                <div><strong>{itemRows.length}</strong><span>Imported items</span></div>
              </article>
              <article>
                <Ship aria-hidden="true" />
                <div><strong>{activeVessels.length}</strong><span>Active vessels</span></div>
              </article>
              <article>
                <ClipboardList aria-hidden="true" />
                <div><strong>{reminderRules?.length ?? 0}</strong><span>Reminder rules</span></div>
              </article>
            </div>
            <form action={importComplianceWorkbook} className="admin-import-form">
              <input type="hidden" name="companyId" value={companyId} />
              <label>
                Workbook
                <input name="workbook" type="file" accept=".xlsx,.xls" required />
              </label>
              <button type="submit">{hasData ? 'Re-import workbook' : 'Import workbook'}</button>
            </form>
            <p className="admin-flow-note">Re-importing updates rows from the same sheet and row number. It will not add users or notify anyone.</p>
          </section>

          <section className="panel admin-panel" id="access">
            <div className="admin-panel-heading">
              <div>
                <span>Final step</span>
                <h2>Add customer users</h2>
              </div>
              <UserPlus aria-hidden="true" />
            </div>
            {!canInvite ? (
              <p className="admin-guard-note">User access unlocks after the workbook is imported and every detected owner code has an assigned email.</p>
            ) : null}
            <form action={createInvitation} className="admin-role-form">
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="redirectTo" value={`/admin/companies/${companyId}`} />
              <label>
                Email
                <input name="email" type="email" placeholder="name@company.com" required disabled={!canInvite} />
              </label>
              <label>
                Role
                <select name="role" defaultValue="office_user" disabled={!canInvite}>
                  <option value="owner">Customer Admin</option>
                  <option value="office_admin">Office Admin</option>
                  <option value="office_user">Office User</option>
                </select>
              </label>
              <fieldset className="owner-code-checkboxes" disabled={!canInvite}>
                <legend>Owner codes for this user</legend>
                {ownerCodeRows.map((owner: any) => (
                  <label key={owner.code}>
                    <input name="ownerCodes" type="checkbox" value={owner.code} />
                    <span>{owner.code}</span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" disabled={!canInvite}>Add user</button>
            </form>
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
                    <span>Added, login pending · {formatDate(invite.created_at)}</span>
                  </div>
                  <span>{accessRoleLabel(invite.role)}</span>
                </article>
              ))}
              {customerMemberships.length === 0 && pendingInvites.length === 0 ? <p className="muted-panel-copy">No customer users added yet.</p> : null}
            </div>
          </section>
        </section>

        <section className="admin-mapping-review-grid">
          <section className="panel admin-panel" id="mapping">
            <div className="admin-panel-heading">
              <div>
                <span>Step 2</span>
                <h2>Map sheet owners to people</h2>
              </div>
            </div>
            <div className="owner-mapping-list owner-mapping-list-admin">
              {ownerCodeRows.length > 0 ? (
                <div className="owner-mapping-header" aria-hidden="true">
                  <span>Owner code</span>
                  <span>Records</span>
                  <span>Assignment email</span>
                  <span>Action</span>
                </div>
              ) : null}
              {ownerCodeRows.map((owner: any) => {
                const profile = relation(owner.profiles);
                const assigned = profile?.email ?? owner.pending_email ?? '';
                const count = itemRows.filter((item) => item.owner_current === owner.code).length;
                return (
                  <article key={owner.code}>
                    <strong>{owner.code}</strong>
                    <span>{count} {count === 1 ? 'record' : 'records'} · {owner.user_id ? 'Mapped user' : owner.pending_email ? 'Pending login' : 'Unmapped'}</span>
                    <form action={saveOwnerCodeMapping} className="owner-mapping-form">
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="code" value={owner.code} />
                      <input type="hidden" name="redirectTo" value={`/admin/companies/${companyId}`} />
                      <input name="assignmentEmail" type="email" placeholder="email@company.com" defaultValue={assigned} aria-label={`Assign owner ${owner.code}`} />
                      <button type="submit">Save</button>
                    </form>
                  </article>
                );
              })}
              {ownerCodeRows.length === 0 ? <p className="muted-panel-copy">Owner codes will appear here after import.</p> : null}
            </div>
          </section>

          <section className="panel admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span>Review</span>
                <h2>Vessels found</h2>
              </div>
            </div>
            <div className="support-vessel-list">
              {activeVessels.map((vessel) => (
                <article key={vessel.id}>
                  <strong>{vessel.name}</strong>
                  <span className="risk-chip">Active</span>
                </article>
              ))}
              {activeVessels.length === 0 ? <p className="muted-panel-copy">No vessel records yet.</p> : null}
            </div>
          </section>
        </section>

        <section className="panel admin-panel">
          <div className="admin-panel-heading">
            <div>
              <span>Review</span>
              <h2>Imported work sample</h2>
            </div>
          </div>
          <div className="support-item-table support-item-table-compact">
            {openItems.length > 0 ? (
              <div className="support-item-header" aria-hidden="true">
                <span>Item</span>
                <span>Start</span>
                <span>Expiration</span>
              </div>
            ) : null}
            {openItems.slice(0, 10).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.item_name}</strong>
                  <span>{vesselName(item)} · {item.compliance_area ?? 'Other'} · {item.owner_current ?? 'Unassigned'}</span>
                </div>
                <span>{formatDate(item.start_working_on)}</span>
                <span>{formatDate(item.expiration_date)}</span>
              </article>
            ))}
            {openItems.length === 0 ? <p className="muted-panel-copy">Imported work will appear here.</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
