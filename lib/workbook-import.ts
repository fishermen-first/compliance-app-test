import readXlsxFile from 'read-excel-file/node';
import type { Database } from '@/lib/database.types';

type ComplianceItemStatus = Database['public']['Enums']['compliance_item_status'];
type RecurrenceUnit = Database['public']['Enums']['recurrence_unit'];

export type ImportedComplianceRecord = {
  sourceRowNumber: number;
  ownerRaw: string | null;
  ownerCurrent: string | null;
  vessel: string | null;
  itemName: string;
  itemNumber: string | null;
  agencyType: string | null;
  complianceArea: string;
  frequencyLabel: string | null;
  recurrenceUnit: RecurrenceUnit;
  recurrenceInterval: number | null;
  expirationDate: string | null;
  startWorkingOn: string | null;
  status: ComplianceItemStatus;
  statusNotes: string | null;
  instructions: string | null;
};

export type WorkbookImportSummary = {
  sheet: string;
  recordCount: number;
  vesselCount: number;
  ownerCodes: Array<{ code: string; count: number }>;
  warnings: Array<{ row: number; issue: string; value?: string | null }>;
};

const headers = [
  'ownerRaw',
  'vessel',
  'itemName',
  'itemNumber',
  'agencyType',
  'frequencyLabel',
  'expirationDate',
  'startWorkingOn',
  'statusRaw',
  'statusNotes',
  'instructions'
] as const;

const companyWideNames = new Set(['asmg', 'ashco', 'company', 'office', '']);

const statusMap: Record<string, ComplianceItemStatus> = {
  '': 'not_started',
  'in progress': 'in_progress',
  submitted: 'submitted',
  'n/a': 'discontinued',
  na: 'discontinued',
  'start soon': 'not_started'
};

function clean(value: unknown) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  return text || null;
}

function excelDateToIso(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return date.toISOString().slice(0, 10);
  }

  return null;
}

function importDate(
  value: unknown,
  rowNumber: number,
  fieldLabel: string,
  warnings: WorkbookImportSummary['warnings']
) {
  const parsed = excelDateToIso(value);
  if (!parsed) {
    warnings.push({ row: rowNumber, issue: `Missing or non-date ${fieldLabel}`, value: clean(value) });
    return null;
  }
  if (Number(parsed.slice(0, 4)) < 2000) {
    warnings.push({ row: rowNumber, issue: `${fieldLabel} year looks like an outlier; set to null`, value: parsed });
    return null;
  }
  return parsed;
}

function parseOwnerCurrent(ownerRaw: string | null) {
  const value = ownerRaw?.trim();
  return value || null;
}

function inferRecurrence(frequency: string | null): { unit: RecurrenceUnit; interval: number | null } {
  const label = (frequency ?? '').trim().toLowerCase();
  if (!label || label === 'na' || label === 'n/a') return { unit: 'none', interval: null };
  if (label.includes('unannounced') || label.includes('new permit')) return { unit: 'manual', interval: null };
  if (label.includes('quarter')) return { unit: 'months', interval: 3 };
  if (label.includes('twice')) return { unit: 'months', interval: 6 };
  if (label.includes('bienn')) return { unit: 'years', interval: 2 };
  if (label.includes('trienn')) return { unit: 'years', interval: 3 };
  if (label.includes('annual')) return { unit: 'years', interval: 1 };

  const yearMatch = label.match(/every\s+(\d+)\s+year/);
  if (yearMatch) return { unit: 'years', interval: Number(yearMatch[1]) };

  const monthMatch = label.match(/every\s+(\d+)\s+month/);
  if (monthMatch) return { unit: 'months', interval: Number(monthMatch[1]) };

  return { unit: 'manual', interval: null };
}

