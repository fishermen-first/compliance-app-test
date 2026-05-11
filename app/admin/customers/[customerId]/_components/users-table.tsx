'use client';

import { useMemo, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { type CustomerOwnerCode, type CustomerRole, type CustomerUser } from '@/lib/customer-detail';
import { UserAddDrawer } from './user-add-drawer';
import { UserBulkBar } from './user-bulk-bar';
import { UserEditDrawer } from './user-edit-drawer';
import { UserFilterBar, type UserFilter } from './user-filter-bar';

const statusLabel: Record<CustomerUser['status'], string> = {
  active: 'Active',
  pending: 'Invite pending',
  expired: 'Invite expired',
  'needs-email': 'Needs email'
};

const roleLabel: Record<CustomerRole, string> = {
  customer_admin: 'Customer Admin',
  crew: 'Crew',
  read_only: 'Read-only'
};

type SortKey = 'name' | 'email' | 'role' | 'status' | 'lastLoginAt';

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

function formatRelative(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / (60 * 1000)));

  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / (60 * 24))}d ago`;

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function sortValue(user: CustomerUser, key: SortKey) {
  if (key === 'lastLoginAt') return user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;
  if (key === 'role') return roleLabel[user.role];
  return String(user[key] ?? '').toLowerCase();
}

export function UsersTable({
  customerId,
  ownerCodes,
  users
}: {
  customerId: string;
  ownerCodes: CustomerOwnerCode[];
  users: CustomerUser[];
}) {
  const [filter, setFilter] = useState<UserFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set<string>());
  const [editing, setEditing] = useState<CustomerUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((user) => user.status === 'active').length,
      pending: users.filter((user) => user.status === 'pending' || user.status === 'expired').length,
      attention: users.filter((user) => user.status === 'needs-email' || user.status === 'expired').length
    }),
    [users]
  );
  const rows = useMemo(() => {
    let next = users;
    const query = search.trim().toLowerCase();

    if (filter === 'active') next = next.filter((user) => user.status === 'active');
    if (filter === 'pending') next = next.filter((user) => user.status === 'pending' || user.status === 'expired');
    if (filter === 'attention') next = next.filter((user) => user.status === 'needs-email' || user.status === 'expired');
    if (query) {
      next = next.filter((user) =>
        (user.name ?? '').toLowerCase().includes(query) ||
        (user.email ?? '').toLowerCase().includes(query) ||
        user.codes.some((code) => code.toLowerCase().includes(query))
      );
    }

    return [...next].sort((a, b) => {
      const aValue = sortValue(a, sort.key);
      const bValue = sortValue(b, sort.key);
      const direction = sort.direction === 'asc' ? 1 : -1;
      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
      return 0;
    });
  }, [filter, search, sort, users]);
  const visibleSelected = rows.filter((row) => selected.has(row.id));
  const selectedUsers = users.filter((user) => selected.has(user.id));
  const allVisibleSelected = rows.length > 0 && visibleSelected.length === rows.length;

  function toggle(userId: string) {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelected(next);
  }

  function toggleAll() {
    if (allVisibleSelected) {
      const next = new Set(selected);
      rows.forEach((row) => next.delete(row.id));
      setSelected(next);
    } else {
      setSelected(new Set([...Array.from(selected), ...rows.map((row) => row.id)]));
    }
  }

  function sortBy(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  return (
    <>
      <UserFilterBar filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} counts={counts} onAddUser={() => setAdding(true)} />

      {message ? <div className="cd-inline-message" role="status">{message}</div> : null}

      {selectedUsers.length > 0 ? (
        <UserBulkBar selectedUsers={selectedUsers} onClear={() => setSelected(new Set())} onMessage={setMessage} />
      ) : null}

      <div className="cd-table" role="grid" aria-label="Customer users">
        <div className="row head" role="row">
          <div className="checkbox">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" />
          </div>
          <button type="button" onClick={() => sortBy('name')}>User</button>
          <button type="button" onClick={() => sortBy('email')}>Email</button>
          <button type="button" onClick={() => sortBy('role')}>Role</button>
          <span>Owner codes</span>
          <button type="button" onClick={() => sortBy('status')}>Status</button>
          <button type="button" onClick={() => sortBy('lastLoginAt')}>Last login</button>
          <span aria-hidden="true" />
        </div>
        {rows.map((user) => (
          <div
            key={user.id}
            className="row body"
            role="row"
            data-selected={selected.has(user.id)}
            onClick={() => setEditing(user)}
          >
            <div className="checkbox" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
                aria-label={`Select ${user.name ?? user.email ?? 'customer user'}`}
              />
            </div>
            <div className="user-cell">
              <div className="avatar" style={{ background: avatarHue(user.name ?? user.email) }}>
                {initials(user.name, user.email)}
              </div>
              <div className="minw-0">
                <div className={`name${user.name ? '' : ' empty'}`}>{user.name || 'No name'}</div>
                <div className="sub">{user.invitedBy ? `Invited by ${user.invitedBy}` : user.kind === 'invitation' ? 'Pending invite' : 'Workspace member'}</div>
              </div>
            </div>
            <div className={`email-cell${user.email ? '' : ' empty'}`}>{user.email || 'No email on file'}</div>
            <div className="role-cell">
              <span className="cd-role-label">{roleLabel[user.role]}</span>
            </div>
            <div className={`codes-cell${user.codes.length === 0 ? ' empty' : ''}`}>
              {user.codes.length === 0
                ? '-'
                : user.codes.length === ownerCodes.length && ownerCodes.length > 0
                  ? <span className="code-pill all">All codes</span>
                  : user.codes.map((code) => <span key={code} className="code-pill">{code}</span>)}
            </div>
            <span className={`cd-chip ${user.status}`}>{statusLabel[user.status]}</span>
            <div className={`last-login${user.lastLoginAt ? '' : ' never'}`}>{formatRelative(user.lastLoginAt) || 'Never'}</div>
            <div className="row-menu" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-label="Row actions" onClick={() => setEditing(user)}>
                <MoreHorizontal aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <div className="cd-table-empty">No users match the current filters.</div> : null}
        <div className="cd-tablefoot">
          <span><strong>{rows.length}</strong> of {users.length} users</span>
          <span>Click any row to edit access</span>
        </div>
      </div>

      {editing ? <UserEditDrawer customerId={customerId} ownerCodes={ownerCodes} user={editing} onClose={() => setEditing(null)} /> : null}
      {adding ? <UserAddDrawer customerId={customerId} ownerCodes={ownerCodes} onClose={() => setAdding(false)} /> : null}
    </>
  );
}
