import Link from 'next/link';
import { Archive, Bell, CalendarDays, ClipboardList, HelpCircle, ListChecks, ListTodo, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { signOut } from '@/app/actions/auth';

const navItems = [
  { label: 'Dashboard', icon: ClipboardList, href: '/' },
  { label: 'Tasks', icon: ListTodo, href: '/tasks' },
  { label: 'All items', icon: ListChecks, href: '/items' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar' },
  { label: 'Completed', icon: Archive, href: '/completed' },
  { label: 'Reminders', icon: Bell, href: '/reminders' },
  { label: 'Workspace setup', icon: Settings, href: '/settings' }
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FF';
}

export function AppSidebar({
  companyName,
  userRole,
  userName,
  userEmail,
  dueCount,
  isAppAdmin = false,
  activePath = '/'
}: {
  companyName: string;
  userRole?: string;
  userName?: string | null;
  userEmail?: string | null;
  dueCount?: number;
  isAppAdmin?: boolean;
  activePath?: string;
}) {
  const displayName = userName || userEmail || 'Workspace user';

  return (
    <aside className="app-sidebar">
      <div className="brand-block">
        <div className="brand-mark">{initials(companyName)}</div>
        <div>
          <p>FF Compliance</p>
          <strong>{companyName}</strong>
          {userRole ? <small>{userRole.replaceAll('_', ' ')}</small> : null}
        </div>
      </div>

      <nav className="side-nav" aria-label="Application navigation">
        {[...navItems, ...(isAppAdmin ? [{ label: 'Admin', icon: ShieldCheck, href: '/admin' }] : [])].map((item) => {
          const Icon = item.icon;
          const isDashboard = item.href === '/';
          return (
            <Link className={activePath === item.href ? 'active' : ''} href={item.href} key={item.label}>
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
              {isDashboard && typeof dueCount === 'number' ? <b>{dueCount}</b> : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-user-block">
        <span className="avatar">{initials(displayName)}</span>
        <div>
          <strong>{displayName}</strong>
          <small>{userRole?.replaceAll('_', ' ') ?? 'Workspace access'}</small>
        </div>
        <a href="mailto:support@fishermenfirst.org">
          <HelpCircle aria-hidden="true" />
          <span>Help &amp; support</span>
        </a>
      </div>
      <form action={signOut}>
        <button className="sidebar-logout" type="submit">
          <LogOut aria-hidden="true" />
          <span>Log out</span>
        </button>
      </form>
    </aside>
  );
}
