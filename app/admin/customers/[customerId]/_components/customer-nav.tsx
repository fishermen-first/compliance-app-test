import Link from 'next/link';
import { Activity, Bell, BookOpen, ChevronLeft, Eye, Grid2X2, Settings, ShieldAlert, Tag, UsersRound } from 'lucide-react';
import { type CustomerDetail } from '@/lib/customer-detail';

const sections = [
  { id: 'overview', label: 'Overview', icon: Grid2X2 },
  { id: 'workbook', label: 'Workbook & items', icon: BookOpen },
  { id: 'codes', label: 'Owner codes', icon: Tag },
  { id: 'users', label: 'Users & access', icon: UsersRound },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'activity', label: 'Activity log', icon: Activity }
];

function daysSince(date: Date) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((Date.now() - date.getTime()) / oneDay));
}

function shortTimezone(timezone: string) {
  const labels: Record<string, string> = {
    'America/Los_Angeles': 'PT',
    'America/Anchorage': 'AKT',
    'America/New_York': 'ET'
  };

  return labels[timezone] ?? timezone;
}

function formatRelative(date: Date) {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function badgeFor(sectionId: string, customer: CustomerDetail) {
  if (sectionId === 'overview') return `${customer.gates.filter((gate) => gate.done).length} of ${customer.gates.length}`;
  if (sectionId === 'workbook') return String(customer.itemCount);
  if (sectionId === 'codes') return String(customer.ownerCodeCount);
  if (sectionId === 'users') return String(customer.userCount);
  return null;
}

export function CustomerNav({ customer }: { customer: CustomerDetail }) {
  return (
    <aside className="cd-nav" aria-label="Customer sections">
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
        <div className="group">This customer</div>
        {sections.map((section) => {
          const Icon = section.icon;
          const badge = badgeFor(section.id, customer);
          const active = section.id === 'users';

          return (
            <Link
              className={active ? 'active' : ''}
              href={active ? `/admin/customers/${customer.id}/users` : `/admin/customers/${customer.id}/${section.id}`}
              key={section.id}
            >
              <Icon aria-hidden="true" />
              <span>{section.label}</span>
              {badge ? <span className={`badge${section.id === 'overview' ? ' warn' : ''}`}>{badge}</span> : <span />}
            </Link>
          );
        })}
        <div className="group">Admin</div>
        <Link href={`/?as=${customer.id}`}><Eye aria-hidden="true" /><span>View as customer</span><span /></Link>
        <Link href={`/admin/companies/${customer.id}`}><Settings aria-hidden="true" /><span>Workspace settings</span><span /></Link>
        <Link href={`/admin/companies/${customer.id}#danger`}><ShieldAlert aria-hidden="true" /><span>Danger zone</span><span /></Link>
      </nav>
      <div className="nav-foot">
        <div className="row"><span>Created</span><strong>{formatRelative(customer.createdAt)}</strong></div>
        <div className="row"><span>Last edit</span><strong>{formatRelative(customer.lastEditAt)}{customer.lastEditBy ? ` · ${customer.lastEditBy}` : ''}</strong></div>
        <div className="row"><span>ID</span><strong className="mono">{customer.id.slice(0, 8)}</strong></div>
      </div>
    </aside>
  );
}
