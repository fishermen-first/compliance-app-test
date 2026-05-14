import Link from 'next/link';
import { completeComplianceItem, saveComplianceItemReminders, updateComplianceItemCore, updateComplianceItemStatus } from '@/app/actions/items';
import {
  type ComplianceItem,
  displayState,
  formatDate,
  proposedNextDates,
  stateClassName,
  todayIso
} from '@/lib/compliance';
import { itemVessel } from '@/lib/customer-data';

type ReminderRule = {
  label: string;
  trigger_type: string;
  days_before: number | null;
  repeat_every_days: number | null;
  active: boolean;
};

type ReminderRecipient = {
  recipient_name: string | null;
  recipient_email: string;
  recipient_type: string;
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

function statusOptionLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function actorLabel(entry: HistoryEntry) {
  const profile = relation(entry.profiles);
  return profile?.full_name ?? profile?.email ?? 'Unknown user';
}

function ruleFor(rules: ReminderRule[], triggerType: string) {
  return rules.find((rule) => rule.trigger_type === triggerType);
}

function blankRecipientRows(count: number) {
  return Array.from({ length: count }, (_, index) => `blank-${index}`);
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
      const elapsed = daysBetweenIso(item.start_working_on, today);
      if (elapsed === null) return [];
      const interval = rule.repeat_every_days;
      const nextOffset = elapsed <= 0 ? 0 : Math.ceil(elapsed / interval) * interval;
      const date = addDays(item.start_working_on, nextOffset);
      return date ? [date] : [];
    }
    return [];
  });

  return dates.filter((date) => date >= today).sort()[0] ?? null;
}

