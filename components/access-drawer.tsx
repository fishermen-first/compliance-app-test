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
  target_user_id: string | null;
  email: string | null;
  display_name: string | null;
  display_name_source_owner_code: string | null;
  role: AppRole;
  owner_codes: string[];
  app_admin_contamination: boolean | null;
  can_update_role: boolean | null;
  can_remove: boolean | null;
  can_cancel: boolean | null;
  can_update_owner_codes: boolean | null;
  can_clear_owner_codes: boolean | null;
  invited_by_display_name: string | null;
  invited_at: string | null;
  joined_at: string | null;
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

const permissionCopy: Record<AppRole, string> = {
  owner: 'Owners can edit all records, invite users, manage owner-codes, and change workspace settings.',
  office_admin: 'Office admins can edit all compliance records, invite office_users and vessel_users, and manage owner-code assignments.',
  office_user: 'Office users only see records assigned to their owner codes.',
  vessel_user: 'Vessel users can update compliance items for their assigned vessels.'
};

const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

function roleChoices(actorRole: AppRole, currentRole: AppRole) {
  const choices = actorRole === 'office_admin'
    ? roleOptions.filter((option) => option.value === 'office_user' || option.value === 'vessel_user')
    : roleOptions;

  if (choices.some((option) => option.value === currentRole)) return choices;

  return [{ value: currentRole, label: currentRole }, ...choices];
}

function formatDrawerDate(value: string | null) {
  if (!value) return 'date unavailable';

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'date unavailable';

  return dateFormatter.format(new Date(timestamp));
}

export function AccessDrawer({
  row,
  companyId,
  ownerCodes,
  actorRole,
  viewerId
}: {
  row: Row;
  companyId: string;
  ownerCodes: OwnerCode[];
  actorRole: AppRole;
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(row.owner_codes);
  const initiallySelected = useMemo(() => new Set(row.owner_codes), [row.owner_codes]);
  const isInvite = row.target_kind === 'invitation';
  const isSelf = row.target_kind === 'membership' && (row.target_user_id === viewerId || row.target_id === viewerId);
  const name = row.display_name ?? 'No name on file';
  const canUpdateRole = !isSelf && Boolean(row.can_update_role);
  const canUpdateDisplayName = isSelf && row.target_kind === 'membership';
  const showOwnerCodes = !isSelf && row.role === 'office_user';
  const canUpdateOwnerCodes = showOwnerCodes && Boolean(row.can_update_owner_codes);
  const canClearOwnerCodes = showOwnerCodes && Boolean(row.can_clear_owner_codes);
  const canSubmitOwnerCodes = canUpdateOwnerCodes || canClearOwnerCodes;
  const canSave = canUpdateDisplayName || canUpdateRole || canSubmitOwnerCodes;
  const showDangerZone = !isSelf && Boolean(row.can_cancel || row.can_remove);
  const subline = isInvite
    ? `Pending invite - sent by ${row.invited_by_display_name ?? 'unknown sender'} on ${formatDrawerDate(row.invited_at)}`
    : `Active member - joined ${formatDrawerDate(row.joined_at)}`;

  useEffect(() => {
    if (!open) return;

    setSelectedCodes(row.owner_codes);

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, row.owner_codes]);

  function toggleCode(code: string) {
    const canToggle = canUpdateOwnerCodes || (canClearOwnerCodes && initiallySelected.has(code));

    if (!canToggle) return;

    setSelectedCodes((currentCodes) => (
      currentCodes.includes(code)
        ? currentCodes.filter((selectedCode) => selectedCode !== code)
        : [...currentCodes, code]
    ));
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
                <p className="eyebrow">{isSelf ? 'Your access' : 'Manage access'}</p>
                <h2>{name}</h2>
                <div className="sub">{subline}</div>
              </div>
              <button className="drawer-close" type="button" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
            </div>

            <form action={updateAccessDrawerSettings} className="drawer-body">
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="targetKind" value={row.target_kind} />
              <input type="hidden" name="targetId" value={row.target_id} />
              <input type="hidden" name="updateDisplayName" value={canUpdateDisplayName ? 'true' : 'false'} />
              <input type="hidden" name="updateRole" value={canUpdateRole ? 'true' : 'false'} />
              <input type="hidden" name="updateOwnerCodes" value={canSubmitOwnerCodes ? 'true' : 'false'} />

              <div className="field">
                <label htmlFor={`display-name-${row.target_id}`}>Display name</label>
                {isSelf ? (
                  <input id={`display-name-${row.target_id}`} name="displayName" type="text" defaultValue={row.display_name ?? ''} />
                ) : (
                  <div className="value-readonly">
                    <div>{name}</div>
                    {row.display_name_source_owner_code ? (
                      <div className="drawer-field-note">from owner-code {row.display_name_source_owner_code}</div>
                    ) : null}
                    {!isInvite ? (
                      <>
                        <div className="drawer-field-note">Set by the user in their account settings.</div>
                        <button className="field-link" type="button">Suggest a correction -&gt;</button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="field">
                <span className="label-text">Login email</span>
                <div className="value-readonly">
                  <div>{row.email ?? 'No email on file'}</div>
                  {isSelf ? <button className="field-link" type="button">Change in account settings -&gt;</button> : null}
                </div>
              </div>

              <div className="field">
                <span className="label-text">Status</span>
                <div className="value-readonly">
                  <span className={`chip ${isInvite ? 'invite-pending' : 'active'}`}>{isInvite ? 'Invite pending' : 'Active'}</span>
                </div>
              </div>

              <div className="field">
                {canUpdateRole ? (
                  <>
                    <label htmlFor={`role-${row.target_id}`}>Role</label>
                    <select id={`role-${row.target_id}`} name="role" defaultValue={row.role}>
                      {roleChoices(actorRole, row.role).map((option) => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <span className="label-text">Role</span>
                    <div className="value-readonly"><span className="role-tag">{row.role}</span></div>
                  </>
                )}
                {!isSelf ? <p className="perm-note">{permissionCopy[row.role]}</p> : null}
              </div>

              {showOwnerCodes ? (
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
              ) : null}

              {showDangerZone ? (
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
