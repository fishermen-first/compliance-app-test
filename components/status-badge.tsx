import { type ComplianceItem, displayState, itemIsOverdue, statusChipClassName } from '@/lib/compliance';

export function StatusBadge({ item }: { item: Pick<ComplianceItem, 'status' | 'start_working_on' | 'expiration_date'> }) {
  const state = displayState(item);

  return (
    <span className="st-wrap">
      <span className={statusChipClassName(state)}>{state}</span>
      {itemIsOverdue(item) ? <span className="ovd">Overdue</span> : null}
    </span>
  );
}
