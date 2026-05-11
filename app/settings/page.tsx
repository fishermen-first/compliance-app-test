import Link from 'next/link';
import { saveOwnerCodeMapping } from '@/app/actions/owner-codes';
import { AppSidebar } from '@/components/app-sidebar';
import { getAppAdminClassification } from '@/lib/app-admins';
import { getCustomerContext } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type SettingsPageProps = {
  searchParams?: { message?: string };
};

type Relation<T> = T | T[] | null | undefined;

type ProfileRelation = {
  email: string | null;
  full_name: string | null;
};

type MembershipRow = {
  role: string;
  created_at: string | null;
  profiles: Relation<ProfileRelation>;
};

type InvitationRow = {
  email: string | null;
  role: string;
  accepted_at: string | null;
  created_at: string | null;
};

type OwnerCodeRow = {
  id?: string | null;
  company_id?: string | null;
  code: string;
  display_name: string | null;
  user_id: string | null;
  pending_email: string | null;
  profiles: Relation<ProfileRelation>;
};

type ItemOwnerRow = {
  id: string;
  owner_current: string | null;
};

type ReminderRuleRow = {
  id: string;
  active: boolean | null;
};

type RecipientRow = {
  recipient_email: string | null;
};

type VesselRow = {
  id: string;
  active: boolean | null;
};

type OwnerStatus =
  | 'mapped'
  | 'invite-pending'
  | 'needs-customer'
  | 'needs-profile'
  | 'needs-login'
  | 'unmapped'
  | 'needs-verification';

type OwnerViewRow = {
  code: string;
  displayName: string | null;
  personName: string | null;
  loginEmail: string | null;
  recordCount: number | null;
  status: OwnerStatus;
  statusLabel: string;
  isFfAdminMapping: boolean;
};

type AccessViewRow = {
  key: string;
  person: string;
  email: string;
  status: 'active' | 'invite-pending';
  roleLabel: string;
};

type MissingProfileRow = {
  key: string;
  person: string;
  roleLabel: string;
};

const statusLabels: Record<OwnerStatus, string> = {
  mapped: 'Mapped',
  'invite-pending': 'Invite pending',
  'needs-customer': 'Needs customer user',
  'needs-profile': 'Needs profile email',
  'needs-login': 'Needs login email',
  unmapped: 'Unmapped',
  'needs-verification': 'Needs verification'
};

function relation<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? '';
}

function formatTimezone(timezone?: string | null) {
  if (!timezone) return 'Not set';

  const labels: Record<string, string> = {
    'America/Los_Angeles': 'Pacific Time',
    'America/Anchorage': 'Alaska Time',
    'America/New_York': 'Eastern Time'
  };

  return labels[timezone] ?? timezone;
}

function classifyOwnerStatus(owner: {
  displayName: string | null;
  userId: string | null;
  profileEmail: string | null;
  pendingEmail: string | null;
}, appAdminEmails: Set<string> | null): { status: OwnerStatus; isFfAdminMapping: boolean } {
  if (!appAdminEmails) {
    return { status: 'needs-verification', isFfAdminMapping: false };
  }

  const profileEmail = normalizedEmail(owner.profileEmail);
  const pendingEmail = normalizedEmail(owner.pendingEmail);
  const mappedEmail = profileEmail || pendingEmail;
  const isFfAdminMapping = Boolean(mappedEmail && appAdminEmails.has(mappedEmail));

  if (isFfAdminMapping) return { status: 'needs-customer', isFfAdminMapping };
  if (owner.userId && !profileEmail) return { status: 'needs-profile', isFfAdminMapping };
  if (owner.userId && profileEmail) return { status: 'mapped', isFfAdminMapping };
  if (pendingEmail) return { status: 'invite-pending', isFfAdminMapping };
  if (owner.displayName) return { status: 'needs-login', isFfAdminMapping };
  return { status: 'unmapped', isFfAdminMapping };
}