function inferArea(agencyType: string | null, itemName: string) {
  const agency = (agencyType ?? '').toLowerCase();
  const item = itemName.toLowerCase();
  if (agency.includes('uscg') || agency.includes('fcc') || item.includes('vessel') || item.includes('radio station')) return 'Vessel Compliance';
  if (['epa', 'ecology', 'chadux', 'seapro'].some((term) => agency.includes(term)) || ['oil', 'discharge'].some((term) => item.includes(term))) return 'Environmental';
  if (['fda', 'brcgs', 'gfsi'].some((term) => agency.includes(term)) || ['food', 'haccp'].some((term) => item.includes(term))) return 'Food Safety';
  if (['msc', 'rfm'].some((term) => agency.includes(term)) || ['audit', 'certificate'].some((term) => item.includes(term))) return 'Audits & Certifications';
  if (agency.includes('noaa') || agency.includes('nmfs') || agency.includes('usdc')) return 'Fishing / Quota Reporting';
  if (item.includes('drill') || item.includes('safety')) return 'Safety / Drills';
  if (item.includes('permit') || item.includes('license')) return 'Permits & Licenses';
  return 'Other';
}

function statusFromRaw(value: string | null): ComplianceItemStatus {
  return statusMap[(value ?? '').trim().toLowerCase()] ?? 'not_started';
}

export function isCompanyWideVessel(value: string | null) {
  return companyWideNames.has((value ?? '').trim().toLowerCase());
}

export async function parseComplianceWorkbook(buffer: ArrayBuffer): Promise<{
  sheetName: string;
  records: ImportedComplianceRecord[];
  summary: WorkbookImportSummary;
}> {
  const sheets = await readXlsxFile(Buffer.from(buffer));
  const sheet =
    sheets.find((candidate) => candidate.sheet.trim().toLowerCase() === 'due dates') ??
    sheets.find((candidate) => {
      const firstRow = candidate.data[0] ?? [];
      return firstRow.some((cell) => clean(cell)?.toLowerCase() === 'vessel') &&
        firstRow.some((cell) => clean(cell)?.toLowerCase() === 'item');
    }) ??
    sheets[0];
  const sheetName = sheet?.sheet ?? 'Sheet1';
  const rows = sheet?.data ?? [];
  const warnings: WorkbookImportSummary['warnings'] = [];
  const records: ImportedComplianceRecord[] = [];

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const values = headers.map((_, valueIndex) => row[valueIndex] ?? null);
    if (!values.some((value) => clean(value))) return;

    const raw = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]]));
    const itemName = clean(raw.itemName);
    if (!itemName) {
      warnings.push({ row: rowNumber, issue: 'Skipped row with no item name' });
      return;
    }

    const frequencyLabel = clean(raw.frequencyLabel);
    const recurrence = inferRecurrence(frequencyLabel);
    const ownerRaw = clean(raw.ownerRaw);
    const agencyType = clean(raw.agencyType);

    records.push({
      sourceRowNumber: rowNumber,
      ownerRaw,
      ownerCurrent: parseOwnerCurrent(ownerRaw),
      vessel: clean(raw.vessel),
      itemName,
      itemNumber: clean(raw.itemNumber),
      agencyType,
      complianceArea: inferArea(agencyType, itemName),
      frequencyLabel,
      recurrenceUnit: recurrence.unit,
      recurrenceInterval: recurrence.interval,
      expirationDate: importDate(raw.expirationDate, rowNumber, 'expiration', warnings),
      startWorkingOn: importDate(raw.startWorkingOn, rowNumber, 'start working date', warnings),
      status: statusFromRaw(clean(raw.statusRaw)),
      statusNotes: clean(raw.statusNotes),
      instructions: clean(raw.instructions)
    });
  });

  const vesselNames = new Set(records.map((record) => record.vessel).filter((vessel) => !isCompanyWideVessel(vessel)));
  const ownerCounts = new Map<string, number>();
  records.forEach((record) => {
    if (!record.ownerCurrent) return;
    ownerCounts.set(record.ownerCurrent, (ownerCounts.get(record.ownerCurrent) ?? 0) + 1);
  });

  return {
    sheetName,
    records,
    summary: {
      sheet: sheetName,
      recordCount: records.length,
      vesselCount: vesselNames.size,
      ownerCodes: Array.from(ownerCounts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, count]) => ({ code, count })),
      warnings
    }
  };
}
