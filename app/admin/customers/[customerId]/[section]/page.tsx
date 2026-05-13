import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, ShieldAlert, UploadCloud } from 'lucide-react';
import { applyComplianceWorkbookImport, importComplianceWorkbook } from '@/app/actions/imports';
import { saveOwnerCodeMapping } from '@/app/actions/owner-codes';
import { queueCompanyReminders } from '@/app/actions/reminders';
import { getAdminCustomerWorkspace, type AdminCustomerWorkspace } from '@/lib/admin-customer-workspace';
import { customerRoleLabel } from '@/lib/customer-detail';
import { setOwnerCodeExemption } from '../users/actions';

type CustomerSectionPageProps = {
  params: { customerId: string; section: string };
  searchParams?: { message?: string };
};

const validSections = new Set(['overview', 'setup', 'import', 'codes', 'diagnostics', 'danger']);
const sectionAliases: Record<string, string> = {
  workbook: 'import',
  reminders: 'diagnostics',
  activity: 'diagnostics'
};

function formatDate(value: string | Date | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function statusChip(status: string) {
  if (['mapped', 'active', 'ready', 'sent', 'complete', 'exempt'].includes(status)) return 'ready';
  if (['failed', 'needs-email', 'danger', 'expired', 'invalid-admin-email'].includes(status)) return 'danger';
  if (['pending', 'queued', 'review', 'fix'].includes(status)) return 'attention';
  return 'info';
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="cd-tabhead">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="desc">{description}</p>
      </div>
      {action ? <div className="head-actions">{action}</div> : null}
    </header>
  );
}

