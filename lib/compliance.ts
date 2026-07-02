export type ComplianceItemStatus = 'not_started' | 'in_progress' | 'submitted' | 'complete' | 'discontinued';
export type DisplayState = 'Not due yet' | 'Due' | 'In progress' | 'Submitted' | 'Complete' | 'Did not renew';
export type RecurrenceUnit = 'years' | 'months' | 'manual' | 'none';

export type ComplianceItem = {
  id: string;
  company_id: string;
  vessel_id: string | null;
  vessel_name?: string | null;
  owner_raw: string | null;
  owner_current: string | null;
  owner_codes?: string[];
  item_name: string;
  item_number: string | null;
  agency_type: string | null;
  compliance_area: string | null;
  frequency_label: string | null;
  recurrence_unit: RecurrenceUnit;
  recurrence_interval: number | null;
  start_working_on: string | null;
  expiration_date: string | null;
  status: ComplianceItemStatus;
  status_notes: string | null;
  instructions: string | null;
  sharepoint_url: string | null;
  completed_at: string | null;
  discontinued_at: string | null;
  created_by: string | null;
  source_row_number: number | null;
  previous_item_id?: string | null;
};

export function itemOwnerCodes(item: Pick<ComplianceItem, 'owner_codes' | 'owner_current' | 'owner_raw'>) {
  const codes = item.owner_codes?.filter(Boolean) ?? [];
  if (codes.length > 0) return Array.from(new Set(codes));
  return [item.owner_current ?? item.owner_raw].filter(Boolean) as string[];
}

export function itemOwnersLabel(item: Pick<ComplianceItem, 'owner_codes' | 'owner_current' | 'owner_raw'>) {
  const owners = itemOwnerCodes(item);
  return owners.length > 0 ? owners.join(', ') : 'Unassigned';
}

export function itemHasOwnerCode(item: Pick<ComplianceItem, 'owner_codes' | 'owner_current' | 'owner_raw'>, ownerCode: string) {
  return itemOwnerCodes(item).includes(ownerCode);
}

export function itemHasAnyOwnerCode(item: Pick<ComplianceItem, 'owner_codes' | 'owner_current' | 'owner_raw'>, ownerCodes: string[]) {
  if (ownerCodes.length === 0) return false;
  const itemCodes = itemOwnerCodes(item);
  return ownerCodes.some((ownerCode) => itemCodes.includes(ownerCode));
}

export const storedStatusLabels: Record<ComplianceItemStatus, string> = {
  not_started: 'Not due yet',
  in_progress: 'In progress',
  submitted: 'Submitted',
  complete: 'Complete',
  discontinued: 'Did not renew'
};

export const displayStateParams: Record<DisplayState, string> = {
  'Not due yet': 'not_due_yet',
  Due: 'due',
  'In progress': 'in_progress',
  Submitted: 'submitted',
  Complete: 'complete',
  'Did not renew': 'did_not_renew'
};

export const statusChipClasses: Record<DisplayState, string> = {
  'Not due yet': 'st st-notdue',
  Due: 'st st-due',
  'In progress': 'st st-prog',
  Submitted: 'st st-subm',
  Complete: 'st st-comp',
  'Did not renew': 'st st-disc'
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function daysUntil(value: string | null) {
  const date = parseDate(value);
  const today = parseDate(todayIso());
  if (!date || !today) return null;
  return daysBetween(today, date);
}

export function displayState(item: Pick<ComplianceItem, 'status' | 'start_working_on' | 'expiration_date'>): DisplayState {
  if (item.status === 'complete') return 'Complete';
  if (item.status === 'discontinued') return 'Did not renew';
  if (item.status === 'in_progress') return 'In progress';
  if (item.status === 'submitted') return 'Submitted';

  const startDays = daysUntil(item.start_working_on);
  if (startDays !== null && startDays > 0) return 'Not due yet';
  return 'Due';
}

export function itemIsOverdue(item: Pick<ComplianceItem, 'status' | 'expiration_date'>) {
  if (item.status === 'complete' || item.status === 'discontinued') return false;
  const expirationDays = daysUntil(item.expiration_date);
  return expirationDays !== null && expirationDays < 0;
}

export function displayStateParam(item: Pick<ComplianceItem, 'status' | 'start_working_on' | 'expiration_date'>) {
  return displayStateParams[displayState(item)];
}

export function statusChipClassName(state: DisplayState) {
  return statusChipClasses[state];
}

export function stateClassName(state: DisplayState) {
  return displayStateParams[state].replaceAll('_', '-');
}

export function isWorkQueueItem(item: Pick<ComplianceItem, 'status' | 'start_working_on' | 'expiration_date'>) {
  if (item.status === 'complete' || item.status === 'discontinued') return false;
  const state = displayState(item);
  return state === 'Due' || state === 'In progress' || state === 'Submitted' || itemIsOverdue(item);
}

export function formatDate(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value + 'T00:00:00'));
}

