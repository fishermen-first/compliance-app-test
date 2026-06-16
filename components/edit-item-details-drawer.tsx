'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { updateComplianceItemCore } from '@/app/actions/items';
import { type ComplianceItem } from '@/lib/compliance';

type VesselOption = {
  id: string;
  name: string;
};

type OwnerOption = {
  code: string;
  display_name?: string | null;
};

type EditItemDetailsDrawerProps = {
  item: ComplianceItem;
  itemPathPrefix: string;
  vessels: VesselOption[];
  ownerOptions: OwnerOption[];
};

export function EditItemDetailsDrawer({
  item,
  itemPathPrefix,
  vessels,
  ownerOptions
}: EditItemDetailsDrawerProps) {
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
      <button className="secondary-link edit-details-trigger" type="button" onClick={() => setIsOpen(true)}>
        Edit details
      </button>

      {isOpen ? (
        <>
          <div className="drawer-scrim" onClick={() => setIsOpen(false)} />
          <div className="edit-drawer" role="dialog" aria-modal="true" aria-label="Edit item details">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Edit details</span>
                <strong>{item.item_name}</strong>
              </div>
              <button className="drawer-icon-button" type="button" aria-label="Close edit details" onClick={() => setIsOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <form action={updateComplianceItemCore} className="status-form edit-details-form">
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="itemPathPrefix" value={itemPathPrefix} />
              <div className="body">
                <section className="fsec">
                  <h4>What it is</h4>
                  <label>
                    Item name
                    <input name="itemName" defaultValue={item.item_name} required />
                  </label>
                  <div className="f2">
                    <label>
                      Item number
                      <input name="itemNumber" defaultValue={item.item_number ?? ''} />
                    </label>
                    <label>
                      Compliance area
                      <input name="complianceArea" defaultValue={item.compliance_area ?? 'Other'} required />
                    </label>
                  </div>
                  <label>
                    Agency / Type
                    <input name="agencyType" defaultValue={item.agency_type ?? ''} />
                  </label>
                </section>
                <section className="fsec">
                  <h4>Who and where</h4>
                  <div className="f2">
                    <label>
                      Owner
                      <select name="ownerCurrent" defaultValue={item.owner_current ?? ''}>
                        <option value="">Unassigned</option>
                        {ownerOptions.map((owner) => <option value={owner.code} key={owner.code}>{owner.display_name ? `${owner.code} - ${owner.display_name}` : owner.code}</option>)}
                      </select>
                    </label>
                    <label>
                      Vessel
                      <select name="vesselId" defaultValue={item.vessel_id ?? ''}>
                        <option value="">Company-wide</option>
                        {vessels.map((vessel) => <option value={vessel.id} key={vessel.id}>{vessel.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <label>
                    Owner code (from workbook)
                    <input name="ownerRaw" defaultValue={item.owner_raw ?? ''} placeholder="SN, ES, MA" />
                    <span className="form-note">Preserve the workbook owner code exactly, including compound codes.</span>
                  </label>
                </section>
                <section className="fsec">
                  <h4>Schedule</h4>
                  <div className="f2">
                    <label>
                      Start working on
                      <input name="startWorkingOn" type="date" defaultValue={item.start_working_on ?? ''} />
                    </label>
                    <label>
                      Expiration date
                      <input name="expirationDate" type="date" defaultValue={item.expiration_date ?? ''} />
                    </label>
                  </div>
                  <div className="f2">
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
                  </div>
                  <label>
                    Recurrence interval
                    <input name="recurrenceInterval" type="number" min="1" defaultValue={item.recurrence_interval ?? ''} />
                  </label>
                </section>
                <section className="fsec">
                  <h4>Email and documents</h4>
                  <label>
                    Status notes
                    <textarea name="statusNotes" rows={3} defaultValue={item.status_notes ?? ''} />
                  </label>
                  <label>
                    Instructions pasted into reminder emails
                    <textarea name="instructions" rows={4} defaultValue={item.instructions ?? ''} />
                  </label>
                  <label>
                    SharePoint link
                    <input name="sharepointUrl" type="url" defaultValue={item.sharepoint_url ?? ''} />
                  </label>
                </section>
              </div>
              <div className="drawer-foot">
                <button className="secondary-link" type="button" onClick={() => setIsOpen(false)}>Cancel</button>
                <button type="submit">Save details</button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
