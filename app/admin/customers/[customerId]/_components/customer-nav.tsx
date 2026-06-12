'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ChevronLeft, Database, Eye, Grid2X2, ShieldAlert, SlidersHorizontal, Tag, UserPlus, UsersRound } from 'lucide-react';

type Gate = {
  id: 'workbook' | 'codes' | 'users' | 'verify';
  label: string;
  done: boolean;
  detail: string;
  current: boolean;
};

export type CustomerNavData = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  vesselCount: number;
  itemCount: number;
  ownerCodeCount: number;
  userCount: number;
  pendingInvitationCount: number;
  gates: Gate[];
  lastEditAt: string;
  lastEditBy: string | null;
};

const sections = [
  { id: 'overview', label: 'Overview', icon: Grid2X2 },
  { id: 'setup', label: 'Setup', icon: SlidersHorizontal },
  { id: 'import', label: 'Import review', icon: Database },
  { id: 'codes', label: 'Owner codes', icon: Tag },
  { id: 'users', label: 'Users & access', icon: UsersRound },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
  { id: 'danger', label: 'Danger zone', icon: ShieldAlert }
] as const;

function daysSince(value: string) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((Date.now() - new Date(value).getTime()) / oneDay));
}

function shortTimezone(timezone: string) {
  const labels: Record<string, string> = {
    'America/Los_Angeles': 'PT',
    'America/Anchorage': 'AKT',
    'America/New_York': 'ET'
  };

  return labels[timezone] ?? timezone;
}

function formatRelative(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function badgeFor(sectionId: string, customer: CustomerNavData) {
  if (sectionId === 'overview') return `${customer.gates.filter((gate) => gate.done).length}/${customer.gates.length}`;
  if (sectionId === 'setup') return customer.gates.find((gate) => gate.current)?.label.split(' ')[0] ?? 'Done';
  if (sectionId === 'import') return String(customer.itemCount);
  if (sectionId === 'codes') return String(customer.ownerCodeCount);
  if (sectionId === 'users') return String(customer.userCount);
  if (sectionId === 'diagnostics') return String(customer.pendingInvitationCount);
  return null;
}

export function CustomerNav({ customer }: { customer: CustomerNavData }) {
  const pathname = usePathname();

  return (
    <aside className="cd-nav" aria-label="FF Admin customer portal">
      <Link href="/admin" className="back">
        <ChevronLeft aria-hidden="true" /> All customers
      </Link>
      <div className="customer-head">
        <h2 className="name">{customer.name}</h2>
        <div className="meta">
          <span className="pill onboarding">Onboarding · day {daysSince(customer.createdAt)}</span>
          <span className="pill">{shortTimezone(customer.timezone)} · {customer.vesselCount} vessels</span>
        </div>
      </div>
      <nav className="sections">
        <div className="group">Customer cockpit</div>
        {sections.map((section) => {
          const Icon = section.icon;
          const badge = badgeFor(section.id, customer);
          const href = `/admin/customers/${customer.id}/${section.id}`;
          const active = pathname === href || (section.id === 'overview' && pathname === `/admin/customers/${customer.id}`);

          return (
            <Link className={active ? 'active' : ''} href={href} key={section.id}>
              <Icon aria-hidden="true" />
              <span>{section.label}</span>
              {badge ? <span className={`badge${section.id === 'overview' ? ' warn' : ''}`}>{badge}</span> : <span />}
            </Link>
          );
        })}
        <div className="group">Read-only support</div>
        <Link href={`/admin/customers/${customer.id}/diagnostics#queue-visibility`}><Eye aria-hidden="true" /><span>Queue diagnostics</span><span /></Link>
        <Link href={`/admin/customers/${customer.id}/users`}><UserPlus aria-hidden="true" /><span>Stage users</span><span>{customer.pendingInvitationCount}</span></Link>
      </nav>
      <div className="nav-foot">
        <div className="row"><span>Created</span><strong>{formatRelative(customer.createdAt)}</strong></div>
        <div className="row"><span>Last edit</span><strong>{formatRelative(customer.lastEditAt)}{customer.lastEditBy ? ` · ${customer.lastEditBy}` : ''}</strong></div>
        <div className="row"><span>ID</span><strong className="mono">{customer.id.slice(0, 8)}</strong></div>
      </div>
    </aside>
  );
}
