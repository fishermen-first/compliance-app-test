'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { updateComplianceItemCore } from '@/app/actions/items';
import { inferRecurrence, type ComplianceItem, type RecurrenceUnit } from '@/lib/compliance';

type VesselOption = {
  id: string;
  name: string;
};

type OwnerOption = {
  code: string;
  display_name?: string | null;
};

type AgencyOption = {
  id: string;
  name: string;
};

type EditItemDetailsDrawerProps = {
  item: ComplianceItem;
  itemPathPrefix: string;
  vessels: VesselOption[];
  ownerOptions: OwnerOption[];
  agencyOptions: AgencyOption[];
  frequencyOptions: readonly string[];
  referenceListHref: string;
};

export function EditItemDetailsDrawer({
  item,
  itemPathPrefix,
  vessels,
  ownerOptions,
  agencyOptions,
  frequencyOptions,
  referenceListHref
}: EditItemDetailsDrawerProps) {
  const initialAgencyState = useCallback(() => {
    const matchedAgency = agencyOptions.find((agency) => agency.id === item.agency_id) ?? agencyOptions.find((agency) => agency.name === item.agency_type);
    return {
      selectedAgencyId: matchedAgency?.id ?? '',
      agencyNameFallback: matchedAgency ? '' : item.agency_type ?? ''
    };
  }, [agencyOptions, item.agency_id, item.agency_type]);
  const initialFrequencyLabel = useCallback(() => item.frequency_label ?? frequencyOptions[0] ?? 'Annually', [frequencyOptions, item.frequency_label]);
  const initialRecurrenceInterval = useCallback(() => item.recurrence_interval ? String(item.recurrence_interval) : '', [item.recurrence_interval]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAgencyId, setSelectedAgencyId] = useState(() => initialAgencyState().selectedAgencyId);
  const [agencyNameFallback, setAgencyNameFallback] = useState(() => initialAgencyState().agencyNameFallback);
  const [frequencyLabel, setFrequencyLabel] = useState(initialFrequencyLabel);
  const [recurrenceUnit, setRecurrenceUnit] = useState<RecurrenceUnit>(item.recurrence_unit);
  const [recurrenceInterval, setRecurrenceInterval] = useState(initialRecurrenceInterval);
  const selectedOwnerCodes = new Set(item.owner_codes?.length ? item.owner_codes : item.owner_current ? [item.owner_current] : []);

  const ownerLabel = (owner: OwnerOption) => owner.display_name ? `${owner.display_name} (${owner.code})` : owner.code;
  const visibleFrequencyOptions = Array.from(new Set([...frequencyOptions, item.frequency_label].filter((value): value is string => Boolean(value))));
  const selectedAgencyName = agencyOptions.find((agency) => agency.id === selectedAgencyId)?.name ?? agencyNameFallback;

  const selectFrequency = (value: string) => {
    const recurrence = inferRecurrence(value);
    setFrequencyLabel(value);
    setRecurrenceUnit(recurrence.recurrence_unit);
    setRecurrenceInterval(recurrence.recurrence_interval ? String(recurrence.recurrence_interval) : '');
  };

  const selectAgency = (value: string) => {
    setSelectedAgencyId(value);
    if (!value) setAgencyNameFallback('');
  };

  const resetControlledFields = useCallback(() => {
    const agencyState = initialAgencyState();
    setSelectedAgencyId(agencyState.selectedAgencyId);
    setAgencyNameFallback(agencyState.agencyNameFallback);
    setFrequencyLabel(initialFrequencyLabel());
    setRecurrenceUnit(item.recurrence_unit);
    setRecurrenceInterval(initialRecurrenceInterval());
  }, [initialAgencyState, initialFrequencyLabel, initialRecurrenceInterval, item.recurrence_unit]);

  const openDrawer = useCallback(() => {
    resetControlledFields();
    setIsOpen(true);
  }, [resetControlledFields]);

  const closeDrawer = useCallback(() => {
    resetControlledFields();
    setIsOpen(false);
  }, [resetControlledFields]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDrawer, isOpen]);

  return (
    <>
      <button className="secondary-link edit-details-trigger" type="button" onClick={openDrawer}>
        Edit details
      </button>

      {isOpen ? (
        <>
          <div className="drawer-scrim" onClick={closeDrawer} />
          <div className="edit-drawer" role="dialog" aria-modal="true" aria-label="Edit item details">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Edit details</span>
                <strong>{item.item_name}</strong>
              </div>
              <button className="drawer-icon-button" type="button" aria-label="Close edit details" onClick={closeDrawer}>
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
                    <select name="agencyId" value={selectedAgencyId} onChange={(event) => selectAgency(event.target.value)}>
                      {agencyNameFallback ? <option value="">{agencyNameFallback} (not in reference list)</option> : <option value="">No agency</option>}
                      {agencyOptions.map((agency) => <option value={agency.id} key={agency.id}>{agency.name}</option>)}
                    </select>
                    <input type="hidden" name="agencyType" value={selectedAgencyName} />
                  </label>
                  <p className="form-note">Need a new agency? Add it in <Link href={referenceListHref}>Reference lists</Link>, then choose it here.</p>
                </section>
                <section className="fsec">
                  <h4>Who and where</h4>
                  <div className="f2">
                    <label>
                      Primary owner
                      <select name="ownerCurrent" defaultValue={item.owner_current ?? ''}>
                        <option value="">Unassigned</option>
                        {ownerOptions.map((owner) => <option value={owner.code} key={owner.code}>{ownerLabel(owner)}</option>)}
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
                    Original workbook owner code
                    <input name="ownerRaw" defaultValue={item.owner_raw ?? ''} placeholder="Leave blank unless correcting imported data" />
                    <span className="form-note">Use the Owner dropdown for routing. This field is only for preserving imported workbook codes when needed.</span>
                  </label>
                  <div className="owner-checkbox-list">
                    <span>Co-owners</span>
                    <div>
                      {ownerOptions.map((owner) => (
                        <label className="owner-check" key={owner.code}>
                          <input
                            name="ownerCoOwnerCodes"
                            type="checkbox"
                            value={owner.code}
                            defaultChecked={selectedOwnerCodes.has(owner.code) && owner.code !== item.owner_current}
                          />
                          <span>{ownerLabel(owner)}</span>
                        </label>
                      ))}
                    </div>
                    <small>Co-owners can edit, complete, and manage reminders for this item.</small>
                  </div>
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
                      <select name="frequencyLabel" value={frequencyLabel} onChange={(event) => selectFrequency(event.target.value)}>
                        {visibleFrequencyOptions.map((frequency) => <option value={frequency} key={frequency}>{frequency}</option>)}
                      </select>
                    </label>
                    <label>
                      Recurrence unit
                      <select name="recurrenceUnit" value={recurrenceUnit} onChange={(event) => setRecurrenceUnit(event.target.value as RecurrenceUnit)}>
                        <option value="none">None</option>
                        <option value="manual">Manual</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Recurrence interval
                    <input name="recurrenceInterval" type="number" min="1" value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)} />
                  </label>
                </section>
                <section className="fsec">
                  <h4>Notes and documents</h4>
                  <label>
                    Status notes
                    <textarea name="statusNotes" rows={3} defaultValue={item.status_notes ?? ''} />
                  </label>
                  <label>
                    Standing instructions
                    <textarea name="instructions" rows={4} defaultValue={item.instructions ?? ''} />
                  </label>
                  <label>
                    SharePoint link
                    <input name="sharepointUrl" type="url" defaultValue={item.sharepoint_url ?? ''} />
                  </label>
                </section>
              </div>
              <div className="drawer-foot">
                <button className="secondary-link" type="button" onClick={closeDrawer}>Cancel</button>
                <button type="submit">Save details</button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
