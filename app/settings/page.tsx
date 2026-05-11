import Link from 'next/link';
import { AppSidebar } from '@/components/app-sidebar';
import { getCustomerContext } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

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

type ItemRow = {
  id: string;
};

function formatTimezone(timezone?: string | null) {
  if (!timezone) return 'Not set';

  const labels: Record<string, string> = {
    'America/Los_Angeles': 'Pacific Time',
    'America/Anchorage': 'Alaska Time',
    'America/New_York': 'Eastern Time'
  };

  return labels[timezone] ?? timezone;
}

export default async function SettingsPage() {
  const { supabase, membership, company, isAppAdmin } = await getCustomerContext({ allowAppAdmin: true });
  const companyId = membership.company_id;
  const [reminderRulesResult, recipientsResult, vesselsResult, itemsResult] = await Promise.all([
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
      .select('id')
      .eq('company_id', companyId)
  ]);

  const reminderRules = reminderRulesResult.error ? null : ((reminderRulesResult.data ?? []) as ReminderRuleRow[]);
  const recipients = recipientsResult.error ? null : ((recipientsResult.data ?? []) as RecipientRow[]);
  const vessels = vesselsResult.error ? null : ((vesselsResult.data ?? []) as VesselRow[]);
  const items = itemsResult.error ? null : ((itemsResult.data ?? []) as ItemRow[]);
  const activeRules = reminderRules?.filter((rule) => rule.active) ?? null;
  const additionalRecipients = recipients ? new Set(recipients.map((recipient) => recipient.recipient_email).filter(Boolean)).size : null;
  const activeVessels = vessels?.filter((vessel) => vessel.active).length ?? null;
  const summaryCells = [
    { label: 'Workspace', value: company?.name ?? 'Workspace', small: true },
    { label: 'Timezone', value: formatTimezone(company?.timezone), small: true },
    { label: 'Active vessels', value: activeVessels === null ? 'Needs verification' : String(activeVessels), needsVerification: activeVessels === null },
    { label: 'Imported records', value: items === null ? 'Needs verification' : String(items.length), needsVerification: items === null }
  ];

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
          <h1>Workspace settings</h1>
          <p className="page-intro">Review workspace context and reminder coverage for this customer workspace.</p>
          {isAppAdmin ? (
            <Link className="role-banner" href={`/admin/customers/${companyId}/users`}>
              Manage as admin →
            </Link>
          ) : null}
        </header>

        <dl className="summary-strip" aria-label="Workspace summary">
          {summaryCells.map((cell) => (
            <div className={`summary-cell${cell.needsVerification ? ' needs-verification' : ''}`} key={cell.label}>
              <dt>{cell.label}</dt>
              <dd className={cell.small ? 'small-text' : undefined}>{cell.value}</dd>
            </div>
          ))}
        </dl>

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
