'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { mapOwnerCodeToAccessTarget } from '@/app/settings/actions';

type MappingTarget = {
  target_kind: 'membership' | 'invitation';
  target_id: string;
  email: string | null;
  display_name: string | null;
};

type Row = {
  code: string;
  records: number;
  ownerDisplayName: string | null;
  target: {
    target_kind: 'membership' | 'invitation';
    target_id: string;
    email: string | null;
    display_name: string | null;
    role: string;
    owner_codes: string[];
  } | null;
  status: {
    label: string;
    className: string;
    nextAction?: string;
  };
};

function mappingTargetKey(target: MappingTarget) {
  return `${target.target_kind}:${target.target_id}`;
}

function mappingTargetLabel(target: MappingTarget) {
  const name = target.display_name?.trim();
  const identity = name && target.email ? `${name} · ${target.email}` : name ?? target.email ?? 'Unnamed user';
  const status = target.target_kind === 'invitation' ? ' · invite pending' : '';

  return `${identity}${status}`;
}

export function OwnerDrawer({
  row,
  companyId,
  mappingTargets
}: {
  row: Row;
  companyId: string;
  mappingTargets: MappingTarget[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedTargetKey, setSelectedTargetKey] = useState('');
  const targetSelectId = useId();
  const name = row.target?.display_name ?? row.ownerDisplayName ?? null;
  const email = row.target?.email ?? null;
  const selectedTarget = mappingTargets.find((target) => mappingTargetKey(target) === selectedTargetKey) ?? null;

  useEffect(() => {
    if (!open) return;

    setSelectedTargetKey('');

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <>
      <article
        className="owner-row"
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
        <div><strong className="code">{row.code}</strong></div>
        <div className="records"><strong>{row.records}</strong></div>
        <div className="identity">
          <span className={`name${name ? '' : ' empty'}`}>{name ?? 'No customer user'}</span>
          <span className={`addr${email ? '' : ' empty'}`}>{email ?? 'Not assigned'}</span>
        </div>
        <div><span className={`chip ${row.status.className}`}>{row.status.label}</span></div>
        <div className="row-chevron" aria-hidden="true">&rsaquo;</div>
      </article>

      {open ? (
        <>
          <div className="scrim open" onClick={() => setOpen(false)} />
          <aside className="drawer open" role="dialog" aria-modal="true" aria-label={`Owner code ${row.code}`}>
            <div className="drawer-head">
              <div className="drawer-title-block">
                <p className="eyebrow">Owner code</p>
                <h2>{row.code} &middot; {row.ownerDisplayName ?? 'Workbook owner code'}</h2>
                <div className="sub">{row.records} compliance {row.records === 1 ? 'record' : 'records'}</div>
              </div>
              <button className="drawer-close" type="button" onClick={() => setOpen(false)} aria-label="Close">&times;</button>
            </div>

            <div className="drawer-body">
              <div className="field">
                <span className="label-text">Mapped customer user</span>
                <div className="value-readonly">
                  {name ? (
                    <>
                      <div className="drawer-identity-name">{name}</div>
                      <div className="drawer-identity-email">{email ?? 'No login email assigned'}</div>
                    </>
                  ) : (
                    <em>No customer user assigned</em>
                  )}
                </div>
              </div>

              <div className="field">
                <span className="label-text">Status</span>
                <div className="value-readonly">
                  <span className={`chip ${row.status.className}`}>{row.status.label}</span>
                  {row.status.nextAction ? <div className="drawer-field-note">{row.status.nextAction}</div> : null}
                </div>
              </div>

              <div className="field">
                <span className="label-text">Records</span>
                <div className="value-readonly">
                  <Link className="drawer-record-link" href={`/?owner=${encodeURIComponent(row.code)}`}>
                    View {row.records} {row.records === 1 ? 'record' : 'records'}
                  </Link>
                </div>
              </div>

              {!row.target ? (
                <div className="field">
                  {mappingTargets.length > 0 ? (
                    <form action={mapOwnerCodeToAccessTarget} className="owner-map-form">
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="ownerCode" value={row.code} />
                      {selectedTarget ? (
                        <>
                          <input type="hidden" name="targetKind" value={selectedTarget.target_kind} />
                          <input type="hidden" name="targetId" value={selectedTarget.target_id} />
                        </>
                      ) : null}
                      <label htmlFor={targetSelectId}>Map to person</label>
                      <select
                        id={targetSelectId}
                        value={selectedTargetKey}
                        onChange={(event) => setSelectedTargetKey(event.target.value)}
                      >
                        <option value="">Choose a person</option>
                        {mappingTargets.map((target) => (
                          <option key={mappingTargetKey(target)} value={mappingTargetKey(target)}>
                            {mappingTargetLabel(target)}
                          </option>
                        ))}
                      </select>
                      <p className="drawer-field-note">
                        This adds {row.code} without removing the person&apos;s existing owner codes.
                      </p>
                      <button className="btn-primary" type="submit" disabled={!selectedTarget}>
                        Map owner code
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="label-text">Map to person</span>
                      <p className="drawer-field-note">
                        No eligible customer users are available. Ask FF Admin to add or invite the person first.
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div className="drawer-foot">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Close</button>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
