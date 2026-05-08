import Link from 'next/link';
import { CalendarDays, ClipboardList, Gauge, Mail, Settings } from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: Gauge, href: '/', active: true },
  { label: 'Calendar', icon: CalendarDays, href: '#' },
  { label: 'Event List', icon: ClipboardList, href: '#' },
  { label: 'Email Queue', icon: Mail, href: '#' },
  { label: 'Rules', icon: Settings, href: '#' }
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FF';
}

export function AppSidebar({ companyName }: { companyName: string }) {
  return (
    <aside className="app-sidebar">
      <div className="brand-block">
        <div className="brand-mark">{initials(companyName)}</div>
        <div>
          <p>FF Compliance</p>
          <strong>{companyName}</strong>
        </div>
      </div>

      <nav className="side-nav" aria-label="Application navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link className={item.active ? 'active' : ''} href={item.href} key={item.label}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-status">
        <span />
        <div>
          <strong>All systems operational</strong>
          <small>v0.1.0 · connected to Supabase</small>
        </div>
      </div>
    </aside>
  );
}