function formatTimestamp(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function ComplianceItemDetail({
  item,
  history,
  reminderRules,
  recipients,
  reminderLogs,
  vessels,
  canUpdateStatus,
  canCompleteItem,
  canEditCore,
  canManageReminders,
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
  canUpdateStatus: boolean;
  canCompleteItem: boolean;
  canEditCore: boolean;
  canManageReminders: boolean;
  backHref: string;
  backLabel: string;
  itemPathPrefix: string;
}) {
  const state = displayState(item);
  const nextDates = proposedNextDates(item);
  const canCreateNext = Boolean(nextDates.nextExpirationDate);
  const startRule = ruleFor(reminderRules, 'on_start_date');
  const expirationRule = ruleFor(reminderRules, 'days_before_expiration');
  const repeatRule = ruleFor(reminderRules, 'repeat_after_start');
  const additionalRecipients = recipients.filter((recipient) => recipient.recipient_type === 'additional');
  const latestReminder = reminderLogs[0];
  const nextReminder = nextExpectedReminder(item, reminderRules);

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <Link className="secondary-link" href={backHref}>{backLabel}</Link>
          <p className="eyebrow">{itemVessel(item)} / {item.owner_raw ?? item.owner_current ?? 'Unassigned'}</p>
          <h1>{item.item_name}</h1>
        </div>
        <span className={`status-chip state-${stateClassName(state)}`}>{state}</span>
      </div>

      {!canUpdateStatus && !canCompleteItem && !canEditCore ? (
        <section className="owner-notice-panel setup-warning-panel item-access-notice">
          <strong>Read only</strong>
          <span>Your login is not mapped to this item owner code. A workspace owner can update it or map your owner code.</span>
        </section>
      ) : null}

      <section className="detail-grid">
        <article>
          <span>Owner</span>
          <strong>{item.owner_current ?? 'Unassigned'}</strong>
        </article>
        <article>
          <span>Start working on</span>
          <strong>{formatDate(item.start_working_on)}</strong>
        </article>
        <article>
          <span>Expiration date</span>
          <strong>{formatDate(item.expiration_date)}</strong>
        </article>
        <article>
          <span>Frequency</span>
          <strong>{item.frequency_label ?? 'None'}</strong>
        </article>
      </section>

      <section className="workflow-steps" aria-label="Compliance workflow">
        {[
          ['not_started', 'Not started', 'Waiting for the start-working date or owner pickup.'],
          ['in_progress', 'In progress', 'Renewal, filing, audit, or exercise is being worked.'],
          ['submitted', 'Submitted', 'Waiting on agency, auditor, certifier, or confirmation.'],
          ['complete', 'Complete', 'Evidence saved and next recurrence created if needed.']
        ].map(([value, label, copy]) => (
          <article className={item.status === value ? 'active' : ''} key={value}>
            <strong>{label}</strong>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="detail-two-col">
        <div className="detail-card">
          <p className="eyebrow">Current notes</p>
          <p>{item.status_notes || 'No status notes yet.'}</p>
          <p className="eyebrow">Instructions</p>
          <p>{item.instructions || 'No instructions saved.'}</p>
          {item.sharepoint_url ? <p><a href={item.sharepoint_url}>Open SharePoint link</a></p> : null}
        </div>

        {canManageReminders ? (
          <div className="detail-card">
            <p className="eyebrow">Reminder settings</p>
            <ul className="reminder-summary-list">
              {reminderRules.length === 0 ? <li>No reminder rules yet.</li> : null}
              {reminderRules.map((rule) => (
                <li key={`${rule.label}-${rule.trigger_type}`}>
                  <strong>{rule.label}</strong>
                  <span>{rule.active ? 'Active' : 'Inactive'}</span>
                </li>
              ))}
            </ul>
            <p className="eyebrow">Additional recipients</p>
            <ul className="reminder-summary-list">
              {additionalRecipients.length === 0 ? <li>No additional recipients yet.</li> : null}
              {additionalRecipients.map((recipient) => (
                <li key={recipient.recipient_email}>
                  <strong>{recipient.recipient_name || recipient.recipient_email}</strong>
                  <span>{recipient.recipient_email}</span>
                </li>
              ))}
            </ul>
            <p className="eyebrow">Latest send</p>
            <p>{latestReminder ? `${statusOptionLabel(latestReminder.status)} / ${formatTimestamp(latestReminder.sent_at ?? latestReminder.scheduled_for)}` : 'No reminder sends logged yet.'}</p>
            {latestReminder?.failure_reason ? <p>{latestReminder.failure_reason}</p> : null}
            <p className="eyebrow">Next expected reminder</p>
            <p>{nextReminder ? formatDate(nextReminder) : 'No upcoming reminder from active rules.'}</p>
          </div>
        ) : null}
      </section>

      {canEditCore ? (
        <form action={updateComplianceItemCore} className="detail-card status-form item-core-editor">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
          <div>
            <p className="eyebrow">Core record</p>
            <h2>Edit compliance item</h2>
          </div>
          <label className="wide-field">
            Item name
            <input name="itemName" defaultValue={item.item_name} required />
          </label>
          <label>
            Owner
            <input name="ownerRaw" defaultValue={item.owner_raw ?? ''} placeholder="SN, ES, MA" />
          </label>
          <label>
            Owner for filters
            <input name="ownerCurrent" defaultValue={item.owner_current ?? ''} placeholder="SN" />
          </label>
          <label>
            Vessel
            <select name="vesselId" defaultValue={item.vessel_id ?? ''}>
              <option value="">Company-wide</option>
              {vessels.map((vessel) => <option value={vessel.id} key={vessel.id}>{vessel.name}</option>)}
            </select>
          </label>
          <label>
            Item number
            <input name="itemNumber" defaultValue={item.item_number ?? ''} />
          </label>
          <label>
            Agency / Type
            <input name="agencyType" defaultValue={item.agency_type ?? ''} />
          </label>
          <label>
            Compliance area
            <input name="complianceArea" defaultValue={item.compliance_area ?? 'Other'} required />
          </label>
          <label>
            Frequency
            <input name="frequencyLabel" defaultValue={item.frequency_label ?? ''} />
          </label>
          <label>
            Recurrence unit
            <select name="recurrenceUnit" defaultValue={item.recurrence_unit}>
              <option value="none">None</option>
              <option value="manual">Manual</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </label>
          <label>
            Recurrence interval
            <input name="recurrenceInterval" type="number" min="1" defaultValue={item.recurrence_interval ?? ''} />
          </label>
          <label>
            Start working on
            <input name="startWorkingOn" type="date" defaultValue={item.start_working_on ?? ''} />
          </label>
          <label>
            Expiration date
            <input name="expirationDate" type="date" defaultValue={item.expiration_date ?? ''} />
          </label>
          <label className="wide-field">
            Status notes
            <textarea name="statusNotes" rows={3} defaultValue={item.status_notes ?? ''} />
          </label>
          <label className="wide-field">
            Instructions
            <textarea name="instructions" rows={4} defaultValue={item.instructions ?? ''} />
          </label>
          <label className="wide-field">
            SharePoint link
            <input name="sharepointUrl" type="url" defaultValue={item.sharepoint_url ?? ''} />
          </label>
          <button type="submit">Save item details</button>
        </form>
      ) : null}

      {canUpdateStatus || canCompleteItem ? (
        <section className="detail-two-col">
          {canUpdateStatus ? (
            <form action={updateComplianceItemStatus} className="detail-card status-form">
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
              <p className="eyebrow">Update status</p>
              <label>
                Status
                <select name="status" defaultValue={item.status}>
                  {['not_started', 'in_progress', 'submitted', 'discontinued'].map((status) => <option value={status} key={status}>{statusOptionLabel(status)}</option>)}
                </select>
              </label>
              <label>
                Status notes
                <textarea name="notes" rows={4} placeholder="Add progress notes, submission details, or reason discontinued." />
              </label>
              <button type="submit">Save status</button>
            </form>
          ) : null}

          {canCompleteItem ? (
            <form action={completeComplianceItem} className="detail-card status-form">
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
              {!canEditCore && canCreateNext ? <input type="hidden" name="createNext" value="on" /> : null}
              {!canEditCore && canCreateNext && nextDates.nextStartWorkingOn ? <input type="hidden" name="nextStartWorkingOn" value={nextDates.nextStartWorkingOn} /> : null}
              {!canEditCore && canCreateNext && nextDates.nextExpirationDate ? <input type="hidden" name="nextExpirationDate" value={nextDates.nextExpirationDate} /> : null}
              <p className="eyebrow">Complete and roll forward</p>
              <label>
                Completion date
                <input name="completionDate" type="date" defaultValue={todayIso()} required />
              </label>
              <label>
                Final notes
                <textarea name="finalNotes" rows={3} placeholder="Final confirmation, certificate filed, or document location." />
              </label>
              {canEditCore ? (
                <>
                  <label className="checkbox-row">
                    <input name="createNext" type="checkbox" defaultChecked={canCreateNext} disabled={!canCreateNext} />
                    Create next item from recurrence
                  </label>
                  <label>
                    Next start working on
                    <input name="nextStartWorkingOn" type="date" defaultValue={nextDates.nextStartWorkingOn ?? ''} disabled={!canCreateNext} />
                  </label>
                  <label>
                    Next expiration date
                    <input name="nextExpirationDate" type="date" defaultValue={nextDates.nextExpirationDate ?? ''} disabled={!canCreateNext} />
                  </label>
                </>
              ) : (
                <p className="form-note">{canCreateNext ? 'The next recurring item will use the saved recurrence dates.' : 'No recurring item will be created because this item has no automatic recurrence.'}</p>
              )}
              <button type="submit">Mark complete</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {canManageReminders ? (
        <form action={saveComplianceItemReminders} className="detail-card status-form reminder-editor-form">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
          <div>
            <p className="eyebrow">Reminder rules</p>
            <h2>Instructions and recipients</h2>
          </div>
          <label>
            Instructions
            <textarea name="instructions" rows={4} defaultValue={item.instructions ?? ''} placeholder="Standing instructions included in reminder emails." />
          </label>
          <div className="reminder-rule-grid">
            <label className="checkbox-row">
              <input name="startRuleActive" type="checkbox" defaultChecked={startRule?.active ?? true} />
              Start date
            </label>
            <label className="checkbox-row">
              <input name="expirationRuleActive" type="checkbox" defaultChecked={expirationRule?.active ?? true} />
              Before expiration
            </label>
            <label>
              Days before
              <input name="expirationDaysBefore" type="number" min="0" defaultValue={expirationRule?.days_before ?? 14} />
            </label>
            <label className="checkbox-row">
              <input name="repeatRuleActive" type="checkbox" defaultChecked={repeatRule?.active ?? false} />
              Repeat after start
            </label>
            <label>
              Repeat every days
              <input name="repeatEveryDays" type="number" min="1" defaultValue={repeatRule?.repeat_every_days ?? ''} />
            </label>
          </div>
          <div className="recipient-editor-grid" aria-label="Additional reminder recipients">
            <span>Name</span>
            <span>Email</span>
            {additionalRecipients.map((recipient) => (
              <div className="recipient-editor-row" key={recipient.recipient_email}>
                <input name="additionalRecipientName" defaultValue={recipient.recipient_name ?? ''} placeholder="Name" />
                <input name="additionalRecipientEmail" type="email" defaultValue={recipient.recipient_email} placeholder="email@company.com" />
              </div>
            ))}
            {blankRecipientRows(2).map((key) => (
              <div className="recipient-editor-row" key={key}>
                <input name="additionalRecipientName" placeholder="Name" />
                <input name="additionalRecipientEmail" type="email" placeholder="email@company.com" />
              </div>
            ))}
          </div>
          <label>
            Add recipients by line
            <textarea name="additionalRecipients" rows={3} placeholder="name@company.com or Name <name@company.com>" />
          </label>
          <button type="submit">Save reminders</button>
        </form>
      ) : null}

      <section className="detail-card">
        <p className="eyebrow">Status history</p>
        {history.length === 0 ? <p>No status changes recorded yet.</p> : null}
        <ul className="history-list">
          {history.map((entry) => (
            <li key={`${entry.changed_at}-${entry.to_status}`}>
              <strong>{statusOptionLabel(entry.from_status ?? 'new')} -&gt; {statusOptionLabel(entry.to_status)}</strong>
              <span>{new Date(entry.changed_at).toLocaleString()} / {actorLabel(entry)}</span>
              {entry.notes ? <p>{entry.notes}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
