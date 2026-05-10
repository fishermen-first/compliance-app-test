import Link from 'next/link';
import { saveOwnerCodeMapping } from '@/app/actions/owner-codes';
import { AppSidebar } from '@/components/app-sidebar';
import { getCompanyOwnerCodes, getCustomerContext, getCustomerItems } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SettingsPage() {
  const { supabase, membership, company, isAppAdmin } = await getCustomerContext({ allowAppAdmin: true });
  const [{ data: memberships }, { data: invitations }, { data: reminderRules }, { data: recipients }, { data: vessels }, items, ownerCodes] = await Promise.all([
    supabase
      .from('company_memberships')
      .select('role, created_at, profiles(email, full_name)')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('compliance_item_reminder_rules')
      .select('id, active')
      .eq('company_id', membership.company_id),
    supabase
      .from('compliance_item_notification_recipients')
      .select('recipient_email')
      .eq('company_id', membership.company_id),
    supabase
      .from('vessels')
      .select('id, name, active')
      .eq('company_id', membership.company_id)
      .order('name'),
    getCustomerItems(membership.company_id),
    getCompanyOwnerCodes(membership.company_id)
  ]);

  const importedOwnerCodes = Array.from(new Set(items.map((item) => item.owner_current).filter(Boolean) as string[])).sort();
  const ownerCodeMap = new Map<string, any>();
  importedOwnerCodes.forEach((code) => ownerCodeMap.set(code, { code, user_id: null, pending_email: null, profiles: null }));
  ownerCodes.forEach((owner) => ownerCodeMap.set(owner.code, owner));
  const ownerCodeRows = Array.from(ownerCodeMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  const activeRules = (reminderRules ?? []).filter((rule) => rule.active);
  const pendingInvites = (invitations ?? []).filter((invite) => !invite.accepted_at);
  const canManageOwnerCodes = isAppAdmin || ['owner', 'office_admin'].includes(membership.role);

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} isAppAdmin={isAppAdmin} activePath="/settings" />
      <main className="workspace list-workspace">
        <header className="list-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h1>Workspace setup</h1>
            <p>Review the people, legacy owner initials, vessels, and reminder configuration that came from the spreadsheet import.</p>
          </div>
        </header>

        <section className="settings-grid">
          <section className="panel settings-card">
            <div className="panel-heading">
              <div>
                <span>Company</span>
                <h2>{company?.name ?? 'Workspace'}</h2>
              </div>
            </div>
            <dl className="settings-definition-list">
              <div><dt>Timezone</dt><dd>{company?.timezone ?? 'Not set'}</dd></div>
              <div><dt>Active vessels</dt><dd>{(vessels ?? []).filter((vessel) => vessel.active).length}</dd></div>
              <div><dt>Imported records</dt><dd>{items.length}</dd></div>
            </dl>
          </section>

          <section className="panel settings-card">
            <div className="panel-heading">
              <div>
                <span>Users</span>
                <h2>Access</h2>
              </div>
            </div>
            <div className="settings-list">
              {(memberships ?? []).map((row: any) => {
                const profile = relation(row.profiles);
                return (
                  <article key={profile?.email ?? row.created_at}>
                    <strong>{profile?.full_name ?? profile?.email ?? 'User'}</strong>
                    <span>{profile?.email ?? 'No email'}</span>
                    <b>{accessRoleLabel(row.role)}</b>
                  </article>
                );
              })}
              {pendingInvites.map((invite) => (
                <article key={invite.email}>
                  <strong>{invite.email}</strong>
                  <span>Invitation pending</span>
                  <b>{accessRoleLabel(invite.role)}</b>
                </article>
              ))}
              {(memberships ?? []).length === 0 && pendingInvites.length === 0 ? (
                <p className="muted-panel-copy">No customer users have access yet.</p>
              ) : null}
            </div>
          </section>

          <section className="panel settings-card">
            <div className="panel-heading">
              <div>
                <span>Owner mapping</span>
                <h2>Sheet owners to users</h2>
              </div>
            </div>
            <div className="owner-mapping-list">
              {ownerCodeRows.map((owner: any) => {
                const profile = relation(owner.profiles);
                const assigned = profile?.email ?? owner.pending_email ?? 'Unmapped';
                const count = items.filter((item) => item.owner_current === owner.code).length;
                return (
                  <article key={owner.code}>
                    <div>
                      <strong>{owner.code}</strong>
                      <span>{count} records · {owner.user_id ? 'Mapped user' : owner.pending_email ? 'Pending invite' : 'Unmapped'}</span>
                    </div>
                    <Link href={`/items?owner=${encodeURIComponent(owner.code)}`}>View records</Link>
                    {canManageOwnerCodes ? (
                      <form action={saveOwnerCodeMapping} className="owner-mapping-form">
                        <input type="hidden" name="companyId" value={membership.company_id} />
                        <input type="hidden" name="code" value={owner.code} />
                        <input type="hidden" name="redirectTo" value="/settings" />
                        <input name="assignmentEmail" type="email" placeholder="email@company.com" defaultValue={assigned === 'Unmapped' ? '' : assigned} aria-label={`Assign owner ${owner.code}`} />
                        <button type="submit">Save</button>
                      </form>
                    ) : (
                      <span>{assigned}</span>
                    )}
                  </article>
                );
              })}
              {ownerCodeRows.length === 0 ? <p className="muted-panel-copy">No owner initials found.</p> : null}
            </div>
          </section>

          <section className="panel settings-card">
            <div className="panel-heading">
              <div>
                <span>Reminders</span>
                <h2>Notification setup</h2>
              </div>
            </div>
            <dl className="settings-definition-list">
              <div><dt>Active rules</dt><dd>{activeRules.length}</dd></div>
              <div><dt>Inactive rules</dt><dd>{(reminderRules ?? []).length - activeRules.length}</dd></div>
              <div><dt>Additional recipients</dt><dd>{new Set((recipients ?? []).map((recipient) => recipient.recipient_email)).size}</dd></div>
            </dl>
            <p className="settings-note">Reminder details are managed on each compliance item so instructions and recipients stay tied to the work.</p>
          </section>
        </section>
      </main>
    </div>
  );
}
