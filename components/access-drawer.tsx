'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  cancelPendingInvite,
  removeMemberAccess,
  updateAccessDrawerSettings
} from '@/app/settings/actions';
import { type Database } from '@/lib/database.types';

type AppRole = Database['public']['Enums']['app_role'];

type Row = {
  target_kind: 'membership' | 'invitation';
  target_id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole;
  owner_codes: string[];
  app_admin_contamination: boolean | null;
  can_update_role: boolean | null;
  can_remove: boolean | null;
  can_cancel: boolean | null;
  can_update_owner_codes: boolean | null;
  can_clear_owner_codes: boolean | null;
};

type OwnerCode = {
  code: string;
  display_name: string | null;
};

const roleOptions: Array<{ value: AppRole; label: string }> = [
  { value: 'owner', label: 'owner' },
  { value: 'office_admin', label: 'office_admin' },
  { value: 'office_user', label: 'office_user' },
  { value: 'vessel_user', label: 'vessel_user' }
];

function roleChoices(actorRole: AppRole, currentRole: AppRole) {
  const choices = actorRole === 'office_admin'
    ? roleOptions.filter((option) => option.value === 'office_user' || option.value === 'vessel_user')
    : roleOptions;

  if (choices.some((option) => option.value === currentRole)) return choices;

  return [{ value: currentRole, label: currentRole }, ...choices];
}

export function AccessDrawer({
  row,
  companyId,
  ownerCodes,
  actorRole
}: {
  row: Row;
  companyId: string;
  ownerCodes: OwnerCode[];
  actorRole: AppRole;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(row.owner_codes);
  const initiallySelected = useMemo(() => new Set(row.owner_codes), [row.owner_codes]);
  const isInvite = row.target_kind === 'invitation';
  const name = row.display_name ?? 'No name on file';
  const canUpdateRole = Boolean(row.can_update_role);
  const canUpdateOwnerCodes = Boolean(row.can_update_owner_codes);
  const canClearOwnerCodes = Boolean(row.can_clear_owner_codes);
  const canSubmitOwnerCodes = canUpdateOwnerCodes || canClearOwnerCodes;
  const canSave = canUpdateRole || canSubmitOwnerCodes;

  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  function toggleCode(code: string) {
    const selected = selectedCodes.includes(code);

    if (!canUpdateOwnerCodes && !(canClearOwnerCodes && initiallySelected.has(code))) {
      return;
    }

    setSelectedCodes(selected ? selectedCodes.filter((selectedCode) => selectedCode !== code) : [...selectedCodes, code]);
  }

  return (
    <>
      <article
        className="access-row"
        role="listitem"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="identity">
          <span className={`name${row.display_name ? '' : ' empty'}`}>
            {name}
            {row.app_admin_contamination ? <small>FF Admin warning</small> : null}
          </span>
          <span className={`addr${row.email ? '' : ' empty'}`}>{row.email ?? 'No email on file'}</span>
        </div>
        <div>
          <span className={`chip ${isInvite ? 'invite-pending' : 'active'}`}>{isInvite ? 'Invite pending' : 'Active'}</span>
        </div>
        <div><span className="role-tag">{row.role}</span></div>
        <div>
          {row.owner_codes.length > 0 ? (
            <div className="code-strip">
              {row.owner_codes.map((code) => <span key={code} className="code-pill">{code}</span>)}
            </div>
          ) : (
            <span className="code-pill empty">No codes</span>
          )}
        </div>
        <div className="row-chevron" aria-hidden="true">&rsaquo;</div>
      </article>

      {open ? (
        <>
          <div className="scrim open" onClick={() => setOpen(false)} />
          <aside className="drawer open" role="dialog" aria-modal="true" aria-label={`Manage ${row.email ?? name}`}>
            <div className="drawer-head">
              <div className="drawer-title-block">
                <p className="eyebrow">Manage access</p>
                <h2>{name}</h2>
                <div className="sub">{row.email ?? 'No email on file'}</div>
              </div>
              <button className="drawer-close" type="button" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
            </div>

            <form action={updateAccessDrawerSettings} className="drawer-body">
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="targetKind" value={row.target_kind} />
              <input type="hidden" name="targetId" value={row.target_id} />
              <input type="hidden" name="updateRole" value={canUpdateRole ? 'true' : 'false'} />
              <input type="hidden" name="updateOwnerCodes" value={canSubmitOwnerCodes ? 'true' : 'false'} />

              <div className="field">
                <span className="label-text">Status</span>
                <div className="value-readonly">
                  <span className={`chip ${isInvite ? 'invite-pending' : 'active'}`}>{isInvite ? 'Invite pending' : 'Active'}</span>
                </div>
              </div>

              <div className="field">
                <label htmlFor={`role-${row.target_id}`}>Role</label>
                <select id={`role-${row.target_id}`} name="role" defaultValue={row.role} disabled={!canUpdateRole}>
                  {roleChoices(actorRole, row.role).map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span className="label-text">Owner codes</span>
                <div className="field-pill-picker">
                  {ownerCodes.map((ownerCode) => {
                    const selected = selectedCodes.includes(ownerCode.code);
                    const canToggle = canUpdateOwnerCodes || (canClearOwnerCodes && initiallySelected.has(ownerCode.code));

                    return (
                      <button
                        key={ownerCode.code}
                        type="button"
                        className={`pill-toggle${selected ? ' on' : ''}`}
                        disabled={!canToggle}
                        onClick={() => toggleCode(ownerCode.code)}
                      >
                        {ownerCode.code}
                      </button>
                    );
                  })}
                </div>
                {canSubmitOwnerCodes ? selectedCodes.map((code) => (
                  <input key={code} type="hidden" name="ownerCodes" value={code} />
                )) : null}
              </div>

              {row.can_cancel || row.can_remove ? (
                <div className="destructive-block">
                  <span className="label-text">Danger zone</span>
                  {isInvite ? (
                    <>
                      <p>Canceling this invite removes the pending email from the workspace. They can be invited again later.</p>
                      <button className="btn-danger-link" type="submit" formAction={cancelPendingInvite}>Cancel invite</button>
                    </>
                  ) : (
                    <>
                      <p>Removing access revokes this person from the workspace immediately.</p>
                      <button className="btn-danger-link" type="submit" formAction={removeMemberAccess}>Remove access</button>
                    </>
                  )}
                </div>
              ) : null}

              <div className="drawer-foot">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={!canSave}>Save changes</button>
              </div>
            </form>
          </aside>
        </>
      ) : null}
    </>
  );
}
