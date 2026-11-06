import { type ComplianceItem, displayState, itemIsOverdue, statusChipClassName } from '@/lib/compliance';

export function StatusBadge({ item, today }: { today?: string; item: Pick<ComplianceItem, 'status' | 'start_working_on' | 'expiration_date' | 'awaiting_schedule' | 'archived_at'> }) {
  const state = displayState(item, today);

  return (
    <span className="st-wrap">
      <span className={statusChipClassName(state)}>{state}</span>
      {itemIsOverdue(item, today) ? <span className="ovd">Overdue</span> : null}
    </span>
  );
}
