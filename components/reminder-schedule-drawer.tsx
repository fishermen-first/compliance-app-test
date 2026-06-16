'use client';

import { useMemo, useState, type ReactNode } from 'react';
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

const leadTimePresets = [30, 14, 7, 3, 1];
const repeatPresets = [
  { label: 'Weekly', value: 7 },
  { label: 'Every 2 weeks', value: 14 },
  { label: 'Monthly', value: 30 }
];

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

function joinLeadTimes(values: number[]) {
  if (values.length === 0) return '';
  if (values.length === 1) return `${values[0]}`;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
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
      sub: 'Work can start',
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
        sub: `${leadTime} days before ${shortDate(item.expirationDate)}`,
        kind: 'deadline'
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
        sub: `Every ${state.repeatEveryDays} days`,
        kind: 'recurring'
      });
      current = addDays(current, state.repeatEveryDays);
      guard += 1;
    }
  }

  state.oneOffDates.forEach((iso) => {
    out.push({
      iso,
      title: 'One-off reminder',
      sub: 'Added by hand',
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

function ReminderBlock({
  title,
  sub,
  checked,
  onToggle,
  children
}: {
  title: string;
  sub: string;
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`schedule-rule-block${checked ? ' is-on' : ''}`}>
      <div className="schedule-rule-head">
        <ScheduleToggle checked={checked} onChange={onToggle} label={title} />
        <div>
          <h4>{title}</h4>
          <p>{sub}</p>
        </div>
      </div>
      {checked ? <div className="schedule-rule-body">{children}</div> : null}
    </section>
  );
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
  const [customLeadTime, setCustomLeadTime] = useState('');
  const [oneOffDraft, setOneOffDraft] = useState('');
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
  const deadlineSends = useMemo(
    () => sortedLeadTimes
      .map((leadTime) => ({ leadTime, iso: expirationDate ? addDays(expirationDate, -leadTime) : null }))
      .filter((entry): entry is { leadTime: number; iso: string } => Boolean(entry.iso)),
    [expirationDate, sortedLeadTimes]
  );
  const recurringRows = scheduleRows.filter((entry) => entry.kind === 'recurring');

  const addLeadTime = (value: number) => {
    if (!Number.isInteger(value) || value < 0) return;
    setSchedule((current) => ({
      ...current,
      leadTimes: current.leadTimes.includes(value) ? current.leadTimes : [...current.leadTimes, value]
    }));
  };

  const toggleLeadTime = (value: number) => {
    setSchedule((current) => ({
      ...current,
      leadTimes: current.leadTimes.includes(value)
        ? current.leadTimes.filter((leadTime) => leadTime !== value)
        : [...current.leadTimes, value]
    }));
  };

  const removeLeadTime = (value: number) => {
    setSchedule((current) => ({
      ...current,
      leadTimes: current.leadTimes.filter((leadTime) => leadTime !== value)
    }));
  };

  const addCustomLeadTime = () => {
    const parsed = Number.parseInt(customLeadTime, 10);
    if (Number.isInteger(parsed) && parsed >= 0) addLeadTime(parsed);
    setCustomLeadTime('');
  };

  const addOneOff = () => {
    if (!oneOffDraft) return;
    setSchedule((current) => ({
      ...current,
      oneOffDates: current.oneOffDates.includes(oneOffDraft)
        ? current.oneOffDates
        : [...current.oneOffDates, oneOffDraft].sort()
    }));
    setOneOffDraft('');
  };

  const removeOneOff = (value: string) => {
    setSchedule((current) => ({
      ...current,
      oneOffDates: current.oneOffDates.filter((date) => date !== value)
    }));
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

  const ownerLabel = ownerCode ? `Owner ${ownerCode}` : 'the mapped owner';
  const primaryName = itemName.split(' - ')[0] || itemName;

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
                <strong>When &amp; how often the office gets emailed about this item.</strong>
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
                <section className="send-preview-panel">
                  <div className="send-preview-head">
                    <div>
                      <h4>What will actually send</h4>
                      <p>{primaryName} - <b>{itemVesselName}</b> - reminders go to <b>{ownerLabel}</b>{recipients.length ? `, plus ${recipients.length} vessel ${recipients.length === 1 ? 'copy' : 'copies'}` : ''}.</p>
                    </div>
                    <CalendarPlus aria-hidden="true" />
                  </div>

                  {scheduleRows.length === 0 ? (
                    <p className="send-preview-empty">No reminders are on, so nobody will be emailed for this item.</p>
                  ) : (
                    <div className="schedule-timeline">
                      {scheduleRows.map((entry) => (
                        <div className={`schedule-timeline-row${entry.past ? ' is-past' : ''}`} key={`${entry.kind}-${entry.iso}-${entry.sub}`}>
                          <span className="schedule-date">{shortDate(entry.iso)}</span>
                          <span className="schedule-copy">
                            <b>{entry.title}</b>
                            <span>{entry.sub}</span>
                          </span>
                          <span className="schedule-row-actions">
                            <span className={`schedule-tag is-${entry.kind === 'oneoff' && !entry.past ? 'oneoff' : entry.status}`}>
                              {entry.status === 'past' ? 'Past' : entry.kind === 'oneoff' ? 'One-off' : entry.status === 'next' ? 'Next up' : 'Scheduled'}
                            </span>
                            {entry.kind === 'oneoff' ? (
                              <button className="schedule-remove" type="button" aria-label={`Remove one-off date ${formatDate(entry.iso)}`} onClick={() => removeOneOff(entry.iso)}>
                                <X aria-hidden="true" />
                              </button>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="one-off-add-row">
                    <span>+ Add a one-off date</span>
                    <input type="date" min={today} value={oneOffDraft} onChange={(event) => setOneOffDraft(event.target.value)} />
                    <button type="button" onClick={addOneOff} disabled={!oneOffDraft}>Add</button>
                  </div>
                </section>

                <ReminderBlock
                  title="When the item becomes due"
                  sub={startWorkingOn ? `Fires on the start-working date: ${formatDate(startWorkingOn)}` : 'Fires on the start-working date once one is set'}
                  checked={schedule.startActive}
                  onToggle={() => setSchedule((current) => ({ ...current, startActive: !current.startActive }))}
                >
                  <p className="schedule-sentence">Email {ownerLabel} on <span>{startWorkingOn ? formatDate(startWorkingOn) : 'the start-working date'}</span> so the item lands in the work queue when office work can begin.</p>
                </ReminderBlock>

                <ReminderBlock
                  title="Before the deadline"
                  sub={expirationDate ? `Counts back from the expiration date: ${formatDate(expirationDate)}` : 'Counts back from the expiration date once one is set'}
                  checked={schedule.expirationActive}
                  onToggle={() => setSchedule((current) => ({ ...current, expirationActive: !current.expirationActive }))}
                >
                  <p className="schedule-sentence">
                    {sortedLeadTimes.length
                      ? <>Send a heads-up <span>{joinLeadTimes(sortedLeadTimes)} days</span> before the deadline.</>
                      : 'Pick one or more lead times so reminders escalate as the deadline gets closer.'}
                  </p>
                  <div className="schedule-presets">
                    {leadTimePresets.map((leadTime) => (
                      <button className={`schedule-preset${schedule.leadTimes.includes(leadTime) ? ' is-on' : ''}`} type="button" key={leadTime} onClick={() => toggleLeadTime(leadTime)}>
                        {leadTime} {leadTime === 1 ? 'day' : 'days'}
                      </button>
                    ))}
                    <span className="schedule-custom-pill">
                      <span>Custom</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="#"
                        value={customLeadTime}
                        onChange={(event) => setCustomLeadTime(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addCustomLeadTime();
                          }
                        }}
                      />
                      <button type="button" onClick={addCustomLeadTime}>Add</button>
                    </span>
                  </div>
                  {deadlineSends.length ? (
                    <div className="schedule-date-chips">
                      {deadlineSends.map(({ leadTime, iso }) => (
                        <span className={`schedule-date-chip${isPast(iso, today) ? ' is-past' : ''}`} key={leadTime}>
                          <b>{leadTime}d before</b>
                          {shortDate(iso)}
                          <button type="button" aria-label={`Remove ${leadTime} day reminder`} onClick={() => removeLeadTime(leadTime)}>
                            <X aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </ReminderBlock>

                <ReminderBlock
                  title="Keep nudging until it's done"
                  sub="Repeats on a cadence while the item is open"
                  checked={schedule.repeatActive}
                  onToggle={() => setSchedule((current) => ({ ...current, repeatActive: !current.repeatActive }))}
                >
                  <p className="schedule-sentence">Re-send every <span>{schedule.repeatEveryDays} days</span> after work opens, until you mark the item <b>submitted</b>.</p>
                  <div className="schedule-presets">
                    {repeatPresets.map((preset) => (
                      <button
                        className={`schedule-preset${schedule.repeatEveryDays === preset.value ? ' is-on' : ''}`}
                        type="button"
                        key={preset.value}
                        onClick={() => setSchedule((current) => ({ ...current, repeatEveryDays: preset.value }))}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <span className={`schedule-custom-pill${repeatPresets.some((preset) => preset.value === schedule.repeatEveryDays) ? '' : ' is-on'}`}>
                      <span>Every</span>
                      <input
                        type="number"
                        min="1"
                        value={schedule.repeatEveryDays}
                        onChange={(event) => {
                          const parsed = Number.parseInt(event.target.value || '1', 10);
                          setSchedule((current) => ({ ...current, repeatEveryDays: Math.max(1, Number.isInteger(parsed) ? parsed : 1) }));
                        }}
                      />
                      <span>days</span>
                    </span>
                  </div>
                  {recurringRows.length ? (
                    <div className="schedule-date-chips">
                      {recurringRows.slice(0, 5).map((entry) => (
                        <span className={`schedule-date-chip${entry.status === 'next' ? ' is-next' : entry.past ? ' is-past' : ''}`} key={`${entry.kind}-${entry.iso}`}>
                          {shortDate(entry.iso)}
                        </span>
                      ))}
                      {recurringRows.length > 5 ? <span className="schedule-date-chip">+{recurringRows.length - 5} more</span> : null}
                    </div>
                  ) : (
                    <p className="schedule-muted">No nudges land before the deadline at this cadence.</p>
                  )}
                </ReminderBlock>

                <section className="schedule-rule-block is-on">
                  <div className="schedule-rule-head">
                    <div className="schedule-rule-spacer" />
                    <div>
                      <h4>Also copy the vessel</h4>
                      <p>Informational email copies. No login required.</p>
                    </div>
                  </div>
                  <div className="schedule-rule-body">
                    {recipients.length ? (
                      <div className="schedule-recipient-chips">
                        {recipients.map((recipient) => (
                          <span className="schedule-recipient-chip" key={recipient.email}>
                            <b>{recipient.name || 'Vessel copy'}</b>
                            <span>{recipient.email}</span>
                            <button type="button" aria-label={`Remove ${recipient.email}`} onClick={() => setRecipients((current) => current.filter((entry) => entry.email !== recipient.email))}>
                              <X aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="schedule-muted">Just the office contact for now.</p>
                    )}
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
                      />
                      <button type="button" onClick={addRecipient}>Add</button>
                    </div>
                  </div>
                </section>

                <label className="schedule-instructions">
                  Email instructions
                  <textarea name="instructions" rows={4} defaultValue={instructions ?? ''} placeholder="Standing instructions included in reminder emails." />
                </label>
              </div>

              <div className="drawer-foot reminder-schedule-foot">
                <span>Stacked deadline reminders carry forward. One-offs stay with this cycle.</span>
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
