'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { type CustomerOwnerCode, type CustomerRole, type CustomerUser } from '@/lib/customer-detail';
import { removeUser, resendInvitation, suspendUser, updateUserAccess } from '../users/actions';

const statusLabel: Record<CustomerUser['status'], string> = {
  active: 'Active',
  pending: 'Invite pending',
  expired: 'Invite expired',
  'needs-email': 'Needs email'
};

const roleLabel: Record<CustomerRole, string> = {
  owner: 'Owner',
  office_admin: 'Customer Admin',
  office_user: 'Office User',
  vessel_user: 'Vessel User'
};

function keyId(userKey: string) {
  return userKey.split(':')[1] ?? userKey;
}

function initials(name: string | null, email: string | null) {
  const source = name || email || '?';
  return source
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function avatarHue(value: string | null) {
  const colors = ['#0f6e63', '#2d5e8f', '#86671d', '#7a3b71', '#3a6e3a', '#7a4e2b', '#5b3f8b', '#3f6c8a'];
  const source = value || 'customer-user';
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return colors[hash % colors.length];
}

function formatDate(value: Date | string | null) {
  if (!value) return 'Never';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function UserEditDrawer({
  customerId,
  ownerCodes,
  user,
  onClose
}: {
  customerId: string;
  ownerCodes: CustomerOwnerCode[];
  user: CustomerUser;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [role, setRole] = useState<CustomerRole>(user.role);
  const [codes, setCodes] = useState(new Set(user.codes));
  const [message, setMessage] = useState('Unsaved changes');
  const visibleRecords = useMemo(
    () => ownerCodes.filter((owner) => codes.has(owner.code)).reduce((sum, owner) => sum + owner.records, 0),
    [codes, ownerCodes]
  );

  useEffect(() => {
    setName(user.name ?? '');
    setEmail(user.email ?? '');
    setRole(user.role);
    setCodes(new Set(user.codes));
    setMessage('Unsaved changes');
  }, [user]);

  function toggleCode(code: string) {
    const next = new Set(codes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setCodes(next);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateUserAccess({
        customerId,
        userKey: user.id,
        name,
        email,
        role,
        codes: Array.from(codes)
      });
      setMessage(result.message);
      router.refresh();
    });
  }

  function resend() {
    if (user.kind !== 'invitation') return;
    startTransition(async () => {
      const result = await resendInvitation(keyId(user.id));
      setMessage(result.message);
      router.refresh();
    });
  }

  function stub(action: 'suspend' | 'remove') {
    if (user.kind !== 'membership') {
      setMessage('Coming soon.');
      return;
    }

    startTransition(async () => {
      const result = action === 'suspend' ? await suspendUser(keyId(user.id)) : await removeUser(keyId(user.id));
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <>
      <div className="cd-drawer-scrim" onClick={onClose} />
      <aside className="cd-drawer" role="dialog" aria-label={`Edit ${user.name ?? user.email ?? 'customer user'}`}>
        <header className="drawer-head">
          <div className="top">
            <div className="avatar" style={{ background: avatarHue(user.name ?? user.email) }}>
              {initials(user.name, user.email)}
            </div>
            <div>
              <h2>{user.name || user.email || 'Customer user'}</h2>
              <div className="sub">
                {statusLabel[user.status]} · {roleLabel[user.role]} · {user.lastLoginAt ? `last login ${formatDate(user.lastLoginAt)}` : 'never logged in'}
              </div>
            </div>
          </div>
          <button className="close" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={save} className="drawer-form">
          <div className="drawer-body">
            <div className="drawer-section">
              <div className="section-head">
                <h3>Identity</h3>
              </div>
              <div className="field">
                <label htmlFor="d-name">Full name</label>
                <input id="d-name" type="text" value={name} onChange={(event) => setName(event.target.value)} />
                <span className="hint">Shown to other customer users on records they touch.</span>
              </div>
              <div className="field">
                <label htmlFor="d-email">Login email</label>
                <input
                  id="d-email"
                  type="email"
                  value={email}
                  placeholder="name@company.com"
                  onChange={(event) => setEmail(event.target.value)}
                />
                <span className="hint">
                  {user.email ? 'Changing email will update this customer login.' : 'Needed before this person can log in.'}
                </span>
                {user.kind === 'invitation' && (user.status === 'pending' || user.status === 'expired') ? (
                  <button type="button" className="inline-action" onClick={resend} disabled={pending}>
                    <RefreshCw aria-hidden="true" /> Resend invite
                  </button>
                ) : null}
              </div>
            </div>

            <div className="drawer-section">
              <div className="section-head">
                <h3>Role &amp; access</h3>
              </div>
              <div className="field">
                <label htmlFor="d-role">Workspace role</label>
                <select id="d-role" value={role} onChange={(event) => setRole(event.target.value as CustomerRole)}>
                  <option value="owner">owner - workspace owner</option>
                  <option value="office_admin">office_admin - customer admin</option>
                  <option value="office_user">office_user - edit assigned work</option>
                  <option value="vessel_user">vessel_user - view only</option>
                </select>
              </div>
            </div>

            <div className="drawer-section">
              <div className="section-head">
                <h3>Owner codes this user can see</h3>
                <span className="meta">{visibleRecords} records visible</span>
              </div>
              <div className="codes-grid">
                {ownerCodes.map((owner) => {
                  const checked = codes.has(owner.code);
                  return (
                    <label key={owner.code} className="code-check" data-checked={checked}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCode(owner.code)} />
                      <div>
                        <div className="label">{owner.code}</div>
                        <div className="count">{owner.displayName ?? 'Workbook owner code'} · {owner.records} records</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="drawer-section">
              <div className="section-head">
                <h3>Audit</h3>
              </div>
              <dl className="audit">
                <div className="row"><dt>Invited by</dt><dd><strong>{user.invitedBy ?? 'Unknown'}</strong> · {formatDate(user.invitedAt)}</dd></div>
                <div className="row"><dt>Last login</dt><dd>{user.lastLoginAt ? formatDate(user.lastLoginAt) : <em>Never</em>}</dd></div>
                <div className="row"><dt>User ID</dt><dd className="mono">{user.id}</dd></div>
              </dl>
            </div>

            <div className="danger-zone">
              <h3>Danger zone</h3>
              <p>Suspending blocks login but preserves records. Removing wipes this person from the workspace.</p>
              <div className="danger-actions">
                <button type="button" onClick={() => stub('suspend')}>Suspend user</button>
                <button type="button" className="solid" onClick={() => stub('remove')}>Remove from workspace</button>
              </div>
            </div>
          </div>

          <footer className="drawer-foot">
            <span className="status-note">{pending ? 'Saving...' : message}</span>
            <span />
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={pending}>Save changes</button>
          </footer>
        </form>
      </aside>
    </>
  );
}
