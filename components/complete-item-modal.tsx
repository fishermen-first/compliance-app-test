'use client';

import { useRef, useState } from 'react';
import { completeComplianceItem } from '@/app/actions/items';

type CompleteItemModalProps = {
  itemId: string;
  itemName: string;
  itemPathPrefix: string;
  canEditCore: boolean;
  canCreateNext: boolean;
  nextStartWorkingOn: string | null;
  nextExpirationDate: string | null;
  completionDateDefault: string;
};

export function CompleteItemModal({ itemId, itemName, itemPathPrefix, canEditCore, canCreateNext, nextStartWorkingOn, nextExpirationDate, completionDateDefault }: CompleteItemModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState(canCreateNext ? 'automatic' : 'none');
  const [nextStart, setNextStart] = useState(nextStartWorkingOn ?? '');
  return <>
    <button className="complete-trigger" type="button" onClick={() => dialog.current?.showModal()}><span>Complete</span><small>Choose next cycle</small></button>
    <dialog ref={dialog} className="workflow-dialog" aria-labelledby={`complete-heading-${itemId}`}>
      <form action={completeComplianceItem}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
        <input type="hidden" name="createNext" value="on" />
        <header><h2 id={`complete-heading-${itemId}`}>Complete item</h2><button type="button" aria-label="Close complete item" onClick={() => dialog.current?.close()}>×</button></header>
        <p><strong>{itemName}</strong></p>
        <label>Completed on<input name="completionDate" type="date" defaultValue={completionDateDefault} required /></label>
        <label>Final note<textarea name="finalNotes" rows={3} placeholder="Certificate filed, final confirmation, or document location." /></label>
        <fieldset className="workflow-choices"><legend>What should happen next?</legend>
          <label><input name="nextRecordMode" type="radio" value="none" checked={mode === 'none'} onChange={() => setMode('none')} /><span>Complete only<small>No follow-up record.</small></span></label>
          {canCreateNext ? <label><input name="nextRecordMode" type="radio" value="automatic" checked={mode === 'automatic'} onChange={() => setMode('automatic')} /><span>Create the next scheduled cycle<small>Use the saved recurrence dates.</small></span></label> : null}
          {canEditCore ? <>
            <label><input name="nextRecordMode" type="radio" value="undated" checked={mode === 'undated'} onChange={() => setMode('undated')} /><span>Create an undated follow-up<small>Keep it in Compliance records as Awaiting schedule until you set dates or start work.</small></span></label>
            <label><input name="nextRecordMode" type="radio" value="dated" checked={mode === 'dated'} onChange={() => setMode('dated')} /><span>Set the next dates<small>Schedule the next cycle now, including manually recurring work.</small></span></label>
          </> : null}
        </fieldset>
        {mode === 'automatic' ? <p className="form-note">Next start: {nextStartWorkingOn ?? 'Not set'} · Next expiration: {nextExpirationDate}</p> : null}
        {mode === 'dated' ? <div className="workflow-date-grid"><label>Next start<input name="nextStartWorkingOn" type="date" value={nextStart} onChange={(event) => setNextStart(event.target.value)} /></label><label>Next expiration<input name="nextExpirationDate" type="date" min={nextStart || undefined} defaultValue={nextExpirationDate ?? ''} required /></label></div> : null}
        <p className="form-note">Follow-ups carry over owners, standing instructions, recurring reminder rules, and recipients. One-off reminders stay with this completed record.</p>
        <footer><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button className="workflow-primary" type="submit">Complete item</button></footer>
      </form>
    </dialog>
  </>;
}
