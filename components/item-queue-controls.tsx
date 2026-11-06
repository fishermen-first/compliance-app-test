'use client';

import { useRef, useState } from 'react';
import { setComplianceItemQueueState } from '@/app/actions/items';
import { formatDate } from '@/lib/compliance';

type Props = {
  itemId: string;
  itemName: string;
  itemPathPrefix?: string;
  returnTo?: string;
  archivedAt?: string | null;
  snoozedUntil?: string | null;
  snoozeReason?: string | null;
  isOpenItem: boolean;
  today: string;
};

export function ItemQueueControls({ itemId, itemName, itemPathPrefix = '/items', returnTo, archivedAt, snoozedUntil, snoozeReason, isOpenItem, today }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<'snooze' | 'archive'>('snooze');
  const snoozed = Boolean(snoozedUntil && snoozedUntil > today);
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);
  const fields = <><input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />{returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}</>;
  function open(nextAction: 'snooze' | 'archive') {
    setAction(nextAction);
    dialog.current?.showModal();
  }

  return (
    <div className="item-queue-controls">
      {archivedAt ? (
        <form action={setComplianceItemQueueState}>{fields}<input type="hidden" name="queueAction" value="restore" /><button type="submit">Restore record</button></form>
      ) : <>
        {isOpenItem ? snoozed ? (
          <form action={setComplianceItemQueueState}>{fields}<input type="hidden" name="queueAction" value="unsnooze" /><button type="submit">Unsnooze</button></form>
        ) : <button type="button" onClick={() => open('snooze')} aria-label={`Snooze ${itemName}`}>Snooze</button> : null}
        <button type="button" onClick={() => open('archive')} aria-label={`Archive ${itemName}`}>Archive</button>
      </>}
      <dialog ref={dialog} className="workflow-dialog" aria-labelledby={`queue-dialog-${itemId}`}>
        <form action={setComplianceItemQueueState} onSubmit={() => dialog.current?.close()}>
          {fields}<input type="hidden" name="queueAction" value={action} />
          <header><h2 id={`queue-dialog-${itemId}`}>{action === 'snooze' ? 'Snooze compliance work' : 'Archive record?'}</h2><button type="button" aria-label="Close" onClick={() => dialog.current?.close()}>×</button></header>
          <p><strong>{itemName}</strong></p>
          {action === 'snooze' ? <>
            <p>Hide this record from the attention queue until your return date. Its expiration, overdue totals, and email reminders stay unchanged.</p>
            <label>Bring back on<input type="date" name="returnOn" min={minDate} defaultValue={snoozed ? snoozedUntil ?? minDate : minDate} required /></label>
            <label>Reason (optional)<textarea name="reason" maxLength={1000} rows={3} defaultValue={snoozeReason ?? ''} placeholder="Waiting for the renewal window" /></label>
            <p className="form-note">Find it any time in Snoozed. It returns automatically on the selected date.</p>
          </> : <>
            <p>Remove this record from active work and stop future compliance reminders. Its history stays available in Archived, where you can restore it.</p>
            <label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option><option>Duplicate record</option><option>Created by mistake</option><option>No longer applicable</option></select></label>
            {snoozed ? <p className="form-note">Its snooze through {formatDate(snoozedUntil ?? null)} will be cleared.</p> : null}
          </>}
          <footer><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button className="workflow-primary" type="submit">{action === 'snooze' ? 'Snooze item' : 'Archive record'}</button></footer>
        </form>
      </dialog>
    </div>
  );
}