export function shortDate(value: string | null) {
  if (!value) return 'None';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value + 'T00:00:00'));
}

export function inferRecurrence(frequency: string | null): { recurrence_unit: RecurrenceUnit; recurrence_interval: number | null } {
  const label = (frequency ?? '').trim().toLowerCase();

  if (!label || label === 'na' || label === 'n/a') return { recurrence_unit: 'none', recurrence_interval: null };
  if (label.includes('unannounced') || label.includes('new permit')) return { recurrence_unit: 'manual', recurrence_interval: null };
  if (label.includes('quarter')) return { recurrence_unit: 'months', recurrence_interval: 3 };
  if (label.includes('twice')) return { recurrence_unit: 'months', recurrence_interval: 6 };
  if (label.includes('bienn')) return { recurrence_unit: 'years', recurrence_interval: 2 };
  if (label.includes('trienn')) return { recurrence_unit: 'years', recurrence_interval: 3 };
  if (label.includes('annual')) return { recurrence_unit: 'years', recurrence_interval: 1 };

  const yearMatch = label.match(/every\s+(\d+)\s+year/);
  if (yearMatch) return { recurrence_unit: 'years', recurrence_interval: Number(yearMatch[1]) };

  const monthMatch = label.match(/every\s+(\d+)\s+month/);
  if (monthMatch) return { recurrence_unit: 'months', recurrence_interval: Number(monthMatch[1]) };

  return { recurrence_unit: 'manual', recurrence_interval: null };
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);

  if (next.getDate() !== day) {
    next.setDate(0);
  }

  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function proposedNextDates(item: Pick<ComplianceItem, 'start_working_on' | 'expiration_date' | 'recurrence_unit' | 'recurrence_interval'>) {
  const expiration = parseDate(item.expiration_date);
  const start = parseDate(item.start_working_on);

  if (!expiration || !item.recurrence_interval || !['years', 'months'].includes(item.recurrence_unit)) {
    return { nextStartWorkingOn: null, nextExpirationDate: null };
  }

  const nextExpiration = item.recurrence_unit === 'years'
    ? addMonths(expiration, item.recurrence_interval * 12)
    : addMonths(expiration, item.recurrence_interval);

  let nextStart = null;
  if (start) {
    const leadDays = Math.max(0, daysBetween(start, expiration));
    nextStart = new Date(nextExpiration);
    nextStart.setDate(nextStart.getDate() - leadDays);
  }

  return {
    nextStartWorkingOn: nextStart ? toIsoDate(nextStart) : null,
    nextExpirationDate: toIsoDate(nextExpiration)
  };
}

export function parseOwnerCurrent(ownerRaw: string | null) {
  const value = (ownerRaw ?? '').trim();
  return value || null;
}

export function inferComplianceArea(agencyType: string | null, itemName: string | null) {
  const agency = (agencyType ?? '').toLowerCase();
  const item = (itemName ?? '').toLowerCase();

  if (agency.includes('uscg') || agency.includes('fcc') || item.includes('vessel') || item.includes('radio station')) return 'Vessel Compliance';
  if (agency.includes('epa') || agency.includes('ecology') || agency.includes('chadux') || agency.includes('seapro') || item.includes('oil') || item.includes('discharge')) return 'Environmental';
  if (agency.includes('fda') || agency.includes('brcgs') || agency.includes('gfsi') || item.includes('food') || item.includes('haccp')) return 'Food Safety';
  if (agency.includes('msc') || agency.includes('rfm') || item.includes('audit') || item.includes('certificate')) return 'Audits & Certifications';
  if (agency.includes('noaa') || agency.includes('nmfs') || agency.includes('usdc')) return 'Fishing / Quota Reporting';
  if (item.includes('drill') || item.includes('safety')) return 'Safety / Drills';
  if (item.includes('permit') || item.includes('license')) return 'Permits & Licenses';
  return 'Other';
}
