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
  active: boolean;
};

type ReminderRecipient = {
  recipient_name: string | null;
  recipient_email: string;
  recipient_type: string;
};

type EditableRecipient = {
  name: string;
  email: string;
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

function initialSchedule(reminderRules: ReminderRule[]): ScheduleState {
  const startRule = reminderRules.find((rule) => rule.trigger_type === 'on_start_date');
  const deadlineRules = reminderRules.filter((rule) => rule.trigger_type === 'days_before_expiration');
  const repeatRule = reminderRules.find((rule) => rule.trigger_type === 'repeat_after_start');
  const storedLeadTimes = uniqueNumbers(deadlineRules.map((rule) => rule.days_before));

  return {
    startActive: startRule?.active ?? true,
    expirationActive: deadlineRules.length === 0 ? true : deadlineRules.some((rule) => rule.active),
    leadTimes: storedLeadTimes.length ? storedLeadTimes : [14],
    repeatActive: repeatRule?.active ?? false,
    repeatEveryDays: repeatRule?.repeat_every_days && repeatRule.repeat_every_days > 0 ? repeatRule.repeat_every_days : 14,
    oneOffDates: uniqueDates(
      reminderRules
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
  today: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleState>(() => initialSchedule(reminderRules));
  const [addMode, setAddMode] = useState<AddMode>('specific');
  const [specificDateDraft, setSpecificDateDraft] = useState('');
  const [deadlineDraft, setDeadlineDraft] = useState('7');
  const [recurringDraft, setRecurringDraft] = useState(() => String(initialSchedule(reminderRules).repeatEveryDays));
  const [editingOneOffDate, setEditingOneOffDate] = useState<string | null>(null);
  const [editingLeadTime, setEditingLeadTime] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<EditableRecipient[]>(() => (
    additionalRecipients.map((recipient) => ({
      name: recipient.recipient_name ?? '',
      email: recipient.recipient_email
    }))
  ));
  const [recipientDraft, setRecipientDraft] = useState<EditableRecipient>({ name: '', email: '' });

  const sortedLeadTimes = useMemo(() => [...schedule.leadTimes].sort((a, b) => b - a), [schedule.leadTimes]);
  const scheduleRows = useMemo(
    () => buildSchedule(schedule, { startWorkingOn, expirationDate }, today),
    [expirationDate, schedule, startWorkingOn, today]
  );
  const nextReminder = scheduleRows.find((entry) => entry.status === 'next');
  const futureReminderCount = scheduleRows.filter((entry) => !entry.past).length;
  const recurringRows = scheduleRows.filter((entry) => entry.kind === 'recurring');
  const recurringPreviewRows = recurringRows.filter((entry) => !entry.past).slice(0, 3);
  const ownerLabel = ownerCode ? `Owner ${ownerCode}` : 'mapped owner';
  const recipientSummary = recipients.length ? `${ownerLabel} + ${recipients.length}` : ownerLabel;

  const resetAddEdits = () => {
    setEditingOneOffDate(null);
    setEditingLeadTime(null);
  };

  const selectAddMode = (mode: AddMode) => {
    resetAddEdits();
    setAddMode(mode);
    if (mode === 'recurring') setRecurringDraft(String(schedule.repeatEveryDays));
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
      current.some((recipient) => recipient.email.toLowerCase() === email)
        ? current
        : [...current, { name: recipientDraft.name.trim(), email }]
    ));
    setRecipientDraft({ name: '', email: '' });
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
              placeholder="14"
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
          <button type="button" onClick={saveDeadlineOffset}>{editingLeadTime === null ? 'Add deadline reminder' : 'Update offset'}</button>
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
          <button type="button" onClick={saveRecurringCadence}>{schedule.repeatActive ? 'Update cadence' : 'Start nudging'}</button>
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
        <button type="button" onClick={saveSpecificDate} disabled={!specificDateDraft}>
          {editingOneOffDate ? 'Update reminder' : 'Add reminder'}
        </button>
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

            <form action={saveComplianceItemReminders} className="status-form reminder-schedule-form">
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
              {schedule.startActive ? <input type="hidden" name="startRuleActive" value="on" /> : null}
              {schedule.expirationActive ? <input type="hidden" name="expirationRuleActive" value="on" /> : null}
              {schedule.expirationActive ? sortedLeadTimes.map((leadTime) => (
                <input type="hidden" name="expirationDaysBefore" value={leadTime} key={leadTime} />
              )) : null}
              {schedule.repeatActive ? <input type="hidden" name="repeatRuleActive" value="on" /> : null}
              <input type="hidden" name="repeatEveryDays" value={schedule.repeatEveryDays} />
              {schedule.oneOffDates.map((date) => <input type="hidden" name="oneOffDate" value={date} key={date} />)}
              {recipients.map((recipient) => (
                <span key={recipient.email}>
                  <input type="hidden" name="additionalRecipientName" value={recipient.name} />
                  <input type="hidden" name="additionalRecipientEmail" value={recipient.email} />
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
                    <div className="schedule-segmented" aria-label="Add reminder type">
                      <button className={addMode === 'specific' ? 'is-active' : ''} type="button" onClick={() => selectAddMode('specific')}>Specific date</button>
                      <button className={addMode === 'deadline' ? 'is-active' : ''} type="button" onClick={() => selectAddMode('deadline')}>Days before deadline</button>
                      <button className={addMode === 'recurring' ? 'is-active' : ''} type="button" onClick={() => selectAddMode('recurring')}>Recurring nudge</button>
                    </div>
                    {renderAddPanel()}
                  </div>
                </section>

                <section className="schedule-section">
                  <div className="schedule-section-head">
                    <div>
                      <h4>Rules that create reminders</h4>
                      <p>These generate the scheduled list above.</p>
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
                        <div className="schedule-chip-row">
                          {sortedLeadTimes.length ? sortedLeadTimes.map((leadTime) => (
                            <button className="schedule-offset-chip" type="button" key={leadTime} onClick={() => editLeadTime(leadTime)}>
                              {leadTime}d
                            </button>
                          )) : <span className="schedule-tag is-scheduled">No offsets</span>}
                          <button className="schedule-offset-chip" type="button" onClick={() => selectAddMode('deadline')}>+ Offset</button>
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
                        <p>Repeats every {schedule.repeatEveryDays} days while the item is open.</p>
                        <div className="schedule-chip-row">
                          {recurringPreviewRows.length ? recurringPreviewRows.map((entry) => (
                            <span className={`schedule-tag is-${entry.status}`} key={entry.iso}>{shortDate(entry.iso)}</span>
                          )) : <span className="schedule-tag is-scheduled">No future nudges</span>}
                          <button className="schedule-offset-chip" type="button" onClick={() => {
                            setAddMode('recurring');
                            setRecurringDraft(String(schedule.repeatEveryDays));
                            resetAddEdits();
                          }}>Cadence</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="schedule-section">
                  <div className="schedule-section-head">
                    <div>
                      <h4>Recipients</h4>
                      <p>Applies to every scheduled reminder unless a row is changed later.</p>
                    </div>
                  </div>
                  <div className="schedule-recipient-list">
                    <div className="schedule-recipient-row">
                      <div>
                        <strong>{ownerLabel}</strong>
                        <span>Default office recipient from owner-code mapping</span>
                      </div>
                      <span className="schedule-tag is-owner">Default</span>
                    </div>
                    {recipients.map((recipient) => (
                      <div className="schedule-recipient-row" key={recipient.email}>
                        <div>
                          <strong>{recipient.name || 'Vessel copy'}</strong>
                          <span>{recipient.email}</span>
                        </div>
                        <button type="button" onClick={() => setRecipients((current) => current.filter((entry) => entry.email !== recipient.email))}>Remove</button>
                      </div>
                    ))}
                    <div className="schedule-recipient-add">
                      <input
                        type="text"
                        placeholder="Name"
                        value={recipientDraft.name}
                        onChange={(event) => setRecipientDraft((current) => ({ ...current, name: event.target.value }))}
                      />
                      <input
                        type="email"
                        placeholder="email@company.com"
                        value={recipientDraft.email}
                        onChange={(event) => setRecipientDraft((current) => ({ ...current, email: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addRecipient();
                          }
                        }}
                      />
                      <button type="button" onClick={addRecipient}>Add copy</button>
                    </div>
                  </div>
                </section>

                <label className="schedule-instructions">
                  Email instructions
                  <textarea name="instructions" rows={5} defaultValue={instructions ?? ''} placeholder="Standing instructions included in reminder emails." />
                </label>
              </div>

              <div className="drawer-foot reminder-schedule-foot">
                <span>{futureReminderCount} future {futureReminderCount === 1 ? 'reminder' : 'reminders'} scheduled. Deadline and recurring rules carry forward to the next cycle.</span>
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