function Metric({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="cd-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function Overview({ workspace }: { workspace: AdminCustomerWorkspace }) {
  const { customer, nextAction } = workspace;
  const done = customer.gates.filter((gate) => gate.done).length;

  return (
    <>
      <SectionHeader
        eyebrow="Overview"
        title="One screen for setup state and support risk"
        description="The landing page tells FF Admin what is blocked, what is safe, and where to go next."
        action={<Link className="cd-button primary" href={nextAction.href}>Continue setup <ArrowRight aria-hidden="true" /></Link>}
      />
      <section className="cd-body">
        <section className={`cd-next-action ${nextAction.tone}`}>
          <div>
            <p className="eyebrow">Next action</p>
            <h2>{nextAction.title}</h2>
            <p>{nextAction.detail}</p>
          </div>
          <Link className="cd-button primary" href={nextAction.href}>Open step</Link>
        </section>

        <div className="cd-progress-strip">
          {customer.gates.map((gate) => (
            <article key={gate.id} className={`cd-gate-card ${gate.done ? 'done' : gate.current ? 'current' : ''}`}>
              <span>{gate.label}</span>
              <strong>{gate.detail}</strong>
            </article>
          ))}
        </div>

        <div className="cd-metric-grid">
          <Metric label="Imported records" value={customer.itemCount} detail="Compliance items in this workspace" />
          <Metric label="Owner codes" value={`${done}/${customer.gates.length}`} detail="Handoff gates passed" />
          <Metric label="Users" value={customer.userCount} detail={`${customer.pendingInvitationCount} pending invite${customer.pendingInvitationCount === 1 ? '' : 's'}`} />
          <Metric label="Support risk" value={workspace.diagnostics.failedReminderCount + workspace.diagnostics.expiredInviteCount} detail="Failed reminders + expired invites" />
        </div>

        <div className="cd-section-grid">
          <section className="cd-panel">
            <div className="cd-panel-head">
              <h2>Customer workspaces</h2>
              <Link className="cd-button" href="/admin#new-customer">New customer</Link>
            </div>
            <div className="cd-list">
              <div className="cd-row head customer-row"><span>Customer</span><span>State</span><span>Next action</span><span>Users</span><span>Updated</span></div>
              {workspace.customerRows.map((row) => (
                <div className="cd-row customer-row" key={row.id}>
                  <strong>{row.name}</strong>
                  <span className={`cd-chip ${row.tone}`}>{row.state}</span>
                  <Link href={row.nextHref}>{row.nextAction}</Link>
                  <span>{row.users}</span>
                  <span>{row.updatedAt}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cd-panel">
            <div className="cd-panel-head">
              <h2>Recent activity</h2>
              <span className="cd-chip info">Audit trail</span>
            </div>
            <div className="cd-audit-timeline">
              {workspace.diagnostics.auditRows.length === 0 ? (
                <div className="cd-audit-item"><strong>No activity yet</strong><span>Audit rows will appear after imports, mapping, invites, and status changes.</span></div>
              ) : workspace.diagnostics.auditRows.map((row) => (
                <div className="cd-audit-item" key={row.id}>
                  <strong>{row.action.replaceAll('_', ' ')}</strong>
                  <span>{row.entity_type} · {formatDate(row.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}

function Setup({ workspace }: { workspace: AdminCustomerWorkspace }) {
  const { customer } = workspace;
  const steps = [
    { label: '1. Create workspace', status: 'ready', owner: 'FF Admin', action: 'Review overview', href: `/admin/customers/${customer.id}/overview`, done: true },
    { label: '2. Import workbook', status: customer.gates[0]?.done ? 'ready' : 'attention', owner: 'FF Admin', action: 'Open import review', href: `/admin/customers/${customer.id}/import`, done: customer.gates[0]?.done },
    { label: '3. Map owner codes', status: customer.gates[1]?.done ? 'ready' : 'attention', owner: 'FF Admin', action: 'Map missing codes', href: `/admin/customers/${customer.id}/codes`, done: customer.gates[1]?.done },
    { label: '4. Invite users', status: customer.gates[2]?.done ? 'ready' : 'info', owner: 'FF Admin', action: 'Review staged users', href: `/admin/customers/${customer.id}/users`, done: customer.gates[2]?.done },
    { label: '5. Verify first login', status: customer.gates[3]?.done ? 'ready' : 'attention', owner: 'FF Admin + customer', action: 'Check diagnostics', href: `/admin/customers/${customer.id}/diagnostics`, done: customer.gates[3]?.done }
  ];

  return (
    <>
      <SectionHeader
        eyebrow="Setup"
        title="Workflow-first onboarding"
        description="Each step exposes only the controls FF Admin needs before customer handoff."
      />
      <section className="cd-body">
        <div className="cd-list">
          <div className="cd-row head setup-row"><span>Step</span><span>Status</span><span>Owner</span><span>Action</span></div>
          {steps.map((step) => (
            <div className="cd-row setup-row" key={step.label}>
              <strong>{step.label}</strong>
              <span className={`cd-chip ${statusChip(step.status)}`}>{step.done ? 'Done' : step.status === 'info' ? 'Staged' : 'Blocked'}</span>
              <span>{step.owner}</span>
              <Link href={step.href}>{step.action}</Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ImportReview({ workspace }: { workspace: AdminCustomerWorkspace }) {
  const { customer, importReview } = workspace;
  const latest = importReview.latestRun;
  const safeRows = importReview.metrics.safeCreateCount + importReview.metrics.safeUpdateCount;
  const canApplySafeRows = latest?.mode === 'dry_run' && !latest.applied_run_id && safeRows > 0;

  return (
    <>
      <SectionHeader
        eyebrow="Import review"
        title="Make workbook risk visible before anyone logs in"
        description="Dry run first, review structured issues, then apply only rows that v2 classified as safe."
        action={
          <div className="cd-import-actions">
            <form action={importComplianceWorkbook} className="cd-inline-upload">
              <input type="hidden" name="companyId" value={customer.id} />
              <label className="cd-file-button">
                <UploadCloud aria-hidden="true" /> Upload workbook
                <input name="workbook" type="file" accept=".xlsx,.xls" required />
              </label>
              <button className="cd-button primary" type="submit">Dry run</button>
            </form>
            {latest?.mode === 'dry_run' ? (
              <form action={applyComplianceWorkbookImport} className="cd-inline-apply">
                <input type="hidden" name="companyId" value={customer.id} />
                <input type="hidden" name="importRunId" value={latest.id} />
                <button className="cd-button" type="submit" disabled={!canApplySafeRows}>Apply safe rows</button>
              </form>
            ) : null}
          </div>
        }
      />
      <section className="cd-body">
        <div className="cd-metric-grid">
          <Metric label={latest?.mode === 'dry_run' ? 'Rows parsed' : 'Rows imported'} value={importReview.metrics.importedRecords} detail={latest ? `From ${latest.sheet_name}` : 'No persisted import run yet'} />
          <Metric label="Safe rows" value={safeRows} detail={`${importReview.metrics.safeCreateCount} create · ${importReview.metrics.safeUpdateCount} update`} />
          <Metric label="Issues" value={importReview.metrics.issueCount || importReview.issues.length} detail={latest ? `${importReview.metrics.skippedCount} rows held for review` : 'Dry run to classify issues'} />
          <Metric label="Company-wide" value={importReview.metrics.companyWideCount} detail="Items without a vessel assignment" />
          <Metric label="Vessels found" value={importReview.metrics.vesselCount} detail="Active vessels in workspace" />
        </div>

        <div className="cd-section-grid">
          <section className="cd-panel">
            <div className="cd-panel-head">
              <h2>Latest import</h2>
              <span className={`cd-chip ${latest ? 'ready' : 'attention'}`}>{latest ? `${latest.mode} · ${latest.status}` : 'No run'}</span>
            </div>
            {latest ? (
              <div className="cd-audit-timeline">
                <div className="cd-audit-item"><strong>{latest.workbook_name ?? 'Workbook file'}</strong><span>{latest.record_count} records · {latest.owner_code_count} owner codes · {latest.warning_count} warnings</span></div>
                <div className="cd-audit-item"><strong>Run created</strong><span>{formatDate(latest.created_at)} · {latest.detected_format ?? 'legacy format'} · {latest.parser_version ?? 'legacy parser'}</span></div>
                <div className="cd-audit-item"><strong>Re-import behavior</strong><span>v2 matches by template key, prior source fingerprint, or conservative natural key. Row number is weak evidence only.</span></div>
              </div>
            ) : (
              <p className="muted">This workspace has imported data from before import v2. Upload a workbook to create a dry-run review before any apply.</p>
            )}
          </section>

          <section className="cd-panel">
            <div className="cd-panel-head">
              <h2>Structured issues</h2>
              <span className="cd-chip attention">{importReview.issues.length || importReview.warnings.length}</span>
            </div>
            <div className="cd-list">
              <div className="cd-row head warning-row"><span>Issue</span><span>Row</span><span>Severity</span></div>
              {importReview.issues.length > 0 ? importReview.issues.map((issue) => (
                <div className="cd-row warning-row" key={issue.id}>
                  <strong>{issue.message}</strong>
                  <span>{issue.source_row_number ?? '-'}</span>
                  <span className={`cd-chip ${statusChip(issue.severity)}`}>{issue.issue_type}</span>
                </div>
              )) : importReview.warnings.length === 0 ? (
                <div className="cd-row warning-row"><strong>No persisted issues</strong><span>-</span><span className="cd-chip ready">Clear</span></div>
              ) : importReview.warnings.map((warning) => (
                <div className="cd-row warning-row" key={warning.id}>
                  <strong>{warning.issue}</strong>
                  <span>{warning.row_number ?? '-'}</span>
                  <span className={`cd-chip ${statusChip(warning.severity)}`}>{warning.severity}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}

function OwnerCodes({ workspace }: { workspace: AdminCustomerWorkspace }) {
  const { customer } = workspace;

  return (
    <>
      <SectionHeader
        eyebrow="Owner codes"
        title="The bridge between workbook rows and customer queues"
        description="FF Admin maps workbook owner codes to customer emails, or records an explicit exception."
      />
      <section className="cd-body">
        <div className="cd-list cd-owner-code-list">
          <div className="cd-row head owner-row"><span>Code</span><span>Records</span><span>Person</span><span>Login email</span><span>Status</span><span>Action</span></div>
          {workspace.ownerCodeRows.map((owner) => (
            <div className="cd-row owner-row owner-edit-row" key={owner.id}>
              <strong>{owner.code}</strong>
              <span>{owner.records}</span>
              <form action={saveOwnerCodeMapping} className="cd-code-form">
                <input type="hidden" name="companyId" value={customer.id} />
                <input type="hidden" name="code" value={owner.code} />
                <input type="hidden" name="redirectTo" value={`/admin/customers/${customer.id}/codes`} />
                <input name="personName" defaultValue={owner.displayName ?? ''} placeholder="Person or desk" aria-label={`Person for ${owner.code}`} />
                <input name="loginEmail" type="email" defaultValue={owner.loginEmail ?? ''} placeholder="name@customer.com" aria-label={`Login email for ${owner.code}`} />
                <button className="cd-button" type="submit">Save</button>
              </form>
              <span className={`cd-chip ${statusChip(owner.status)}`}>{owner.status.replaceAll('-', ' ')}</span>
              <form action={setOwnerCodeExemption} className="cd-exempt-form">
                <input type="hidden" name="customerId" value={customer.id} />
                <input type="hidden" name="code" value={owner.code} />
                {owner.handoffExempt ? (
                  <>
                    <input type="hidden" name="handoffExempt" value="false" />
                    <button className="cd-button" type="submit">Clear exception</button>
                  </>
                ) : (
                  <>
                    <input type="hidden" name="handoffExempt" value="true" />
                    <input name="reason" placeholder="Exception reason" aria-label={`Exception reason for ${owner.code}`} />
                    <button className="cd-button" type="submit">Exempt</button>
                  </>
                )}
              </form>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Diagnostics({ workspace }: { workspace: AdminCustomerWorkspace }) {
  const { customer, diagnostics } = workspace;

  return (
    <>
      <SectionHeader
        eyebrow="Diagnostics"
        title="Support without impersonating blindly"
        description="Inspect reminder delivery, access state, recent changes, and computed queue visibility."
        action={
          <form action={queueCompanyReminders}>
            <input type="hidden" name="companyId" value={customer.id} />
            <button className="cd-button primary" type="submit">Queue due reminders</button>
          </form>
        }
      />
      <section className="cd-body">
        <div className="cd-metric-grid">
          <Metric label="Failed reminders" value={diagnostics.failedReminderCount} detail="From latest reminder log rows" />
          <Metric label="Pending invites" value={diagnostics.pendingInviteCount} detail={`${diagnostics.expiredInviteCount} expired`} />
          <Metric label="Invite failures" value={diagnostics.inviteFailures.length} detail="Per-invitation handoff send errors" />
          <Metric label="First login" value={diagnostics.firstLoginVerified ? 'Yes' : 'No'} detail="Derived from auth last sign-in" />
        </div>

        <div className="cd-section-grid">
          <section className="cd-panel">
            <div className="cd-panel-head"><h2>Reminder send log</h2><span className="cd-chip info">{diagnostics.reminderLogs.length}</span></div>
            <div className="cd-list">
              <div className="cd-row head diag-row"><span>Recipient</span><span>Subject</span><span>Status</span><span>Scheduled</span></div>
              {diagnostics.reminderLogs.length === 0 ? (
                <div className="cd-row diag-row"><strong>No reminder log rows</strong><span>-</span><span className="cd-chip info">None</span><span>-</span></div>
              ) : diagnostics.reminderLogs.map((log) => (
                <div className="cd-row diag-row" key={log.id}>
                  <strong>{log.recipient_email}</strong>
                  <span>{log.failure_reason ?? log.subject}</span>
                  <span className={`cd-chip ${statusChip(log.status)}`}>{log.status}</span>
                  <span>{formatDate(log.scheduled_for)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cd-panel">
            <div className="cd-panel-head"><h2>Invite send failures</h2><span className={`cd-chip ${diagnostics.inviteFailures.length > 0 ? 'danger' : 'ready'}`}>{diagnostics.inviteFailures.length}</span></div>
            <div className="cd-list">
              <div className="cd-row head invite-failure-row"><span>Email</span><span>Failure</span><span>Recorded</span></div>
              {diagnostics.inviteFailures.length === 0 ? (
                <div className="cd-row invite-failure-row"><strong>No invite failures</strong><span>-</span><span>-</span></div>
              ) : diagnostics.inviteFailures.map((failure) => (
                <div className="cd-row invite-failure-row" key={`${failure.invitationId}-${failure.createdAt}`}>
                  <strong>{failure.email ?? failure.invitationId}</strong>
                  <span>{failure.message}</span>
                  <span>{formatDate(failure.createdAt)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cd-panel" id="queue-visibility">
            <div className="cd-panel-head"><h2>Queue visibility</h2><span className="cd-chip ready">Computed</span></div>
            <div className="cd-list">
              <div className="cd-row head visibility-row"><span>User</span><span>Role</span><span>Owner codes</span><span>Visible records</span></div>
              {diagnostics.visibilityRows.length === 0 ? (
                <div className="cd-row visibility-row"><strong>No users staged</strong><span>-</span><span>-</span><span>0</span></div>
              ) : diagnostics.visibilityRows.map((row) => (
                <div className="cd-row visibility-row" key={`${row.email}-${row.label}`}>
                  <strong>{row.label}</strong>
                  <span>{customerRoleLabel[row.role]}</span>
                  <span>{row.codes.length > 0 ? row.codes.join(', ') : 'All/none'}</span>
                  <span>{row.visibleRecords}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}

function Danger({ workspace }: { workspace: AdminCustomerWorkspace }) {
  const { customer, danger } = workspace;

  return (
    <>
      <SectionHeader
        eyebrow="Danger zone"
        title="Destructive actions are explicit and rare"
        description="This implementation shows live preflight counts and guardrails only. It does not reset or delete customer data."
      />
      <section className="cd-body">
        <div className="cd-section-grid">
          <section className="cd-panel danger-panel">
            <div className="cd-panel-head">
              <h2>Reset imported workbook data</h2>
              <span className="cd-chip danger">Preflight only</span>
            </div>
            <div className="cd-danger-counts">
              <div><span>Customer ID</span><strong className="mono">{customer.id}</strong></div>
              <div><span>Items</span><strong>{danger.itemCount}</strong></div>
              <div><span>Vessels</span><strong>{danger.vesselCount}</strong></div>
              <div><span>Owner codes</span><strong>{danger.ownerCodeCount}</strong></div>
              <div><span>Active users</span><strong>{danger.activeUserCount}</strong></div>
              <div><span>Pending invites</span><strong>{danger.pendingInviteCount}</strong></div>
            </div>
            <button className="cd-button danger" type="button" disabled>
              <ShieldAlert aria-hidden="true" /> Reset not implemented
            </button>
          </section>

          <section className="cd-panel">
            <div className="cd-panel-head"><h2>Guardrails</h2><span className="cd-chip ready"><CheckCircle2 aria-hidden="true" /> Active</span></div>
            <div className="cd-audit-timeline">
              <div className="cd-audit-item"><strong>No silent deletes</strong><span>Any future destructive action must begin with row counts and exact IDs.</span></div>
              <div className="cd-audit-item"><strong>No open signup</strong><span>Customer users come through controlled FF Admin invite flow.</span></div>
              <div className="cd-audit-item"><strong>No guessed owner mappings</strong><span>Owner codes are explicit customer data from the workbook.</span></div>
            </div>
          </section>
        </div>
      </section>
    </>
  );
}

export default async function CustomerSectionPage({ params, searchParams }: CustomerSectionPageProps) {
  const alias = sectionAliases[params.section];
  if (alias) redirect(`/admin/customers/${params.customerId}/${alias}`);
  if (!validSections.has(params.section)) notFound();

  const workspace = await getAdminCustomerWorkspace(params.customerId);

  return (
    <>
      {searchParams?.message ? <div className="cd-inline-message" role="status">{searchParams.message}</div> : null}
      {params.section === 'overview' ? <Overview workspace={workspace} /> : null}
      {params.section === 'setup' ? <Setup workspace={workspace} /> : null}
      {params.section === 'import' ? <ImportReview workspace={workspace} /> : null}
      {params.section === 'codes' ? <OwnerCodes workspace={workspace} /> : null}
      {params.section === 'diagnostics' ? <Diagnostics workspace={workspace} /> : null}
      {params.section === 'danger' ? <Danger workspace={workspace} /> : null}
    </>
  );
}