function isValidCoveredOwner(status: OwnerStatus) {
  return status === 'mapped' || status === 'invite-pending';
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { supabase, membership, company, isAppAdmin } = await getCustomerContext({ allowAppAdmin: true });
  const companyId = membership.company_id;

  const [
    membershipsResult,
    invitationsResult,
    reminderRulesResult,
    recipientsResult,
    vesselsResult,
    itemsResult,
    ownerCodesResult,
    appAdminClassification
  ] = await Promise.all([
    supabase
      .from('company_memberships')
      .select('role, created_at, profiles(email, full_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true }),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('compliance_item_reminder_rules')
      .select('id, active')
      .eq('company_id', companyId),
    supabase
      .from('compliance_item_notification_recipients')
      .select('recipient_email')
      .eq('company_id', companyId),
    supabase
      .from('vessels')
      .select('id, active')
      .eq('company_id', companyId),
    supabase
      .from('compliance_items')
      .select('id, owner_current')
      .eq('company_id', companyId),
    supabase
      .from('company_owner_codes')
      .select('id, company_id, code, display_name, user_id, pending_email, profiles(email, full_name)')
      .eq('company_id', companyId)
      .order('code'),
    getAppAdminClassification()
  ]);

  const accessReadFailed = Boolean(membershipsResult.error || invitationsResult.error);
  const ownerCodeReadFailed = Boolean(ownerCodesResult.error);
  const itemReadFailed = Boolean(itemsResult.error);
  const classificationFailed = appAdminClassification.status === 'unverified';
  const appAdminEmails = appAdminClassification.status === 'verified' ? appAdminClassification.appAdminEmails : null;

  const warnings = [
    accessReadFailed ? 'Customer access could not be loaded safely. Re-check users before changing owner mappings.' : null,
    ownerCodeReadFailed ? 'Owner-code mapping could not be loaded safely.' : null,
    itemReadFailed ? 'Imported record counts could not be verified.' : null,
    classificationFailed ? 'Customer access could not be safely classified. Re-check FF admin filtering before changing owner mappings.' : null
  ].filter(Boolean) as string[];

  const memberships = (membershipsResult.data ?? []) as unknown as MembershipRow[];
  const invitations = (invitationsResult.data ?? []) as unknown as InvitationRow[];
  const reminderRules = reminderRulesResult.error ? null : ((reminderRulesResult.data ?? []) as unknown as ReminderRuleRow[]);
  const recipients = recipientsResult.error ? null : ((recipientsResult.data ?? []) as unknown as RecipientRow[]);
  const vessels = vesselsResult.error ? null : ((vesselsResult.data ?? []) as unknown as VesselRow[]);
  const items = itemReadFailed ? [] : ((itemsResult.data ?? []) as unknown as ItemOwnerRow[]);
  const ownerCodes = ownerCodeReadFailed ? [] : ((ownerCodesResult.data ?? []) as unknown as OwnerCodeRow[]);
  const canManageOwnerCodes = isAppAdmin || ['owner', 'office_admin'].includes(membership.role);
  const accessCannotBeVerified = accessReadFailed || !canManageOwnerCodes;

  const itemCountsByOwner = new Map<string, number>();
  if (!itemReadFailed) {
    items.forEach((item) => {
      if (!item.owner_current) return;
      itemCountsByOwner.set(item.owner_current, (itemCountsByOwner.get(item.owner_current) ?? 0) + 1);
    });
  }

  const importedOwnerCodes = itemReadFailed ? [] : Array.from(itemCountsByOwner.keys()).sort();
  const ownerCodeMap = new Map<string, OwnerCodeRow>();
  if (!ownerCodeReadFailed) {
    importedOwnerCodes.forEach((code) => {
      ownerCodeMap.set(code, {
        code,
        display_name: null,
        user_id: null,
        pending_email: null,
        profiles: null
      });
    });
    ownerCodes.forEach((owner) => ownerCodeMap.set(owner.code, owner));
  }

  const ownerRows: OwnerViewRow[] = Array.from(ownerCodeMap.values())
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((owner) => {
      const profile = relation(owner.profiles);
      const displayName = owner.display_name ?? null;
      const personName = displayName ?? profile?.full_name ?? null;
      const profileEmail = profile?.email ?? null;
      const pendingEmail = owner.pending_email ?? null;
      const loginEmail = profileEmail ?? pendingEmail;
      const classification = classifyOwnerStatus(
        {
          displayName: personName,
          userId: owner.user_id,
          profileEmail,
          pendingEmail
        },
        appAdminEmails
      );

      return {
        code: owner.code,
        displayName,
        personName,
        loginEmail,
        recordCount: itemReadFailed ? null : itemCountsByOwner.get(owner.code) ?? 0,
        status: classification.status,
        statusLabel: statusLabels[classification.status],
        isFfAdminMapping: classification.isFfAdminMapping
      };
    });

  const activeRules = reminderRules?.filter((rule) => rule.active) ?? null;
  const additionalRecipients = recipients ? new Set(recipients.map((recipient) => recipient.recipient_email).filter(Boolean)).size : null;
  const activeVessels = vessels?.filter((vessel) => vessel.active).length ?? null;

  const pendingInvites = invitations.filter((invite) => !invite.accepted_at);
  const visibleActiveMemberships: AccessViewRow[] = [];
  const missingProfileRows: MissingProfileRow[] = [];
  let filteredFfAdminAccess = false;

  if (!accessReadFailed && appAdminEmails) {
    memberships.forEach((row) => {
      const profile = relation(row.profiles);
      const email = normalizedEmail(profile?.email);

      if (email && appAdminEmails.has(email)) {
        filteredFfAdminAccess = true;
        return;
      }

      if (!email) {
        missingProfileRows.push({
          key: `${row.created_at ?? 'membership'}-${row.role}`,
          person: profile?.full_name ?? 'Unnamed customer user',
          roleLabel: accessRoleLabel(row.role)
        });
        return;
      }

      visibleActiveMemberships.push({
        key: `${email}-${row.created_at ?? 'active'}`,
        person: profile?.full_name ?? profile?.email ?? email,
        email: profile?.email ?? email,
        status: 'active',
        roleLabel: accessRoleLabel(row.role)
      });
    });
  }

  const visiblePendingInvites: AccessViewRow[] = [];
  if (!accessReadFailed && appAdminEmails) {
    pendingInvites.forEach((invite) => {
      const email = normalizedEmail(invite.email);

      if (invite.role === 'app_admin' || (email && appAdminEmails.has(email))) {
        filteredFfAdminAccess = true;
        return;
      }

      if (!email) return;

      visiblePendingInvites.push({
        key: `${email}-${invite.created_at ?? 'pending'}`,
        person: invite.email ?? email,
        email: invite.email ?? email,
        status: 'invite-pending',
        roleLabel: accessRoleLabel(invite.role)
      });
    });
  }

  const accessRows = [...visibleActiveMemberships, ...visiblePendingInvites];
  const hasInvalidFfAdminOwnerMappings = ownerRows.some((owner) => owner.isFfAdminMapping);

  const settingsAccessState = {
    canShowAccessTable: !accessCannotBeVerified && !classificationFailed,
    canShowOwnerRows: !ownerCodeReadFailed,
    canEditOwnerCodes: canManageOwnerCodes && !ownerCodeReadFailed && !classificationFailed,
    coverageLabel:
      ownerCodeReadFailed
        ? null
        : itemReadFailed || classificationFailed
        ? 'Needs verification'
        : `${ownerRows.filter((owner) => isValidCoveredOwner(owner.status)).length} of ${ownerRows.length}`,
    warnings
  };
  const showOwnerFfAdminNote = hasInvalidFfAdminOwnerMappings;
  const showAccessFfAdminNote = filteredFfAdminAccess;
  const summaryCells = [
    { label: 'Workspace', value: company?.name ?? 'Workspace', small: true },
    { label: 'Timezone', value: formatTimezone(company?.timezone), small: true },
    { label: 'Active vessels', value: activeVessels === null ? 'Needs verification' : String(activeVessels), needsVerification: activeVessels === null },
    { label: 'Imported records', value: itemReadFailed ? 'Needs verification' : String(items.length), needsVerification: itemReadFailed },
    settingsAccessState.coverageLabel
      ? {
          label: 'Owner-code coverage',
          value: settingsAccessState.coverageLabel,
          needsVerification: settingsAccessState.coverageLabel === 'Needs verification'
        }
      : null
  ].filter(Boolean) as { label: string; value: string; small?: boolean; needsVerification?: boolean }[];
  const ownerPanelWarnings = [
    itemReadFailed ? 'Imported record counts could not be verified.' : null,
    classificationFailed ? 'Customer access could not be safely classified. Re-check FF admin filtering before changing owner mappings.' : null
  ].filter(Boolean) as string[];
  const accessPanelWarnings = [
    accessCannotBeVerified ? 'Customer access could not be loaded safely. Re-check users before changing owner mappings.' : null,
    classificationFailed ? 'Customer access could not be safely classified. Re-check FF admin filtering before changing owner mappings.' : null
  ].filter(Boolean) as string[];

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={isAppAdmin ? 'FF Admin inspecting workspace' : accessRoleLabel(membership.role)}
        isAppAdmin={isAppAdmin}
        activePath="/settings"
      />
      <main className="settings-setup-page">
        <header className="page-header">
          <p className="eyebrow">Settings</p>
          <h1>Workspace setup</h1>
          <p className="page-intro">Review access, owner-code mapping, and reminder coverage for this customer workspace.</p>
          {isAppAdmin ? <span className="role-banner">FF Admin inspecting workspace - changes still write to this customer.</span> : null}
        </header>

        <dl className="summary-strip" aria-label="Workspace summary">
          {summaryCells.map((cell) => (
            <div className={`summary-cell${cell.needsVerification ? ' needs-verification' : ''}`} key={cell.label}>
              <dt>{cell.label}</dt>
              <dd className={cell.small ? 'small-text' : undefined}>{cell.value}</dd>
            </div>
          ))}
        </dl>

        <section className="stack-panel" aria-labelledby="settings-owner-codes-heading">
          <div className="stack-panel-head">
            <div className="stack-panel-head-text">
              <span className="label">Primary</span>
              <h2 id="settings-owner-codes-heading">Workbook owner codes</h2>
            </div>
            <div className="head-meta">
              {ownerCodeReadFailed ? 'Needs verification' : `${ownerRows.length} codes from spreadsheet import`}
            </div>
          </div>

          {searchParams?.message ? (
            <div className="inline-message" role="status">
              <div>{searchParams.message}</div>
            </div>
          ) : null}

          {showOwnerFfAdminNote ? (
            <div className="ff-admin-note">
              FF admins can inspect this workspace from the admin console. They are not customer workspace users.
            </div>
          ) : null}

          {ownerPanelWarnings.length > 0 ? (
            <div className="degraded-block">
              <strong>Setup checks need attention</strong>
              <ul>
                {ownerPanelWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {settingsAccessState.canShowOwnerRows && ownerRows.length > 0 ? (
            <>
              <div className="owner-rows-head" aria-hidden="true">
                <span>Owner code</span>
                <span>Records</span>
                <span>Mapped person</span>
                <span>Login email</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              <ul className="owner-rows" aria-label="Workbook owner codes">
                {ownerRows.map((owner) => {
                  const personName = owner.personName ?? '';
                  const loginEmail = owner.loginEmail ?? '';
                  return (
                    <li className={`owner-row${settingsAccessState.canEditOwnerCodes ? '' : ' read-only'}`} key={owner.code}>
                      <div className="code">
                        <span className="mobile-label">Owner code</span>
                        {owner.code}
                      </div>
                      <div className="records">
                        <span className="mobile-label">Records</span>
                        {owner.recordCount === null ? (
                          <span>Needs verification</span>
                        ) : (
                          <>
                            {owner.recordCount}
                            <small>{owner.recordCount === 1 ? 'record' : 'records'}</small>
                          </>
                        )}
                      </div>
                      <div className={`person${personName ? '' : ' empty'}`}>
                        <span className="mobile-label">Mapped person</span>
                        {personName || 'Unmapped'}
                      </div>
                      <div className={`login${loginEmail ? '' : ' empty'}`}>
                        <span className="mobile-label">Login email</span>
                        {loginEmail || 'No login email'}
                      </div>
                      <div className="status-col">
                        <span className="mobile-label">Status</span>
                        <span className={`chip ${owner.status}`}>{owner.statusLabel}</span>
                      </div>
                      <div className="owner-actions">
                        <span className="mobile-label">Actions</span>
                        <Link className="view-records-link" href={`/items?owner=${encodeURIComponent(owner.code)}`}>View records</Link>
                        {settingsAccessState.canEditOwnerCodes ? (
                          <details className="owner-editor-details">
                            <summary className="edit-toggle">Edit mapping</summary>
                            <form action={saveOwnerCodeMapping} className="editor">
                              <p className="editor-title">Editing owner code {owner.code}</p>
                              <p className="editor-subtitle">Map this workbook owner code to a person on this customer workspace.</p>
                              {owner.status === 'needs-customer' ? (
                                <div className="editor-next-action">Edit mapping to use a customer user email.</div>
                              ) : null}
                              <input type="hidden" name="companyId" value={companyId} />
                              <input type="hidden" name="code" value={owner.code} />
                              <input type="hidden" name="redirectTo" value="/settings" />
                              <div className="editor-fields">
                                <label className="field">
                                  <span>Mapped person</span>
                                  <input name="personName" type="text" placeholder="Full name" defaultValue={personName} />
                                  <small>Display name shown on records.</small>
                                </label>
                                <label className="field">
                                  <span>Login email</span>
                                  <input name="loginEmail" type="email" placeholder="person@company.com" defaultValue={loginEmail} />
                                  <small>Customer workspace email. Sends invite if not yet a user.</small>
                                </label>
                                <button className="save-btn" type="submit">Save mapping</button>
                              </div>
                              <div className="editor-row-meta">
                                <span>Owner code · <strong>{owner.code}</strong></span>
                                <Link href={`/items?owner=${encodeURIComponent(owner.code)}`}>View records</Link>
                              </div>
                            </form>
                          </details>
                        ) : (
                          <span className="read-only-note">Read-only</span>
                        )}
                      </div>
                    </li>
                  );
                })
                }
              </ul>
            </>
          ) : null}

          {!settingsAccessState.canShowOwnerRows ? (
            <div className="degraded-block">
              <strong>Owner code data is temporarily unavailable</strong>
              Owner-code mapping could not be loaded safely.
            </div>
          ) : null}

          {settingsAccessState.canShowOwnerRows && ownerRows.length === 0 ? (
            <p className="panel-empty-copy">{itemReadFailed ? 'Owner initials need verification.' : 'No owner initials found.'}</p>
          ) : null}
        </section>

        <section className="stack-panel" aria-labelledby="settings-access-heading">
          <div className="stack-panel-head">
            <div className="stack-panel-head-text">
              <span className="label">Secondary</span>
              <h2 id="settings-access-heading">People with access</h2>
            </div>
            {settingsAccessState.canShowAccessTable ? (
              <div className="head-meta">
                {visibleActiveMemberships.length} active · {visiblePendingInvites.length} pending
              </div>
            ) : null}
          </div>

          {showAccessFfAdminNote && settingsAccessState.canShowAccessTable ? (
            <div className="ff-admin-note">
              FF admins can inspect this workspace from the admin console. They are not customer workspace users.
            </div>
          ) : null}

          {settingsAccessState.canShowAccessTable ? (
            <>
              {missingProfileRows.length > 0 ? (
                <div className="access-warnings">
                  <span className="label">Needs profile email</span>
                  <ul>
                    {missingProfileRows.map((row) => (
                      <li key={row.key}>{row.person} · role <strong>{row.roleLabel}</strong></li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {accessRows.length > 0 ? (
                <>
                  <div className="access-rows-head" aria-hidden="true">
                    <span>Person</span>
                    <span>Email</span>
                    <span>Access status</span>
                    <span>Role</span>
                  </div>
                  <ul className="access-rows" aria-label="People with access">
                    {accessRows.map((row) => (
                      <li className="access-row" key={row.key}>
                        <div className="person">{row.person}</div>
                        <div className="email">{row.email}</div>
                        <span className={`chip ${row.status}`}>{row.status === 'active' ? 'Active' : 'Invite pending'}</span>
                        <span className="chip role-chip">{row.roleLabel}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : missingProfileRows.length === 0 ? (
                <p className="panel-empty-copy">No customer users have access yet.</p>
              ) : null}
            </>
          ) : (
            <div className="degraded-block">
              <strong>Access information is temporarily unavailable</strong>
              <ul>
                {accessPanelWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="stack-panel" aria-labelledby="settings-reminder-heading">
          <div className="stack-panel-head">
            <div className="stack-panel-head-text">
              <span className="label">Tertiary</span>
              <h2 id="settings-reminder-heading">Reminder coverage</h2>
            </div>
          </div>
          <dl className="reminder-metrics">
            <div><dt>Active rules</dt><dd>{activeRules?.length ?? 'Needs verification'}</dd></div>
            <div><dt>Inactive rules</dt><dd>{reminderRules ? reminderRules.length - (activeRules?.length ?? 0) : 'Needs verification'}</dd></div>
            <div><dt>Additional recipients</dt><dd>{additionalRecipients ?? 'Needs verification'}</dd></div>
          </dl>
          <p className="stack-panel-foot">Reminder rules are managed on individual compliance items so instructions and recipients stay tied to the work.</p>
        </section>
      </main>
    </div>
  );
}
