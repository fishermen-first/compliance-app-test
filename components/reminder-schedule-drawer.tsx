'use client';

import { useMemo, useState } from 'react';
import { CalendarPlus, Pencil, X } from 'lucide-react';
import { saveComplianceItemReminders } from '@/app/actions/items';
import { formatDate, shortDate } from '@/lib/compliance';

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

type EditableRecipient = {
  kind: 'direct' | 'contact' | 'group';
  name: string;
  email: string;
  externalContactId?: string | null;
  contactGroupId?: string | null;
  memberCount?: number;
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

type ScheduleEntry = {
  iso: string;
  title: string;
  sub: string;
  kind: 'kickoff' | 'deadline' | 'recurring' | 'oneoff';
  leadTime?: number;
};

type ScheduleEntryWithStatus = ScheduleEntry & {
  past: boolean;
  status: 'past' | 'next' | 'scheduled';
};

type ScheduleState = {
  startActive: boolean;
  expirationActive: boolean;
  leadTimes: number[];
  repeatActive: boolean;
  repeatEveryDays: number;
  oneOffDates: string[];
};

type AddMode = 'specific' | 'deadline' | 'recurring';

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function uniqueNumbers(values: Array<number | null>) {
  return Array.from(new Set(values.filter((value): value is number => value !== null && value >= 0))).sort((a, b) => b - a);
}

function uniqueDates(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function isPast(value: string, today: string) {
  return value < today;
}

function splitShortDate(value: string) {
  const [month, day] = shortDate(value).split(' ');
  return { month: month?.toUpperCase() ?? '', day: day ?? '' };
}

function positiveIntegerDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeIntegerDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function buildSchedule(
  state: ScheduleState,
  item: { startWorkingOn: string | null; expirationDate: string | null },
  today: string
): ScheduleEntryWithStatus[] {
  const out: ScheduleEntry[] = [];

  if (state.startActive && item.startWorkingOn) {
    out.push({
      iso: item.startWorkingOn,
      title: 'Start-working reminder',
      sub: 'Sent when office work opens',
      kind: 'kickoff'
    });
  }

  if (state.expirationActive && item.expirationDate) {
    [...state.leadTimes].sort((a, b) => b - a).forEach((leadTime) => {
      const iso = addDays(item.expirationDate!, -leadTime);
      if (!iso) return;
      out.push({
        iso,
        title: 'Deadline reminder',
        sub: `${leadTime} days before the ${shortDate(item.expirationDate)} expiration`,
        kind: 'deadline',
        leadTime
      });
    });
  }

  if (state.repeatActive && item.startWorkingOn && item.expirationDate && state.repeatEveryDays > 0) {
    let current = addDays(item.startWorkingOn, state.repeatEveryDays);
    let guard = 0;
    while (current && current <= item.expirationDate && guard < 60) {
      out.push({
        iso: current,
        title: 'Recurring nudge',
        sub: `Every ${state.repeatEveryDays} days while the item remains open`,
        kind: 'recurring'
      });
      current = addDays(current, state.repeatEveryDays);
      guard += 1;
    }
  }

  state.oneOffDates.forEach((iso) => {
    out.push({
      iso,
      title: 'Manual reminder',
      sub: 'Added to this cycle by hand',
      kind: 'oneoff'
    });
  });

  out.sort((a, b) => a.iso.localeCompare(b.iso));

  let nextMarked = false;
  return out.map((entry) => {
    const past = isPast(entry.iso, today);
    let status: ScheduleEntryWithStatus['status'] = 'scheduled';
    if (past) {
      status = 'past';
    } else if (!nextMarked) {
      status = 'next';
      nextMarked = true;
    }

    return { ...entry, past, status };
  });
}

function initialSchedule(reminderRules: ReminderRule[], audience: 'owner' | 'external' = 'owner'): ScheduleState {
  const rules = reminderRules.filter((rule) => (rule.audience ?? 'owner') === audience);
  const defaultActive = audience === 'owner';
  const startRule = rules.find((rule) => rule.trigger_type === 'on_start_date');
  const deadlineRules = rules.filter((rule) => rule.trigger_type === 'days_before_expiration');
  const repeatRule = rules.find((rule) => rule.trigger_type === 'repeat_after_start');
  const activeDeadlineRules = deadlineRules.filter((rule) => rule.active);
  const storedLeadTimes = uniqueNumbers(activeDeadlineRules.map((rule) => rule.days_before));
  const fallbackLeadTimes = audience === 'owner' && deadlineRules.length === 0 ? [14] : [];

  return {
    startActive: startRule?.active ?? defaultActive,
    expirationActive: deadlineRules.length === 0 ? defaultActive : deadlineRules.some((rule) => rule.active),
    leadTimes: storedLeadTimes.length ? storedLeadTimes : fallbackLeadTimes,
    repeatActive: repeatRule?.active ?? false,
    repeatEveryDays: repeatRule?.repeat_every_days && repeatRule.repeat_every_days > 0 ? repeatRule.repeat_every_days : 14,
    oneOffDates: uniqueDates(
      rules
        .filter((rule) => rule.trigger_type === 'on_specific_date' && rule.active)
        .map((rule) => rule.send_on)
    )
  };
}

function ScheduleToggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button className={`schedule-toggle${checked ? ' is-on' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange}>
      <span />
    </button>
  );
}

function ScheduleTag({ entry }: { entry: ScheduleEntryWithStatus }) {
  const label = entry.status === 'past'
    ? 'Past'
    : entry.status === 'next'
      ? 'Next up'
      : 'Scheduled';

  return <span className={`schedule-tag is-${entry.status}`}>{label}</span>;
}

export function ReminderScheduleDrawer({
  itemId,
  itemName,
  itemPathPrefix,
  itemVesselName,
  ownerCode,
  startWorkingOn,
  expirationDate,
  instructions,
  reminderRules,
  additionalRecipients,
  referenceContacts,
  referenceContactGroups,
  today
}: {
  itemId: string;
  itemName: string;
  itemPathPrefix: string;
  itemVesselName: string;
  ownerCode: string | null;
  startWorkingOn: string | null;
  expirationDate: string | null;
  instructions: string | null;
  reminderRules: ReminderRule[];
  additionalRecipients: ReminderRecipient[];
  referenceContacts: ReferenceContactOption[];
  referenceContactGroups: ReferenceContactGroupOption[];
  today: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleState>(() => initialSchedule(reminderRules, 'owner'));
  const [externalSchedule, setExternalSchedule] = useState<ScheduleState>(() => initialSchedule(reminderRules, 'external'));
  const [addMode, setAddMode] = useState<AddMode>('specific');
  const [specificDateDraft, setSpecificDateDraft] = useState('');
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const [recurringDraft, setRecurringDraft] = useState(() => {
    const ownerSchedule = initialSchedule(reminderRules, 'owner');
    return ownerSchedule.repeatActive ? String(ownerSchedule.repeatEveryDays) : '';
  });
  const [externalDeadlineDraft, setExternalDeadlineDraft] = useState('');
  const [externalSpecificDateDraft, setExternalSpecificDateDraft] = useState('');
  const [externalRecurringDraft, setExternalRecurringDraft] = useState(() => {
    const initialExternalSchedule = initialSchedule(reminderRules, 'external');
    return initialExternalSchedule.repeatActive ? String(initialExternalSchedule.repeatEveryDays) : '';
  });
  const [editingOneOffDate, setEditingOneOffDate] = useState<string | null>(null);
  const [editingLeadTime, setEditingLeadTime] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<EditableRecipient[]>(() => (
    additionalRecipients.map((recipient) => ({
      kind: recipient.recipient_type === 'group' ? 'group' : recipient.external_contact_id ? 'contact' : 'direct',
      name: recipient.recipient_name ?? '',
      email: recipient.recipient_type === 'group' ? '' : recipient.recipient_email,
      externalContactId: recipient.external_contact_id ?? null,
      contactGroupId: recipient.contact_group_id ?? null,
      memberCount: recipient.contact_group_id
        ? referenceContactGroups.find((group) => group.id === recipient.contact_group_id)?.members.length ?? 0
        : undefined
    }))
  ));
  const [recipientDraft, setRecipientDraft] = useState<EditableRecipient>({ kind: 'direct', name: '', email: '' });
  const [selectedReferenceRecipients, setSelectedReferenceRecipients] = useState<string[]>([]);

  const sortedLeadTimes = useMemo(() => [...schedule.leadTimes].sort((a, b) => b - a), [schedule.leadTimes]);
  const sortedExternalLeadTimes = useMemo(() => [...externalSchedule.leadTimes].sort((a, b) => b - a), [externalSchedule.leadTimes]);
  const scheduleRows = useMemo(
    () => buildSchedule(schedule, { startWorkingOn, expirationDate }, today),
    [expirationDate, schedule, startWorkingOn, today]
  );
  const externalScheduleRows = useMemo(
    () => buildSchedule(externalSchedule, { startWorkingOn, expirationDate }, today),
    [expirationDate, externalSchedule, startWorkingOn, today]
  );
  const allScheduleRows = useMemo(() => [...scheduleRows, ...externalScheduleRows].sort((a, b) => a.iso.localeCompare(b.iso)), [externalScheduleRows, scheduleRows]);
  const nextReminder = allScheduleRows.find((entry) => !entry.past);
  const futureReminderCount = allScheduleRows.filter((entry) => !entry.past).length;
  const ownerLabel = ownerCode ? `Owner ${ownerCode}` : 'mapped owner';
  const recipientSummary = recipients.length ? `${ownerLabel} + ${recipients.length} external` : ownerLabel;
  const editingKind = editingLeadTime !== null ? 'deadline' : editingOneOffDate ? 'manual' : null;
  const editingLabel = editingKind === 'deadline' ? 'Deadline reminder' : editingKind === 'manual' ? 'Manual reminder' : '';
  const ownerDeadlineDraftDays = nonNegativeIntegerDraft(deadlineDraft);
  const showOwnerDeadlineDraft = ownerDeadlineDraftDays !== null
    && !sortedLeadTimes.includes(ownerDeadlineDraftDays)
    && ownerDeadlineDraftDays !== editingLeadTime;
  const externalDeadlineDraftDays = nonNegativeIntegerDraft(externalDeadlineDraft);
  const showExternalDeadlineDraft = externalDeadlineDraftDays !== null
    && !sortedExternalLeadTimes.includes(externalDeadlineDraftDays);
  const ownerRecurringDraftDays = positiveIntegerDraft(recurringDraft);
  const ownerRecurringDaysPreview = ownerRecurringDraftDays ?? schedule.repeatEveryDays;
  const externalRecurringDraftDays = positiveIntegerDraft(externalRecurringDraft);
  const externalRecurringDaysPreview = externalRecurringDraftDays ?? externalSchedule.repeatEveryDays;
  const recurringPreviewRows = useMemo(() => {
    const previewSchedule = {
      ...schedule,
      repeatActive: schedule.repeatActive || ownerRecurringDraftDays !== null,
      repeatEveryDays: ownerRecurringDaysPreview
    };

    return buildSchedule(previewSchedule, { startWorkingOn, expirationDate }, today)
      .filter((entry) => entry.kind === 'recurring' && !entry.past)
      .slice(0, 3);
  }, [expirationDate, ownerRecurringDaysPreview, ownerRecurringDraftDays, schedule, startWorkingOn, today]);
  const externalRecurringPreviewRows = useMemo(() => {
    const previewSchedule = {
      ...externalSchedule,
      repeatActive: externalSchedule.repeatActive || externalRecurringDraftDays !== null,
      repeatEveryDays: externalRecurringDaysPreview
    };

    return buildSchedule(previewSchedule, { startWorkingOn, expirationDate }, today)
      .filter((entry) => entry.kind === 'recurring' && !entry.past)
      .slice(0, 3);
  }, [expirationDate, externalRecurringDaysPreview, externalRecurringDraftDays, externalSchedule, startWorkingOn, today]);

  const resetAddEdits = () => {
    setEditingOneOffDate(null);
    setEditingLeadTime(null);
  };

  const cancelAddEdit = () => {
    setEditingOneOffDate(null);
    setEditingLeadTime(null);
    setSpecificDateDraft('');
    setDeadlineDraft('');
  };

  const selectAddMode = (mode: AddMode) => {
    resetAddEdits();
    setAddMode(mode);
    if (mode === 'recurring') setRecurringDraft(schedule.repeatActive ? String(schedule.repeatEveryDays) : '');
    if (mode === 'deadline') setDeadlineDraft('');
  };

  const saveSpecificDate = () => {
    if (!specificDateDraft) return;
    setSchedule((current) => {
      const withoutEditedDate = editingOneOffDate
        ? current.oneOffDates.filter((date) => date !== editingOneOffDate)
        : current.oneOffDates;
      const oneOffDates = withoutEditedDate.includes(specificDateDraft)
        ? withoutEditedDate
        : [...withoutEditedDate, specificDateDraft].sort();
      return { ...current, oneOffDates };
    });
    setSpecificDateDraft('');
    setEditingOneOffDate(null);
  };

  const saveDeadlineOffset = () => {
    const parsed = Number.parseInt(deadlineDraft, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return;

    setSchedule((current) => {
      const withoutEditedLeadTime = editingLeadTime === null
        ? current.leadTimes
        : current.leadTimes.filter((leadTime) => leadTime !== editingLeadTime);
      const leadTimes = withoutEditedLeadTime.includes(parsed)
        ? withoutEditedLeadTime
        : [...withoutEditedLeadTime, parsed];
      return { ...current, expirationActive: true, leadTimes };
    });
    setDeadlineDraft('');
    setEditingLeadTime(null);
  };

  const saveRecurringCadence = () => {
    const parsed = Number.parseInt(recurringDraft, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    setSchedule((current) => ({ ...current, repeatActive: true, repeatEveryDays: parsed }));
  };

  const removeLeadTime = (value: number) => {
    setSchedule((current) => ({
      ...current,
      leadTimes: current.leadTimes.filter((leadTime) => leadTime !== value)
    }));
  };

  const editLeadTime = (value: number) => {
    setAddMode('deadline');
    setDeadlineDraft(String(value));
    setEditingLeadTime(value);
    setEditingOneOffDate(null);
  };

  const editOneOff = (value: string) => {
    setAddMode('specific');
    setSpecificDateDraft(value);
    setEditingOneOffDate(value);
    setEditingLeadTime(null);
  };

  const removeOneOff = (value: string) => {
    setSchedule((current) => ({
      ...current,
      oneOffDates: current.oneOffDates.filter((date) => date !== value)
    }));
    if (editingOneOffDate === value) {
      setEditingOneOffDate(null);
      setSpecificDateDraft('');
    }
  };

  const addRecipient = () => {
    const email = recipientDraft.email.trim().toLowerCase();
    if (!email) return;
    setRecipients((current) => (
      current.some((recipient) => recipient.kind !== 'group' && recipient.email.toLowerCase() === email)
        ? current
        : [...current, { kind: 'direct', name: recipientDraft.name.trim(), email }]
    ));
    setRecipientDraft({ kind: 'direct', name: '', email: '' });
  };

  const recipientKey = (recipient: EditableRecipient) => {
    if (recipient.kind === 'group') return `group:${recipient.contactGroupId}`;
    if (recipient.kind === 'contact') return `contact:${recipient.externalContactId}`;
    return `direct:${recipient.email.toLowerCase()}`;
  };

  const addSelectedReferenceRecipients = () => {
    if (selectedReferenceRecipients.length === 0) return;

    setRecipients((current) => {
      const byKey = new Map(current.map((recipient) => [recipientKey(recipient), recipient]));

      selectedReferenceRecipients.forEach((value) => {
        const [kind, id] = value.split(':');

        if (kind === 'contact') {
          const contact = referenceContacts.find((entry) => entry.id === id);
          if (!contact) return;
          const next: EditableRecipient = {
            kind: 'contact',
            name: contact.name ?? '',
            email: contact.email,
            externalContactId: contact.id
          };
          byKey.set(recipientKey(next), next);
        }

        if (kind === 'group') {
          const group = referenceContactGroups.find((entry) => entry.id === id);
          if (!group) return;
          const next: EditableRecipient = {
            kind: 'group',
            name: group.name,
            email: '',
            contactGroupId: group.id,
            memberCount: group.members.length
          };
          byKey.set(recipientKey(next), next);
        }
      });

      return Array.from(byKey.values());
    });
    setSelectedReferenceRecipients([]);
  };

  const addExternalDeadline = () => {
    const parsed = Number.parseInt(externalDeadlineDraft, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return;
    setExternalSchedule((current) => ({
      ...current,
      expirationActive: true,
      leadTimes: current.leadTimes.includes(parsed) ? current.leadTimes : [...current.leadTimes, parsed]
    }));
    setExternalDeadlineDraft('');
  };

  const addExternalOneOff = () => {
    if (!externalSpecificDateDraft) return;
    setExternalSchedule((current) => ({
      ...current,
      oneOffDates: current.oneOffDates.includes(externalSpecificDateDraft)
        ? current.oneOffDates
        : [...current.oneOffDates, externalSpecificDateDraft].sort()
    }));
    setExternalSpecificDateDraft('');
  };

  const saveExternalRecurring = () => {
    const parsed = Number.parseInt(externalRecurringDraft, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    setExternalSchedule((current) => ({ ...current, repeatActive: true, repeatEveryDays: parsed }));
  };

  const renderAddPanel = () => {
    if (addMode === 'deadline') {
      return (
        <div className="schedule-add-fields">
          <label>
            Days before expiration
            <input
              type="number"
              min="0"
              value={deadlineDraft}
              placeholder="Days before"
              onChange={(event) => setDeadlineDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveDeadlineOffset();
                }
              }}
            />
          </label>
          <div className="schedule-field-note">
            Counts back from {expirationDate ? formatDate(expirationDate) : 'the expiration date'}.
          </div>
          <div className="schedule-add-actions">
            <button type="button" onClick={saveDeadlineOffset} disabled={!deadlineDraft.trim()}>
              {editingLeadTime === null ? 'Add deadline reminder' : 'Update reminder timing'}
            </button>
          </div>
        </div>
      );
    }

    if (addMode === 'recurring') {
      return (
        <div className="schedule-add-fields">
          <label>
            Repeat every
            <input
              type="number"
              min="1"
              value={recurringDraft}
              onChange={(event) => setRecurringDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveRecurringCadence();
                }
              }}
            />
          </label>
          <div className="schedule-field-note">days while the item remains open.</div>
          <div className="schedule-add-actions">
            <button type="button" onClick={saveRecurringCadence} disabled={!recurringDraft.trim()}>{schedule.repeatActive ? 'Update cadence' : 'Start nudging'}</button>
          </div>
        </div>
      );
    }

    return (
      <div className="schedule-add-fields">
        <label>
          Reminder date
          <input
            type="date"
            min={today}
            value={specificDateDraft}
            onChange={(event) => setSpecificDateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                saveSpecificDate();
              }
            }}
          />
        </label>
        <div className="schedule-field-note">A manual reminder for this cycle only.</div>
        <div className="schedule-add-actions">
          <button type="button" onClick={saveSpecificDate} disabled={!specificDateDraft}>
            {editingOneOffDate ? 'Update reminder' : 'Add reminder'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <button className="rem-edit-btn" type="button" onClick={() => setIsOpen(true)}>
        <Pencil aria-hidden="true" />
        Edit schedule
      </button>

      {isOpen ? (
        <>
          <div className="drawer-scrim" onClick={() => setIsOpen(false)} />
          <aside className="edit-drawer reminder-schedule-drawer" role="dialog" aria-modal="true" aria-label="Reminder schedule">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Reminder schedule</span>
                <strong>{itemName}</strong>
                <p>{ownerLabel} gets the default reminders. Vessel copies receive informational emails.</p>
              </div>
              <button className="drawer-icon-button" type="button" aria-label="Close reminder schedule" onClick={() => setIsOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>

            <form action={saveComplianceItemReminders} className="reminder-schedule-form">
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
              {schedule.startActive ? <input type="hidden" name="ownerStartRuleActive" value="on" /> : null}
              {schedule.expirationActive ? <input type="hidden" name="ownerExpirationRuleActive" value="on" /> : null}
              {schedule.expirationActive ? sortedLeadTimes.map((leadTime) => (
                <input type="hidden" name="ownerExpirationDaysBefore" value={leadTime} key={leadTime} />
              )) : null}
              {schedule.repeatActive ? <input type="hidden" name="ownerRepeatRuleActive" value="on" /> : null}
              <input type="hidden" name="ownerRepeatEveryDays" value={schedule.repeatEveryDays} />
              {schedule.oneOffDates.map((date) => <input type="hidden" name="ownerOneOffDate" value={date} key={date} />)}
              {externalSchedule.startActive ? <input type="hidden" name="externalStartRuleActive" value="on" /> : null}
              {externalSchedule.expirationActive ? <input type="hidden" name="externalExpirationRuleActive" value="on" /> : null}
              {externalSchedule.expirationActive ? sortedExternalLeadTimes.map((leadTime) => (
                <input type="hidden" name="externalExpirationDaysBefore" value={leadTime} key={leadTime} />
              )) : null}
              {externalSchedule.repeatActive ? <input type="hidden" name="externalRepeatRuleActive" value="on" /> : null}
              <input type="hidden" name="externalRepeatEveryDays" value={externalSchedule.repeatEveryDays} />
              {externalSchedule.oneOffDates.map((date) => <input type="hidden" name="externalOneOffDate" value={date} key={date} />)}
              {recipients.map((recipient) => (
                <span key={recipientKey(recipient)}>
                  <input type="hidden" name="additionalRecipientType" value={recipient.kind === 'group' ? 'group' : 'external'} />
                  <input type="hidden" name="additionalRecipientName" value={recipient.name} />
                  <input type="hidden" name="additionalRecipientEmail" value={recipient.email} />
                  <input type="hidden" name="additionalRecipientContactId" value={recipient.externalContactId ?? ''} />
                  <input type="hidden" name="additionalRecipientGroupId" value={recipient.contactGroupId ?? ''} />
                </span>
              ))}

              <div className="body reminder-schedule-body">
                <div className="schedule-summary-grid">
                  <div>
                    <span>Next email</span>
                    <strong>{nextReminder ? shortDate(nextReminder.iso) : 'None'}</strong>
                  </div>
                  <div>
                    <span>Future reminders</span>
                    <strong>{futureReminderCount} scheduled</strong>
                  </div>
                  <div>
                    <span>Recipients</span>
                    <strong>{recipientSummary}</strong>
                  </div>
                </div>

                <section className="schedule-section scheduled-reminders-section">
                  <div className="schedule-section-head">
                    <div>
                      <h4>Scheduled reminders</h4>
                      <p>Every future email that will go out for this item.</p>
                    </div>
                    {nextReminder ? <span className="schedule-tag is-next">Next up</span> : null}
                  </div>

                  {scheduleRows.length === 0 ? (
                    <div className="send-preview-empty">
                      <CalendarPlus aria-hidden="true" />
                      <span>No reminders are on, so nobody will be emailed for this item.</span>
                    </div>
                  ) : (
                    <div className="scheduled-reminder-list">
                      {scheduleRows.map((entry) => {
                        const date = splitShortDate(entry.iso);
                        return (
                          <div className={`scheduled-reminder-row${entry.past ? ' is-past' : ''}`} key={`${entry.kind}-${entry.iso}-${entry.sub}`}>
                            <div className="schedule-date-block">
                              <span>{date.month}</span>
                              <strong>{date.day}</strong>
                            </div>
                            <div className="scheduled-reminder-copy">
                              <strong>{entry.title}</strong>
                              <p>{entry.sub}</p>
                              <div className="schedule-chip-row">
                                <ScheduleTag entry={entry} />
                                <span className="schedule-tag is-owner">{ownerLabel}</span>
                                {recipients.length ? <span className="schedule-tag is-copy">{recipients.length} vessel {recipients.length === 1 ? 'copy' : 'copies'}</span> : null}
                              </div>
                            </div>
                            <div className="scheduled-reminder-actions">
                              {entry.past ? null : (
                                <>
                                  {entry.kind === 'deadline' && entry.leadTime !== undefined ? (
                                    <>
                                      <button type="button" onClick={() => editLeadTime(entry.leadTime!)}>Edit</button>
                                      <button className="danger" type="button" onClick={() => removeLeadTime(entry.leadTime!)}>Remove</button>
                                    </>
                                  ) : null}
                                  {entry.kind === 'oneoff' ? (
                                    <>
                                      <button type="button" onClick={() => editOneOff(entry.iso)}>Edit</button>
                                      <button className="danger" type="button" onClick={() => removeOneOff(entry.iso)}>Remove</button>
                                    </>
                                  ) : null}
                                  {entry.kind === 'recurring' ? (
                                    <>
                                      <button type="button" onClick={() => {
                                        setAddMode('recurring');
                                        setRecurringDraft(String(schedule.repeatEveryDays));
                                        resetAddEdits();
                                      }}>Cadence</button>
                                      <button className="danger" type="button" onClick={() => setSchedule((current) => ({ ...current, repeatActive: false }))}>Pause</button>
                                    </>
                                  ) : null}
                                  {entry.kind === 'kickoff' ? (
                                    <button className="danger" type="button" onClick={() => setSchedule((current) => ({ ...current, startActive: false }))}>Turn off</button>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="schedule-add-panel">
                    {editingKind ? (
                      <div className="schedule-edit-banner">
                        <div>
                          <span>Editing</span>
                          <strong>{editingLabel}</strong>
                        </div>
                        <button className="schedule-secondary-action" type="button" onClick={cancelAddEdit}>Cancel edit</button>
                      </div>
                    ) : (
                      <div className="schedule-segmented" aria-label="Add reminder type">
                        <button className={addMode === 'specific' ? 'is-active' : ''} type="button" onClick={() => selectAddMode('specific')}>Specific date</button>
                        <button className={addMode === 'deadline' ? 'is-active' : ''} type="button" onClick={() => selectAddMode('deadline')}>Days before deadline</button>
                        <button className={addMode === 'recurring' ? 'is-active' : ''} type="button" onClick={() => selectAddMode('recurring')}>Recurring nudge</button>
                      </div>
                    )}
                    {renderAddPanel()}
                  </div>
                </section>

                <section className="schedule-section">
                  <div className="schedule-section-head">
                    <div>
                      <h4>Rules that create reminders</h4>
                      <p>These generate owner reminders in the scheduled list above.</p>
                    </div>
                  </div>
                  <div className="schedule-rule-list">
                    <div className="schedule-rule-row">
                      <ScheduleToggle
                        checked={schedule.startActive}
                        label="Start-working reminder"
                        onChange={() => setSchedule((current) => ({ ...current, startActive: !current.startActive }))}
                      />
                      <div>
                        <strong>Start-working reminder</strong>
                        <p>{startWorkingOn ? `Sends on ${formatDate(startWorkingOn)}.` : 'Sends once a start-working date is set.'}</p>
                      </div>
                    </div>

                    <div className="schedule-rule-row">
                      <ScheduleToggle
                        checked={schedule.expirationActive}
                        label="Deadline reminders"
                        onChange={() => setSchedule((current) => ({ ...current, expirationActive: !current.expirationActive }))}
                      />
                      <div>
                        <strong>Deadline reminders</strong>
                        <p>{expirationDate ? `Sends before the ${formatDate(expirationDate)} expiration.` : 'Sends before the expiration date once one is set.'}</p>
                        <p className="schedule-help-text">Enter how many days before expiration the reminder should send.</p>
                        <div className="schedule-chip-row">
                          {sortedLeadTimes.length ? sortedLeadTimes.map((leadTime) => (
                            <button className="schedule-offset-chip" type="button" key={leadTime} onClick={() => editLeadTime(leadTime)}>
                              {leadTime}d
                            </button>
                          )) : null}
                          {showOwnerDeadlineDraft ? <span className="schedule-tag is-next">{ownerDeadlineDraftDays}d pending</span> : null}
                          {sortedLeadTimes.length || showOwnerDeadlineDraft ? null : <span className="schedule-tag is-scheduled">No reminder timing</span>}
                        </div>
                        <div className="schedule-inline-add">
                          <input
                            aria-label="Owner days before expiration"
                            type="number"
                            min="0"
                            placeholder="Days before"
                            value={deadlineDraft}
                            onChange={(event) => setDeadlineDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                saveDeadlineOffset();
                              }
                            }}
                          />
                          <button type="button" onClick={saveDeadlineOffset} disabled={!deadlineDraft.trim()}>
                            {editingLeadTime === null ? 'Add reminder timing' : 'Update reminder timing'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="schedule-rule-row">
                      <ScheduleToggle
                        checked={schedule.repeatActive}
                        label="Recurring nudges"
                        onChange={() => setSchedule((current) => ({ ...current, repeatActive: !current.repeatActive }))}
                      />
                      <div>
                        <strong>Recurring nudge</strong>
                        <p>
                          {schedule.repeatActive
                            ? `Repeats every ${ownerRecurringDaysPreview} days while the item is open.`
                            : ownerRecurringDraftDays
                              ? `Will repeat every ${ownerRecurringDraftDays} days when turned on.`
                              : 'Enter the number of days between recurring nudges.'}
                        </p>
                        <div className="schedule-chip-row">
                          {recurringPreviewRows.length ? recurringPreviewRows.map((entry) => (
                            <span className={`schedule-tag is-${entry.status}`} key={entry.iso}>{shortDate(entry.iso)}</span>
                          )) : <span className="schedule-tag is-scheduled">No future nudges</span>}
                        </div>
                        <div className="schedule-inline-add">
                          <input
                            aria-label="Owner repeat cadence"
                            type="number"
                            min="1"
                            placeholder="Days between"
                            value={recurringDraft}
                            onChange={(event) => setRecurringDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                saveRecurringCadence();
                              }
                            }}
                          />
                          <button type="button" onClick={saveRecurringCadence} disabled={!recurringDraft.trim()}>
                            {schedule.repeatActive ? 'Update cadence' : 'Set cadence'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="schedule-section">
                  <div className="schedule-section-head">
                    <div>
                      <h4>External copy reminders</h4>
                      <p>These send no-login emails to external recipients, with a copy sent to the mapped owner.</p>
                    </div>
                    <span className={`schedule-tag ${externalScheduleRows.some((entry) => !entry.past) ? 'is-next' : 'is-scheduled'}`}>
                      {externalScheduleRows.filter((entry) => !entry.past).length} future
                    </span>
                  </div>
                  <div className="schedule-rule-list">
                    <div className="schedule-rule-row">
                      <ScheduleToggle
                        checked={externalSchedule.startActive}
                        label="External start-working reminder"
                        onChange={() => setExternalSchedule((current) => ({ ...current, startActive: !current.startActive }))}
                      />
                      <div>
                        <strong>External start-working reminder</strong>
                        <p>{startWorkingOn ? `Sends on ${formatDate(startWorkingOn)}.` : 'Sends once a start-working date is set.'}</p>
                      </div>
                    </div>

                    <div className="schedule-rule-row">
                      <ScheduleToggle
                        checked={externalSchedule.expirationActive}
                        label="External deadline reminders"
                        onChange={() => setExternalSchedule((current) => ({ ...current, expirationActive: !current.expirationActive }))}
                      />
                      <div>
                        <strong>External deadline reminders</strong>
                        <p>{expirationDate ? `Sends before the ${formatDate(expirationDate)} expiration.` : 'Sends before the expiration date once one is set.'}</p>
                        <p className="schedule-help-text">Enter how many days before expiration the reminder should send.</p>
                        <div className="schedule-chip-row">
                          {sortedExternalLeadTimes.length ? sortedExternalLeadTimes.map((leadTime) => (
                            <button
                              className="schedule-offset-chip"
                              type="button"
                              key={leadTime}
                              onClick={() => setExternalSchedule((current) => ({ ...current, leadTimes: current.leadTimes.filter((value) => value !== leadTime) }))}
                            >
                              {leadTime}d ×
                            </button>
                          )) : null}
                          {showExternalDeadlineDraft ? <span className="schedule-tag is-next">{externalDeadlineDraftDays}d pending</span> : null}
                          {sortedExternalLeadTimes.length || showExternalDeadlineDraft ? null : <span className="schedule-tag is-scheduled">No reminder timing</span>}
                        </div>
                        <div className="schedule-inline-add">
                          <input
                            aria-label="External days before expiration"
                            type="number"
                            min="0"
                            placeholder="Days before"
                            value={externalDeadlineDraft}
                            onChange={(event) => setExternalDeadlineDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                addExternalDeadline();
                              }
                            }}
                          />
                          <button type="button" onClick={addExternalDeadline} disabled={!externalDeadlineDraft.trim()}>Add reminder timing</button>
                        </div>
                      </div>
                    </div>

                    <div className="schedule-rule-row">
                      <ScheduleToggle
                        checked={externalSchedule.repeatActive}
                        label="External recurring nudges"
                        onChange={() => setExternalSchedule((current) => ({ ...current, repeatActive: !current.repeatActive }))}
                      />
                      <div>
                        <strong>External recurring nudge</strong>
                        <p>
                          {externalSchedule.repeatActive
                            ? `Repeats every ${externalRecurringDaysPreview} days while the item is open.`
                            : externalRecurringDraftDays
                              ? `Will repeat every ${externalRecurringDraftDays} days when turned on.`
                              : 'Enter the number of days between recurring nudges.'}
                        </p>
                        <div className="schedule-chip-row">
                          {externalRecurringPreviewRows.length ? externalRecurringPreviewRows.map((entry) => (
                            <span className={`schedule-tag is-${entry.status}`} key={entry.iso}>{shortDate(entry.iso)}</span>
                          )) : <span className="schedule-tag is-scheduled">No future nudges</span>}
                        </div>
                        <div className="schedule-inline-add">
                          <input
                            aria-label="External repeat cadence"
                            type="number"
                            min="1"
                            placeholder="Days between"
                            value={externalRecurringDraft}
                            onChange={(event) => setExternalRecurringDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                saveExternalRecurring();
                              }
                            }}
                          />
                          <button type="button" onClick={saveExternalRecurring} disabled={!externalRecurringDraft.trim()}>
                            {externalSchedule.repeatActive ? 'Update cadence' : 'Set cadence'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="schedule-oneoff-inline">
                    <label>
                      One-off external reminder
                      <input
                        type="date"
                        min={today}
                        value={externalSpecificDateDraft}
                        onChange={(event) => setExternalSpecificDateDraft(event.target.value)}
                      />
                    </label>
                    <button type="button" onClick={addExternalOneOff} disabled={!externalSpecificDateDraft}>Add date</button>
                  </div>

                  {externalSchedule.oneOffDates.length ? (
                    <div className="schedule-chip-row">
                      {externalSchedule.oneOffDates.map((date) => (
                        <button
                          className="schedule-offset-chip"
                          type="button"
                          key={date}
                          onClick={() => setExternalSchedule((current) => ({ ...current, oneOffDates: current.oneOffDates.filter((value) => value !== date) }))}
                        >
                          {shortDate(date)} ×
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="schedule-section">
                  <div className="schedule-section-head">
                    <div>
                      <h4>External recipients</h4>
                      <p>These recipients get informational emails without login links. The owner gets a copy.</p>
                    </div>
                  </div>
                  <div className="schedule-recipient-list">
                    <div className="schedule-recipient-row">
                      <div>
                        <strong>{ownerLabel}</strong>
                        <span>Owner receives owner reminders and copies of external reminders</span>
                      </div>
                      <span className="schedule-tag is-owner">Owner</span>
                    </div>
                    {recipients.map((recipient) => (
                      <div className="schedule-recipient-row" key={recipientKey(recipient)}>
                        <div>
                          <strong>{recipient.name || 'External recipient'}</strong>
                          <span>
                            {recipient.kind === 'group'
                              ? `${recipient.memberCount ?? 0} group ${recipient.memberCount === 1 ? 'member' : 'members'}`
                              : recipient.email}
                          </span>
                        </div>
                        <span className={`schedule-tag ${recipient.kind === 'group' ? 'is-next' : 'is-copy'}`}>
                          {recipient.kind === 'group' ? 'Group' : 'Contact'}
                        </span>
                        <button type="button" onClick={() => setRecipients((current) => current.filter((entry) => recipientKey(entry) !== recipientKey(recipient)))}>Remove</button>
                      </div>
                    ))}
                    {referenceContacts.length || referenceContactGroups.length ? (
                      <div className="schedule-reference-add">
                        <label>
                          Saved contacts and groups
                          <select
                            multiple
                            value={selectedReferenceRecipients}
                            onChange={(event) => {
                              const selected = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
                              setSelectedReferenceRecipients(selected);
                            }}
                          >
                            {referenceContacts.filter((contact) => contact.active).map((contact) => (
                              <option value={`contact:${contact.id}`} key={`contact:${contact.id}`}>
                                {contact.name ? `${contact.name} - ${contact.email}` : contact.email}
                              </option>
                            ))}
                            {referenceContactGroups.map((group) => (
                              <option value={`group:${group.id}`} key={`group:${group.id}`}>
                                {group.name} ({group.members.length})
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="button" onClick={addSelectedReferenceRecipients} disabled={selectedReferenceRecipients.length === 0}>Add selected</button>
                      </div>
                    ) : null}
                    <div className="schedule-recipient-add">
                      <input
                        type="text"
                        placeholder="Name"
                        value={recipientDraft.name}
                        onChange={(event) => setRecipientDraft((current) => ({ ...current, name: event.target.value }))}
                      />
                      <input
                        type="email"
                        placeholder="email@external.com"
                        value={recipientDraft.email}
                        onChange={(event) => setRecipientDraft((current) => ({ ...current, email: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addRecipient();
                          }
                        }}
                      />
                      <button type="button" onClick={addRecipient}>Add external</button>
                    </div>
                  </div>
                </section>

                <label className="schedule-instructions">
                  Email instructions
                  <textarea name="instructions" rows={5} defaultValue={instructions ?? ''} placeholder="Standing instructions included in reminder emails." />
                </label>
              </div>

              <div className="drawer-foot reminder-schedule-foot">
                <span>{futureReminderCount} future {futureReminderCount === 1 ? 'reminder' : 'reminders'} scheduled. Owner and external deadline/recurring rules carry forward.</span>
                <div>
                  <button className="schedule-cancel-button" type="button" onClick={() => setIsOpen(false)}>Cancel</button>
                  <button className="schedule-save-button" type="submit">Save schedule</button>
                </div>
              </div>
            </form>
          </aside>
        </>
      ) : null}
    </>
  );
}
