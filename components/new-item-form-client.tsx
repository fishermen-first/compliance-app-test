'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';

const reminderLeadDays = [14, 7, 3];

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function subtractDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
}

function formatPreviewDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

type NewItemSchedulePreviewProps = {
  formId: string;
};

export function NewItemSchedulePreview({ formId }: NewItemSchedulePreviewProps) {
  const [expirationDate, setExpirationDate] = useState('');
  const [frequencyLabel, setFrequencyLabel] = useState('Annually');
  const dueDate = useMemo(() => parseLocalDate(expirationDate), [expirationDate]);
  const reminderDates = useMemo(() => dueDate ? reminderLeadDays.map((days) => ({ days, date: subtractDays(dueDate, days) })) : [], [dueDate]);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const readForm = () => {
      const formData = new FormData(form);
      setExpirationDate(String(formData.get('expirationDate') ?? ''));
      setFrequencyLabel(String(formData.get('frequencyLabel') ?? 'Annually') || 'Annually');
    };
    const expirationInput = form.elements.namedItem('expirationDate');
    const frequencyInput = form.elements.namedItem('frequencyLabel');
    const inputs = [expirationInput, frequencyInput].filter((input): input is HTMLElement => input instanceof HTMLElement);

    readForm();
    inputs.forEach((input) => {
      input.addEventListener('input', readForm);
      input.addEventListener('change', readForm);
    });

    return () => {
      inputs.forEach((input) => {
        input.removeEventListener('input', readForm);
        input.removeEventListener('change', readForm);
      });
    };
  }, [formId]);

  if (!dueDate) {
    return (
      <div className="new-item-schedule-preview" data-empty="true" aria-live="polite">
        <span className="new-item-preview-mark" aria-hidden="true">14</span>
        <div>
          <h3>Set a due date to preview reminders</h3>
          <p>Once this item has an expiration date, the default reminder cadence appears here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="new-item-schedule-preview" aria-live="polite">
      <span className="new-item-preview-mark" aria-hidden="true">3</span>
      <div>
        <h3>3 reminders will be scheduled</h3>
        <p>{frequencyLabel} item due {formatPreviewDate(dueDate)}. The selected owner codes are emailed at each lead time, stopping once submitted.</p>
        <div className="new-item-preview-dates">
          {reminderDates.map((reminder) => (
            <span className="new-item-preview-date" key={reminder.days}>
              {formatPreviewDate(reminder.date)} ({reminder.days}d before)
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type NewItemNotesDisclosureProps = {
  children: ReactNode;
};

export function NewItemNotesDisclosure({ children }: NewItemNotesDisclosureProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`new-item-disclosure${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="new-item-disclosure-button"
        aria-expanded={open}
        aria-controls="new-item-notes-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronRight className="new-item-disclosure-icon" aria-hidden="true" />
        <span>Notes &amp; links</span>
        <strong>Optional</strong>
      </button>
      <div className="new-item-disclosure-body" id="new-item-notes-panel">
        {children}
      </div>
    </section>
  );
}
