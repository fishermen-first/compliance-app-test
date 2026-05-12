import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { AccessDrawer } from '@/components/access-drawer';
import { NoAccessScreen } from '@/components/no-access-screen';
import { OwnerDrawer } from '@/components/owner-drawer';
import { WorkspaceBlockedScreen } from '@/components/workspace-blocked-screen';
import { type Database } from '@/lib/database.types';
import { accessRoleLabel } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type AppRole = Database['public']['Enums']['app_role'];

type SettingsProps = {
  searchParams?: { message?: string };
};

type CompanyRelation = {
  id: string;
  name: string;
  timezone: string | null;
};

type MembershipContextRow = {
  company_id: string;
  role: AppRole;
  companies?: CompanyRelation | CompanyRelation[] | null;
};

type AccessRow = {
  target_kind: 'membership' | 'invitation';
  target_id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole;
  status: string;
  owner_codes: string[] | null;
  app_admin_contamination: boolean | null;
  can_update_role: boolean | null;
  can_remove: boolean | null;
  can_cancel: boolean | null;
  can_update_owner_codes: boolean | null;
  can_clear_owner_codes: boolean | null;
  created_at: string;
};

type OwnerCodeRow = {
  code: string;
  display_name: string | null;
  records: number | null;
  is_assigned_to_current_user: boolean | null;
  is_visible_to_current_user: boolean | null;
};

type ReminderRuleRow = {
  id: string;
  active: boolean | null;
};

type RecipientRow = {
  recipient_email: string | null;
};

