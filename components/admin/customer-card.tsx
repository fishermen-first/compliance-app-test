'use client';
// components/admin/customer-card.tsx
// Featured customer row. Clickable card; chevron toggles inline readiness
// detail; the whole row navigates to /admin/customers/[id]/overview.

import { useRouter } from 'next/navigation';
import { useState, type MouseEvent } from 'react';
import { ArrowUpRight, Check, ChevronDown, Clock } from 'lucide-react';
import {
  avatarColors,
  buildChecks,
  initialsFromName,
  stageFromChecks,
  stageLabel,
  type CompanyIndexRow,
} from '@/lib/admin/customer-readiness';

type Props = {
  company: CompanyIndexRow;
  expanded: boolean;
  multi: boolean;
  isLast: boolean;
  onToggle: () => void;
};

export function CustomerCard({ company, expanded, multi, isLast, onToggle }: Props) {
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const checks = buildChecks(company);
  const done = checks.filter((k) => k.done).length;
  const total = checks.length;
  const stage = stageFromChecks(checks, company);
  const { bg, fg } = avatarColors(company.name);
  const short = initialsFromName(company.name);
  const href = `/admin/customers/${company.id}/overview`;

  const navigate = () => router.push(href);
  const stop = (e: MouseEvent) => e.stopPropagation();

  const createdAt = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(company.createdAt));

  return (
    <article
      className="customer-card"
      data-expanded={expanded}
      data-hover={hover ? 'true' : 'false'}
      onClick={navigate}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--line)' }}
    >
      <div className="customer-card-head">
        <div className="customer-avatar" style={{ background: bg, color: fg }}>
          {short}
        </div>

        <div className="customer-meta">
          <div className="customer-title-row">
            <strong>{company.name}</strong>
            {multi && !expanded && (
              <span className={`setup-chip setup-chip-${stage}`}>{stageLabel(stage)}</span>
            )}
          </div>
          <p>
            <span><Clock aria-hidden="true" /> Created {createdAt}</span>
            <span className="sep">·</span>
            <span>{company.timezone}</span>
            {multi && !expanded && (
              <>
                <span className="sep">·</span>
                <span className={`ready-count ready-count-${stage}`}>
                  {done} of {total} ready
                </span>
              </>
            )}
          </p>
        </div>

        <div className="customer-actions">
          {multi && (
            <button
              type="button"
              className="customer-chevron"
              onClick={(e) => { stop(e); onToggle(); }}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse readiness' : 'Expand readiness'}
            >
              <span data-rotated={expanded}>
                <ChevronDown aria-hidden="true" />
              </span>
            </button>
          )}
          {expanded && (
            <a className="btn btn-primary" href={href} onClick={stop}>
              Open customer <ArrowUpRight aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {expanded ? (
        <ul className="readiness-grid">
          {checks.map((k, i) => (
            <li key={k.key} data-done={k.done} data-col={i % 2} data-row={i < 2 ? 0 : 1}>
              <span className="readiness-bullet">
                {k.done ? <Check aria-hidden="true" /> : null}
              </span>
              <div className="readiness-text">
                <div className="readiness-label">{k.label}</div>
                <div className="readiness-detail">{k.detail}</div>
              </div>
              {k.action ? (
                <a className="readiness-action" href={k.action.href} onClick={stop}>
                  {k.action.text} <ArrowUpRight aria-hidden="true" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="readiness-bar">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} data-done={i < done} />
          ))}
        </div>
      )}
    </article>
  );
}
