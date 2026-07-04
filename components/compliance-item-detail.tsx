import Link from 'next/link';
import { updateComplianceItemStatus } from '@/app/actions/items';
import { CompleteItemModal } from '@/components/complete-item-modal';
import { EditItemDetailsDrawer } from '@/components/edit-item-details-drawer';
import { ReminderScheduleDrawer } from '@/components/reminder-schedule-drawer';
import { StatusBadge } from '@/components/status-badge';
import {
  type ComplianceItem,
  daysUntil,
  displayState,
  formatDate,
  itemOwnerCodes,
  itemOwnersLabel,
  proposedNextDates,
  storedStatusLabels,
  todayIso
} from '@/lib/compliance';
import { itemVessel } from '@/lib/customer-data';

type ReminderRule = {
  label: string;
  trigger_type: string;
  days_before: number | null;
  repeat_every_days: number | null;
  send_on: string | null;
  audience?: string | null;
  active: boolean;
};

type ReminderRecipient = {
  recipient_name: string | null;
  recipient_email: string;
  recipient_type: string;
  external_contact_id?: string | null;
  contact_group_id?: string | null;
};

type ReminderLog = {
  recipient_email: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  failure_reason: string | null;
};

type VesselOption = {
  id: string;
  name: string;
};

type HistoryEntry = {
  from_status: string | null;
  to_status: string;
  notes: string | null;
  changed_at: string;
  profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

type OwnerOption = {
  code: string;
  display_name?: string | null;
};

type ReferenceContactOption = {
  id: string;
  name: string | null;
  email: string;
  active: boolean;
};

type ReferenceContactGroupOption = {
  id: string;
  name: string;
  members: Array<{ id: string; email: string; name: string | null }>;
};

function statusOptionLabel(value: string | null) {
  if (!value) return 'New';
  if (value in storedStatusLabels) return storedStatusLabels[value as keyof typeof storedStatusLabels];
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function actorLabel(entry: HistoryEntry) {
  const profile = relation(entry.profiles);
  return profile?.full_name ?? profile?.email ?? 'Unknown user';
}

function ruleFor(rules: ReminderRule[], triggerType: string, audience = 'owner') {
  return rules.find((rule) => rule.trigger_type === triggerType && (rule.audience ?? 'owner') === audience);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenIso(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function nextExpectedReminder(item: ComplianceItem, rules: ReminderRule[]) {
  const today = todayIso();
  const dates = rules.flatMap((rule) => {
    if (!rule.active) return [];
    if (rule.trigger_type === 'on_start_date' && item.start_working_on) return [item.start_working_on];
    if (rule.trigger_type === 'days_before_expiration' && item.expiration_date) {
      const date = addDays(item.expiration_date, -(rule.days_before ?? 0));
      return date ? [date] : [];
    }
    if (rule.trigger_type === 'repeat_after_start' && item.start_working_on && rule.repeat_every_days) {
      if (item.status === 'submitted') return [];
      const elapsed = daysBetweenIso(item.start_working_on, today);
      if (elapsed === null) return [];
      const interval = rule.repeat_every_days;
      const nextOffset = elapsed <= 0 ? 0 : Math.ceil(elapsed / interval) * interval;
      const date = addDays(item.start_working_on, nextOffset);
      return date ? [date] : [];
    }
    if (rule.trigger_type === 'on_specific_date' && rule.send_on) return [rule.send_on];
    return [];
  });

  return dates.filter((date) => date >= today).sort()[0] ?? null;
}

function uniqueNumbers(values: Array<number | null>) {
  return Array.from(new Set(values.filter((value): value is number => value !== null && value >= 0))).sort((a, b) => b - a);
}

function uniqueDates(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function joinLeadTimes(values: number[]) {
  if (values.length === 0) return '';
  if (values.length === 1) return `${values[0]}`;
  if (values.length === 2) return `${values[0]} & ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} & ${values[values.length - 1]}`;
}

function formatTimestamp(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function daysRemainingLabel(item: ComplianceItem) {
  if (item.status === 'complete') return item.completed_at ? `Completed ${formatDate(item.completed_at)}` : 'Complete';
  if (item.status === 'discontinued') return 'Did not renew';

  const days = daysUntil(item.expiration_date);
  if (days === null) return 'No expiration date';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}

function workflowIndex(item: ComplianceItem) {
  if (item.status === 'complete') return 4;
  if (item.status === 'submitted') return 3;
  if (item.status === 'in_progress') return 2;
  if (displayState(item) === 'Due') return 1;
  return 0;
}

function ownerOptionsWithCurrent(ownerOptions: OwnerOption[], item: ComplianceItem) {
  const map = new Map<string, OwnerOption>();
  ownerOptions.forEach((owner) => map.set(owner.code, owner));
  [...itemOwnerCodes(item), item.owner_current, item.owner_raw].forEach((code) => {
    if (code && !map.has(code)) map.set(code, { code });
  });
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function ComplianceItemDetail({
  item,
  history,
  reminderRules,
  recipients,
  reminderLogs,
  vessels,
  ownerOptions = [],
  referenceContacts = [],
  referenceContactGroups = [],
  canUpdateStatus,
  canCompleteItem,
  canEditCore,
  canManageReminders,
  rolledForwardHref,
  backHref,
  backLabel,
  itemPathPrefix
}: {
  item: ComplianceItem;
  history: HistoryEntry[];
  reminderRules: ReminderRule[];
  recipients: ReminderRecipient[];
  reminderLogs: ReminderLog[];
  vessels: VesselOption[];
  ownerOptions?: OwnerOption[];
  referenceContacts?: ReferenceContactOption[];
  referenceContactGroups?: ReferenceContactGroupOption[];
  canUpdateStatus: boolean;
  canCompleteItem: boolean;
  canEditCore: boolean;
  canManageReminders: boolean;
  rolledForwardHref?: string;
  backHref: string;
  backLabel: string;
  itemPathPrefix: string;
}) {
  const nextDates = proposedNextDates(item);
  const canCreateNext = Boolean(nextDates.nextExpirationDate);
  const canCompleteNow = canCompleteItem && !['complete', 'discontinued'].includes(item.status);
  const ownerReminderRules = reminderRules.filter((rule) => (rule.audience ?? 'owner') === 'owner');
  const externalReminderRules = reminderRules.filter((rule) => rule.audience === 'external');
  const startRule = ruleFor(reminderRules, 'on_start_date');
  const expirationRules = ownerReminderRules.filter((rule) => rule.trigger_type === 'days_before_expiration');
  const activeExpirationLeadTimes = uniqueNumbers(expirationRules.filter((rule) => rule.active).map((rule) => rule.days_before));
  const repeatRule = ruleFor(reminderRules, 'repeat_after_start');
  const oneOffDates = uniqueDates(ownerReminderRules
    .filter((rule) => rule.trigger_type === 'on_specific_date' && rule.active)
    .map((rule) => rule.send_on));
  const externalRecipients = recipients.filter((recipient) => ['additional', 'external', 'group'].includes(recipient.recipient_type));
  const activeExternalRules = externalReminderRules.filter((rule) => rule.active);
  const latestReminder = reminderLogs[0];
  const nextReminder = nextExpectedReminder(item, reminderRules);
  const currentStep = workflowIndex(item);
  const statusFormId = `status-${item.id}`;
  const availableOwnerOptions = ownerOptionsWithCurrent(ownerOptions, item);
  const workflowSteps = [
    { label: 'Not due yet', copy: 'Waiting for the start-working date.' },
    { label: 'Due', copy: 'Office work can start.' },
    { label: 'In progress', copy: 'Renewal or filing is underway.' },
    { label: 'Submitted', copy: item.agency_type ? 'Waiting on outside confirmation.' : 'Skipped - internal item.' },
    { label: 'Complete', copy: 'Evidence saved and rolled forward.' }
  ];

  return (
    <section className="detail-panel item-redesign">
      <div className="item-hero">
        <div>
          <Link className="secondary-link" href={backHref}>{backLabel}</Link>
          <h1>{item.item_name}</h1>
          <div className="item-meta-line">
            <span>{itemVessel(item)}</span>
            <span className="own-chip">{itemOwnersLabel(item)}</span>
            <span>{item.agency_type ?? 'No agency'}</span>
            <span>{item.frequency_label ?? 'No frequency'}</span>
          </div>
        </div>
        <div className="item-status-top">
          <StatusBadge item={item} />
          <span className="days-remaining">{daysRemainingLabel(item)}</span>
        </div>
      </div>

      {!canUpdateStatus && !canCompleteNow && !canEditCore ? (
        <section className="owner-notice-panel setup-warning-panel item-access-notice">
          <strong>Read only</strong>
          <span>Your login is not mapped to this item owner code. A workspace owner can update it or map your owner code.</span>
        </section>
      ) : null}

      {rolledForwardHref ? (
        <section className="owner-notice-panel item-access-notice">
          <strong>Completed</strong>
          <span>This record was marked complete and the next cycle was created.</span>
          <Link href={rolledForwardHref}>Open next record</Link>
        </section>
      ) : null}

      <div className="wf-strip" aria-label="Compliance workflow">
        {workflowSteps.map((step, index) => (
          <article className={`step${index < currentStep ? ' is-past' : ''}${index === currentStep ? ' is-now' : ''}`} key={step.label}>
            <b>{step.label}</b>
            <span>{step.copy}</span>
          </article>
        ))}
      </div>

      <div className="detail-layout">
        <div className="primary-detail-column">
          {(canUpdateStatus || canCompleteNow) ? (
            <article className="detail-card act-card">
              <div>
                <p className="eyebrow">Update status</p>
                <h2>Status and note</h2>
              </div>
              {canUpdateStatus ? (
                <form action={updateComplianceItemStatus} id={statusFormId}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
                </form>
              ) : null}
              <div className="stbtns">
                {canUpdateStatus ? (
                  <>
                    <label>
                      <input form={statusFormId} name="status" type="radio" value="in_progress" defaultChecked={item.status === 'in_progress'} />
                      <span>In progress</span>
                      <small>Working it now</small>
                    </label>
                    <label>
                      <input form={statusFormId} name="status" type="radio" value="submitted" defaultChecked={item.status === 'submitted'} />
                      <span>Submitted</span>
                      <small>Waiting outside</small>
                    </label>
                  </>
                ) : null}
                {canCompleteNow ? (
                  <CompleteItemModal
                    itemId={item.id}
                    itemName={item.item_name}
                    itemPathPrefix={itemPathPrefix}
                    canEditCore={canEditCore}
                    canCreateNext={canCreateNext}
                    nextStartWorkingOn={nextDates.nextStartWorkingOn}
                    nextExpirationDate={nextDates.nextExpirationDate}
                    completionDateDefault={todayIso()}
                  />
                ) : null}
              </div>
              {canUpdateStatus ? (
                <>
                  <textarea className="note-input" form={statusFormId} name="notes" placeholder="waiting on check from accounting; mailed with check #4412" rows={3} />
                  <p className="last-note">Last note: {item.status_notes || 'No status note yet.'}</p>
                  <button form={statusFormId} type="submit">Save status</button>
                </>
              ) : null}
            </article>
          ) : null}

          <article className="detail-card">
            <div className="panel-heading" style={{ padding: 0, borderBottom: 0 }}>
              <div>
                <p className="eyebrow">Details</p>
                <h2>Record definition</h2>
              </div>
              {canEditCore ? (
                <EditItemDetailsDrawer
                  item={item}
                  itemPathPrefix={itemPathPrefix}
                  vessels={vessels}
                  ownerOptions={availableOwnerOptions}
                />
              ) : null}
            </div>
            <dl className="definition-grid">
              <div><dt>Vessel</dt><dd>{itemVessel(item)}</dd></div>
              <div><dt>Owner</dt><dd>{itemOwnersLabel(item)}</dd></div>
              <div><dt>Agency</dt><dd>{item.agency_type ?? '-'}</dd></div>
              <div><dt>Item #</dt><dd>{item.item_number ?? '-'}</dd></div>
              <div><dt>Frequency</dt><dd>{item.frequency_label ?? '-'}</dd></div>
              <div><dt>Dates</dt><dd>{formatDate(item.start_working_on)} to {formatDate(item.expiration_date)}</dd></div>
              <div><dt>Compliance area</dt><dd>{item.compliance_area ?? 'Other'}</dd></div>
              <div><dt>SharePoint</dt><dd>{item.sharepoint_url ? <a href={item.sharepoint_url}>Open document</a> : '-'}</dd></div>
              <div><dt>Standing instructions</dt><dd>{item.instructions || '-'}</dd></div>
            </dl>
          </article>
        </div>

        <aside className="detail-right-rail">
          <article className="detail-card">
            <p className="eyebrow">Reminders</p>
            <ul className="reminder-card-list">
              <li><strong>Start-working reminder</strong><span className="send-pill">{startRule?.active ? 'Active' : 'Off'}</span></li>
              <li><strong>Before-expiration reminder</strong><span>{activeExpirationLeadTimes.length ? `${joinLeadTimes(activeExpirationLeadTimes)} days before` : 'Off'}</span></li>
              <li><strong>One-off dates</strong><span>{oneOffDates.length ? oneOffDates.map((date) => formatDate(date)).join(', ') : 'None'}</span></li>
              <li><strong>External-copy recipients</strong><span>{externalRecipients.length}</span></li>
              <li><strong>External reminder rules</strong><span>{activeExternalRules.length ? 'Active' : 'Off'}</span></li>
              <li><strong>Next scheduled</strong><span>{nextReminder ? formatDate(nextReminder) : 'None'}</span></li>
              <li><strong>Latest send</strong><span>{latestReminder ? `${statusOptionLabel(latestReminder.status)} - ${formatTimestamp(latestReminder.sent_at ?? latestReminder.scheduled_for)}` : 'None logged'}</span></li>
            </ul>
            <p className="carry-note">These settings carry over automatically when this item rolls forward.</p>
            {canManageReminders ? (
              <ReminderScheduleDrawer
                itemId={item.id}
                itemName={item.item_name}
                itemPathPrefix={itemPathPrefix}
                itemVesselName={itemVessel(item)}
                ownerCode={itemOwnersLabel(item)}
                startWorkingOn={item.start_working_on}
                expirationDate={item.expiration_date}
                instructions={item.instructions}
                reminderRules={reminderRules}
                additionalRecipients={externalRecipients}
                referenceContacts={referenceContacts}
                referenceContactGroups={referenceContactGroups}
                today={todayIso()}
              />
            ) : null}
          </article>

          <article className="detail-card">
            <p className="eyebrow">History</p>
            {history.length === 0 ? <p>No status changes recorded yet.</p> : null}
            {history.map((entry, index) => (
              <div className={`tl-ev${index === 0 ? ' is-current' : ''}`} key={`${entry.changed_at}-${entry.to_status}`}>
                <span className="dot" />
                <div>
                  <strong>{statusOptionLabel(entry.from_status)} to {statusOptionLabel(entry.to_status)}</strong>
                  <div className="who">{new Date(entry.changed_at).toLocaleString()} / {actorLabel(entry)}</div>
                  {entry.notes ? <p>{entry.notes}</p> : null}
                </div>
              </div>
            ))}
          </article>
        </aside>
      </div>
    </section>
  );
}
