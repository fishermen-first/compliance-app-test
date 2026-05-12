'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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

export function OwnerDrawer({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const name = row.target?.display_name ?? row.ownerDisplayName ?? null;
  const email = row.target?.email ?? null;

  useEffect(() => {
    if (!open) return;

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
