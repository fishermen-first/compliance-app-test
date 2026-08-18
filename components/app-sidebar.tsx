import Link from 'next/link';
import { Archive, Bell, CalendarDays, ClipboardList, HelpCircle, ListChecks, ListTodo, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { signOut } from '@/app/actions/auth';

const navSections = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', description: 'Compliance + task overview', icon: ClipboardList, href: '/' }
    ]
  },
  {
    label: 'Your work',
    items: [
      { label: 'Tasks', description: 'Personal and assigned to-dos', icon: ListTodo, href: '/tasks' }
    ]
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Compliance records', description: 'All requirements and deadlines', icon: ListChecks, href: '/items' },
      { label: 'Compliance schedule', description: 'Plan start and expiration dates', icon: CalendarDays, href: '/calendar' },
      { label: 'Completed records', description: 'Finished compliance history', icon: Archive, href: '/completed' },
      { label: 'Reminder center', description: 'Schedules and delivery activity', icon: Bell, href: '/reminders' }
    ]
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Workspace settings', description: 'People, vessels, and lists', icon: Settings, href: '/settings' }
    ]
  }
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
  dueLabel = 'compliance items due',
  isAppAdmin = false,
  activePath = '/'
}: {
  companyName: string;
  userRole?: string;
  userName?: string | null;
  userEmail?: string | null;
  dueCount?: number;
  dueLabel?: string;
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
        {navSections.map((section) => (
          <section className="side-nav-section" aria-labelledby={`side-nav-${section.label.toLowerCase().replaceAll(' ', '-')}`} key={section.label}>
            <h2 id={`side-nav-${section.label.toLowerCase().replaceAll(' ', '-')}`}>{section.label}</h2>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isDashboard = item.href === '/';
              return (
                <Link className={activePath === item.href ? 'active' : ''} href={item.href} key={item.label}>
                  <Icon aria-hidden="true" />
                  <span className="side-nav-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {isDashboard && typeof dueCount === 'number' ? <b aria-label={`${dueCount} ${dueLabel}`} title={`${dueCount} ${dueLabel}`}>{dueCount}</b> : null}
                </Link>
              );
            })}
          </section>
        ))}
        {isAppAdmin ? (
          <section className="side-nav-section" aria-labelledby="side-nav-platform">
            <h2 id="side-nav-platform">Platform</h2>
            <Link className={activePath === '/admin' ? 'active' : ''} href="/admin">
              <ShieldCheck aria-hidden="true" />
              <span className="side-nav-copy"><strong>FF Admin</strong><small>Manage customer workspaces</small></span>
            </Link>
          </section>
        ) : null}
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
