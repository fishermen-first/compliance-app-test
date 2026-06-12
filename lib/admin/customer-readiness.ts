// lib/admin/customer-readiness.ts
// Pure helpers used by the admin Customers page and its featured customer card.
// Server-safe — no React, no DOM.

export type CompanyIndexRow = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  vessels: number;
  users: number;
  totalItems: number;
  ownerCodes: number;
  mappedOwnerCodes: number;
  pendingInvites: number;
};

export type ReadinessCheck = {
  key: 'workbook' | 'owners' | 'users' | 'vessels';
  label: string;
  done: boolean;
  detail: string;
  action: { text: string; href: string } | null;
};

export type StageTone = 'ready' | 'attention' | 'blocked';

export function buildChecks(company: CompanyIndexRow): ReadinessCheck[] {
  const href = `/admin/customers/${company.id}/overview`;
  const owners = company.ownerCodes;
  const ownersUnmapped = Math.max(0, owners - company.mappedOwnerCodes);

  return [
    {
      key: 'workbook',
      label: 'Workbook imported',
      done: company.totalItems > 0,
      detail: company.totalItems > 0
        ? `${company.totalItems} compliance items`
        : 'No data uploaded yet',
      action: company.totalItems > 0 ? null : { text: 'Import workbook', href },
    },
    {
      key: 'owners',
      label: 'Owner codes mapped',
      done: owners > 0 && ownersUnmapped === 0,
      detail: owners === 0
        ? 'Pending workbook import'
        : `${company.mappedOwnerCodes} of ${owners} owners assigned`,
      action: (owners > 0 && ownersUnmapped > 0)
        ? { text: `Map ${ownersUnmapped} owner${ownersUnmapped === 1 ? '' : 's'}`, href }
        : null,
    },
    {
      key: 'users',
      label: 'Customer users invited',
      done: company.users > 0 || company.pendingInvites > 0,
      detail: company.users > 0 || company.pendingInvites > 0
        ? `${company.users} active · ${company.pendingInvites} pending`
        : 'No users invited',
      action: (company.users === 0 && company.pendingInvites === 0)
        ? { text: 'Invite first user', href }
        : null,
    },
    {
      key: 'vessels',
      label: 'Vessels marked active',
      done: company.vessels > 0,
      detail: company.vessels > 0 ? `${company.vessels} vessels live` : 'No vessels yet',
      action: company.vessels === 0 ? { text: 'Add vessels', href } : null,
    },
  ];
}

export function stageFromChecks(checks: ReadinessCheck[], company: CompanyIndexRow): StageTone {
  // Blocked = nothing imported yet (the workbook is the gating prerequisite).
  if (!checks[0].done) return 'blocked';
  // Done = every check is complete.
  if (checks.every((c) => c.done)) return 'ready';
  return 'attention';
}

export function stageLabel(stage: StageTone): string {
  if (stage === 'ready') return 'Live';
  if (stage === 'blocked') return 'Workbook needed';
  return 'In setup';
}

// Hash a company name to a hue (0-359), used for the avatar swatch.
// djb2-ish hash; deterministic across renders.
export function avatarColors(name: string): { bg: string; fg: string } {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    bg: `oklch(0.90 0.045 ${hue})`,
    fg: `oklch(0.32 0.08 ${hue})`,
  };
}

export function initialsFromName(name: string): string {
  // Default: first letter of each whitespace-split word, max 4 chars.
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}

// Build the opinionated single-line status sentence shown at length === 1.
// Returns null if length !== 1 (caller should fall back to the KPI grid).
export function singleCustomerStatus(rows: CompanyIndexRow[]):
  | { primary: string; secondary: string; tone: 'ready' | 'attention'; doneOf: string }
  | null {
  if (rows.length !== 1) return null;
  const c = rows[0];
  const checks = buildChecks(c);
  const incomplete = checks.filter((k) => !k.done);
  const done = checks.length - incomplete.length;
  const short = initialsFromName(c.name);
  const doneOf = `${done} of ${checks.length} ready`;

  if (incomplete.length === 0) {
    return {
      primary: `${short} is ready to use.`,
      secondary: c.pendingInvites > 0
        ? `${c.pendingInvites} pending invite${c.pendingInvites === 1 ? '' : 's'} worth following up on.`
        : `${c.users} active user${c.users === 1 ? '' : 's'} · ${c.vessels} vessel${c.vessels === 1 ? '' : 's'} live.`,
      tone: 'ready',
      doneOf,
    };
  }
  if (incomplete.length === 1) {
    return {
      primary: `${short} is one step from go-live.`,
      secondary: `${incomplete[0].label} — ${incomplete[0].action?.text ?? 'next up'}.`,
      tone: 'attention',
      doneOf,
    };
  }
  return {
    primary: `${short} needs ${incomplete.length} more setup steps.`,
    secondary: incomplete.map((k) => k.label).join(' · '),
    tone: 'attention',
    doneOf,
  };
}
