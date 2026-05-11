import Link from 'next/link';
import { Bell, Inbox, Search, ShieldCheck, UsersRound } from 'lucide-react';

function initials(email: string | null) {
  if (!email) return 'FF';
  return email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FF';
}

export function GlobalRail({ userEmail }: { userEmail: string | null }) {
  return (
    <aside className="cd-rail" aria-label="Global navigation">
      <Link className="rail-mark" href="/admin" title="FF Admin">
        <ShieldCheck aria-hidden="true" />
      </Link>
      <nav className="rail-nav">
        <Link className="rail-button" href="/admin" title="Inbox">
          <Inbox aria-hidden="true" />
        </Link>
        <Link className="rail-button active" href="/admin" title="All customers">
          <UsersRound aria-hidden="true" />
        </Link>
      </nav>
      <div className="rail-foot">
        <button type="button" title="Search">
          <Search aria-hidden="true" />
        </button>
        <button type="button" title="Alerts">
          <Bell aria-hidden="true" />
        </button>
        <div className="me" title={userEmail ?? 'FF Admin'}>{initials(userEmail)}</div>
      </div>
    </aside>
  );
}
