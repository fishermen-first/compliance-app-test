'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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

export function CompleteItemModal({
  itemId,
  itemName,
  itemPathPrefix,
  canEditCore,
  canCreateNext,
  nextStartWorkingOn,
  nextExpirationDate,
  completionDateDefault
}: CompleteItemModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button className="complete-trigger" type="button" onClick={() => setIsOpen(true)}>
        <span>Complete</span>
        <small>Roll forward</small>
      </button>

      {isOpen ? (
        <>
          <div className="modal-scrim" onClick={() => setIsOpen(false)} />
          <div className="roll-modal" role="dialog" aria-modal="true" aria-label="Complete and roll forward">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Complete item</span>
                <strong>{itemName}</strong>
              </div>
              <button className="drawer-icon-button" type="button" aria-label="Close complete item" onClick={() => setIsOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <form action={completeComplianceItem} className="status-form">
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
              {!canEditCore && canCreateNext ? <input type="hidden" name="createNext" value="on" /> : null}
              {!canEditCore && canCreateNext && nextStartWorkingOn ? <input type="hidden" name="nextStartWorkingOn" value={nextStartWorkingOn} /> : null}
              {!canEditCore && canCreateNext && nextExpirationDate ? <input type="hidden" name="nextExpirationDate" value={nextExpirationDate} /> : null}
              <div className="body">
                <label>
                  Completed on
                  <input name="completionDate" type="date" defaultValue={completionDateDefault} required />
                </label>
                <label>
                  Final note
                  <textarea name="finalNotes" rows={3} placeholder="Certificate filed, final confirmation, or document location." />
                </label>
                {canEditCore ? (
                  <>
                    <label className="checkbox-row">
                      <input name="createNext" type="checkbox" defaultChecked={canCreateNext} disabled={!canCreateNext} />
                      Create the next record
                    </label>
                    <label>
                      Next start
                      <input name="nextStartWorkingOn" type="date" defaultValue={nextStartWorkingOn ?? ''} disabled={!canCreateNext} />
                    </label>
                    <label>
                      Next expiration
                      <input name="nextExpirationDate" type="date" defaultValue={nextExpirationDate ?? ''} disabled={!canCreateNext} />
                    </label>
                  </>
                ) : (
                  <p className="form-note">{canCreateNext ? 'The next recurring item will use the saved recurrence dates.' : 'No recurring item will be created because this item has no automatic recurrence.'}</p>
                )}
                <p className="carry-note">Reminder rules, vessel recipients, and instructions carry over automatically when this item rolls forward.</p>
              </div>
              <div className="drawer-foot">
                <button className="secondary-link" type="button" onClick={() => setIsOpen(false)}>Cancel</button>
                <button type="submit">Complete item</button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