type RowStatus = {
  label: string;
  className: string;
  nextAction?: string;
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function ownerCodesFor(row: AccessRow) {
  return row.owner_codes ?? [];
}

function sortAccessRows(rows: AccessRow[]) {
  return [...rows].sort((a, b) => {
    if (a.target_kind !== b.target_kind) {
      return a.target_kind === 'membership' ? -1 : 1;
    }

    const aDate = new Date(a.created_at).getTime();
    const bDate = new Date(b.created_at).getTime();
    return a.target_kind === 'membership' ? aDate - bDate : bDate - aDate;
  });
}

function statusForOwner(owner: OwnerCodeRow, target: AccessRow | null, assignmentsReliable: boolean): RowStatus {
  if (!assignmentsReliable) {
    return { label: 'Needs verification', className: 'needs-verification' };
  }

  if (target?.app_admin_contamination) {
    return {
      label: 'Needs customer user',
      className: 'needs-customer',
      nextAction: 'Edit mapping to use a customer user email.'
    };
  }

  if (target?.target_kind === 'membership' && !target.email) {
    return { label: 'Needs profile email', className: 'needs-profile' };
  }

  if (target?.target_kind === 'membership') {
    return { label: 'Mapped', className: 'mapped' };
  }

  if (target?.target_kind === 'invitation') {
    return { label: 'Invite pending', className: 'invite-pending' };
  }

  if (owner.display_name) {
    return { label: 'Needs login email', className: 'needs-login' };
  }

  return { label: 'Unmapped', className: 'unmapped' };
}

function resolveNameFromOwnerCodes(row: AccessRow, allOwners: OwnerCodeRow[]) {
  const linked = ownerCodesFor(row)
    .map((code) => allOwners.find((owner) => owner.code === code))
    .filter(Boolean);
  const named = linked.find((owner) => owner?.display_name);

  return named?.display_name ?? null;
}

export default async function SettingsPage({ searchParams }: SettingsProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (isAppAdmin) {
    redirect('/admin');
  }

  const membershipsResult = await supabase
    .from('company_memberships')
    .select('company_id, role, companies(id, name, timezone)')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: true });

  if (membershipsResult.error || !membershipsResult.data || membershipsResult.data.length === 0) {
    return <NoAccessScreen email={userData.user.email} />;
  }

  const memberships = membershipsResult.data as unknown as MembershipContextRow[];

  if (memberships.length > 1) {
    return <WorkspaceBlockedScreen email={userData.user.email} />;
  }

  const membership = memberships[0];
  const company = relation(membership.companies);
  const companyId = membership.company_id;

  if (!['owner', 'office_admin'].includes(membership.role)) {
    return (
      <div className="app-shell">
        <AppSidebar
          companyName={company?.name ?? 'FF Compliance'}
          userRole={accessRoleLabel(membership.role)}
          activePath="/settings"
        />
        <main className="settings-setup-page">
          <section className="degraded-block">
            <strong>Customer admin access required.</strong>
            <p>Ask a workspace owner or FF Admin to review access settings.</p>
          </section>
        </main>
      </div>
    );
  }

  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const startOfWeekDate = startOfWeek.toISOString().slice(0, 10);
  const endOfWeekDate = endOfWeek.toISOString().slice(0, 10);

  const [
    accessRowsResult,
    ownerCodesResult,
    reminderRulesResult,
    recipientsResult,
    vesselsResult,
    itemsResult,
    itemsDueResult
  ] = await Promise.all([
    supabase.rpc('settings_get_access_rows', { target_company_id: companyId }),
    supabase.rpc('get_queue_owner_codes', { target_company_id: companyId }),
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
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('active', true),
    supabase
      .from('compliance_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    supabase
      .from('compliance_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('expiration_date', startOfWeekDate)
      .lt('expiration_date', endOfWeekDate)
      .neq('status', 'complete')
      .neq('status', 'discontinued')
  ]);

  const accessRows = accessRowsResult.error ? [] : ((accessRowsResult.data ?? []) as AccessRow[]);
  const ownerCodes = ownerCodesResult.error ? [] : ((ownerCodesResult.data ?? []) as OwnerCodeRow[]);
  const reminderRules = reminderRulesResult.error ? null : ((reminderRulesResult.data ?? []) as ReminderRuleRow[]);
  const recipients = recipientsResult.error ? null : ((recipientsResult.data ?? []) as RecipientRow[]);
  const activeRules = reminderRules?.filter((rule) => rule.active) ?? null;
  const additionalRecipients = recipients ? new Set(recipients.map((recipient) => recipient.recipient_email).filter(Boolean)).size : null;
  const assignmentsReliable = !accessRowsResult.error;
  const canShowAccessTable = !accessRowsResult.error;
  const canShowOwnerRows = !ownerCodesResult.error;
  const warnings = [
    accessRowsResult.error ? 'Customer access could not be loaded safely. Re-check users before changing owner mappings.' : null,
    ownerCodesResult.error ? 'Owner-code mapping could not be loaded safely.' : null,
    itemsResult.error ? 'Imported record counts could not be verified.' : null,
    itemsDueResult.error ? 'Items due this week could not be verified.' : null
  ].filter(Boolean) as string[];

  const accessByOwnerCode = new Map<string, AccessRow>();
  accessRows.forEach((row) => {
    ownerCodesFor(row).forEach((code) => {
      if (!accessByOwnerCode.has(code)) {
        accessByOwnerCode.set(code, row);
      }
    });
  });

  const ownerRows = ownerCodes.map((owner) => {
    const target = accessByOwnerCode.get(owner.code) ?? null;
    const status = statusForOwner(owner, target, assignmentsReliable);

    return {
      owner,
      target,
      status
    };
  });
  const mappedOwnerCount = ownerRows.filter((row) => ['Mapped', 'Invite pending'].includes(row.status.label)).length;
  const coverageLabel =
    ownerCodesResult.error || accessRowsResult.error
      ? 'Needs verification'
      : `${mappedOwnerCount} of ${ownerRows.length} mapped`;
  const itemsDueThisWeek = itemsDueResult.count ?? 0;
  const summaryCells = [
    { label: 'Workspace', value: company?.name ?? 'Workspace', small: true },
    { label: 'Timezone', value: formatTimezone(company?.timezone), small: true },
    { label: 'Active vessels', value: vesselsResult.error ? 'Needs verification' : String(vesselsResult.count ?? 0), needsVerification: Boolean(vesselsResult.error) },
    { label: 'Imported records', value: itemsResult.error ? 'Needs verification' : String(itemsResult.count ?? 0), needsVerification: Boolean(itemsResult.error) },
    { label: 'Items due this week', value: itemsDueResult.error ? 'Needs verification' : String(itemsDueThisWeek), needsVerification: Boolean(itemsDueResult.error) }
  ];
  const appAdminContaminationRows = accessRows.filter((row) => row.app_admin_contamination);
  const missingEmailRows = accessRows.filter((row) => row.target_kind === 'membership' && !row.email);
  const normalAccessRows = sortAccessRows(accessRows.filter((row) => row.email));
  const showFfAdminNote = appAdminContaminationRows.length > 0;
  const ownerDrawerRows = ownerRows.map(({ owner, target, status }) => ({
    code: owner.code,
    records: owner.records ?? 0,
    ownerDisplayName: owner.display_name,
    target: target ? {
      target_kind: target.target_kind,
      target_id: target.target_id,
      email: target.email,
      display_name: target.display_name,
      role: target.role,
      owner_codes: target.owner_codes ?? []
    } : null,
    status
  }));
  const accessDrawerRows = normalAccessRows.map((row) => ({
    target_kind: row.target_kind,
    target_id: row.target_id,
    email: row.email,
    display_name: row.display_name ?? resolveNameFromOwnerCodes(row, ownerCodes),
    role: row.role,
    owner_codes: row.owner_codes ?? [],
    app_admin_contamination: row.app_admin_contamination,
    can_update_role: row.can_update_role,
    can_remove: row.can_remove,
    can_cancel: row.can_cancel,
    can_update_owner_codes: row.can_update_owner_codes,
    can_clear_owner_codes: row.can_clear_owner_codes
  }));

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        activePath="/settings"
      />
      <main className="settings-setup-page">
        <header className="page-header">
          <p className="eyebrow">Settings</p>
          <h1>Workspace settings</h1>
          <p className="page-intro">Review access, owner-code mapping, and reminder coverage for this customer workspace.</p>
        </header>

        <dl className="summary-strip" aria-label="Workspace summary">
          {summaryCells.map((cell) => (
            <div className={`summary-cell${cell.needsVerification ? ' needs-verification' : ''}`} key={cell.label}>
              <dt>{cell.label}</dt>
              <dd className={cell.small ? 'text' : undefined}>{cell.value}</dd>
            </div>
          ))}
        </dl>

        {warnings.length > 0 ? (
          <section className="degraded-block" aria-label="Settings warnings">
            <strong>Settings need verification</strong>
            <ul>
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </section>
        ) : null}

        <section className="stack-panel" aria-labelledby="owner-code-heading">
          <div className="stack-panel-head">
            <div className="stack-panel-head-text">
              <span className="label">Workbook owner codes</span>
              <h2 id="owner-code-heading">Owner-code assignments</h2>
              <div className="meta">Click a row to review the mapped person and records.</div>
            </div>
            <span className="head-meta">{coverageLabel}</span>
          </div>
          {searchParams?.message ? <div className="inline-message" role="status">{searchParams.message}</div> : null}
          {showFfAdminNote ? (
            <p className="ff-admin-note">FF admins can inspect this workspace from the admin console. They are not customer workspace users.</p>
          ) : null}
          {canShowOwnerRows ? (
            ownerDrawerRows.length === 0 ? (
              <p className="panel-empty-copy">No owner initials found.</p>
            ) : (
              <div className="owner-rows" role="list">
                <div className="owner-rows-head" aria-hidden="true">
                  <span>Owner code</span>
                  <span>Records</span>
                  <span>Mapped person · Login email</span>
                  <span>Status</span>
                  <span aria-hidden="true"></span>
                </div>
                {ownerDrawerRows.map((row) => <OwnerDrawer key={row.code} row={row} />)}
              </div>
            )
          ) : (
            <p className="panel-empty-copy">Owner-code rows are hidden until mapping can be loaded safely.</p>
          )}
        </section>

        <section className="stack-panel" aria-labelledby="access-heading">
          <div className="stack-panel-head">
            <div className="stack-panel-head-text">
              <span className="label">People with access</span>
              <h2 id="access-heading">Workspace access</h2>
              <div className="meta">Click a person to manage their role, owner codes, or remove access.</div>
            </div>
            <button className="save-btn muted" type="button" disabled>Ask FF Admin to add a new user</button>
          </div>
          {canShowAccessTable ? (
            <>
              {appAdminContaminationRows.length > 0 ? (
                <div className="access-warnings">
                  <span className="label">FF Admin contamination</span>
                  <ul>
                    {appAdminContaminationRows.map((row) => (
                      <li key={`${row.target_kind}-${row.target_id}`}>{row.email ?? row.target_id} can only be canceled or cleared here.</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {missingEmailRows.length > 0 ? (
                <div className="access-warnings">
                  <span className="label">Needs profile email</span>
                  <ul>
                    {missingEmailRows.map((row) => <li key={row.target_id}>{row.display_name ?? row.target_id}</li>)}
                  </ul>
                </div>
              ) : null}
              {normalAccessRows.length === 0 ? (
                <p className="panel-empty-copy">No customer users have access yet.</p>
              ) : (
                <div className="access-rows" role="list">
                  <div className="access-rows-head" aria-hidden="true">
                    <span>Person · Email</span>
                    <span>Status</span>
                    <span>Role</span>
                    <span>Owner codes</span>
                    <span aria-hidden="true"></span>
                  </div>
                  {accessDrawerRows.map((row) => (
                    <AccessDrawer
                      key={`${row.target_kind}-${row.target_id}`}
                      row={row}
                      companyId={companyId}
                      ownerCodes={ownerCodes}
                      actorRole={membership.role}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="panel-empty-copy">Customer access is hidden until it can be loaded safely.</p>
          )}
        </section>

        <section className="stack-panel" aria-labelledby="settings-reminder-heading">
          <div className="stack-panel-head">
            <div className="stack-panel-head-text">
              <span className="label">Workspace</span>
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
