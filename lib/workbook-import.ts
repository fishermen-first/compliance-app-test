import { createHash } from 'crypto';
import readXlsxFile from 'read-excel-file/node';
import type { Database } from '@/lib/database.types';

type ComplianceItemStatus = Database['public']['Enums']['compliance_item_status'];
type RecurrenceUnit = Database['public']['Enums']['recurrence_unit'];
type DetectedWorkbookFormat = 'legacy_due_dates' | 'ff_template_v1';
export type PeriodLabel = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type ImportedComplianceRecord = {
  sourceRowNumber: number;
  sourceRowJson: Record<string, string | null>;
  sourceRowHash: string;
  sourceFingerprint: string;
  templateItemKey: string | null;
  matchCandidate: {
    itemName: string | null;
    vesselOrScope: string | null;
    ownerCode: string | null;
    itemNumber: string | null;
    agencyType: string | null;
    periodLabel: string | null;
  };
  ownerRaw: string | null;
  ownerCurrent: string | null;
  vessel: string | null;
  vesselOrScope: string | null;
  itemName: string;
  itemNumber: string | null;
  agencyType: string | null;
  complianceArea: string;
  frequencyLabel: string | null;
  periodLabel: PeriodLabel | null;
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
  detectedFormat: DetectedWorkbookFormat;
  templateVersion: string | null;
  parserVersion: string;
  recordCount: number;
  vesselCount: number;
  ownerCodes: Array<{ code: string; count: number }>;
  warnings: Array<{ row: number; issue: string; value?: string | null }>;
};

export class WorkbookImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkbookImportError';
  }
}

const parserVersion = 'import-v2-quarter-periods-2026-07-03';

const legacyHeaders = [
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

const legacyHeaderLabels = [
  'Owner',
  'Vessel',
  'Item',
  'Item Number',
  'Agency/Type',
  'Frequency Due',
  'Current Expiration',
  'Start Working On',
  'Status',
  'Status Notes',
  'Information'
] as const;

const templateRequiredColumns = [
  'template_item_key',
  'owner_code',
  'vessel_or_scope',
  'item_name',
  'item_number',
  'regulatory_party',
  'compliance_domain',
  'obligation_type',
  'applicability_scope',
  'frequency',
  'start_working_on',
  'due_or_expiration_date'
] as const;

const companyWideNames = new Set(['asmg', 'ashco', 'company', 'office', '']);
const optionalPeriodColumns = ['period', 'cycle', 'quarter'] as const;

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

function normalizeHeaderLabel(value: unknown) {
  return (clean(value) ?? '')
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeMatchValue(value: string | null) {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized || null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function templateColumnMap(row: unknown[]) {
  const entries = row.map((cell, index) => [normalizeHeaderLabel(cell), index] as const).filter(([label]) => Boolean(label));
  return new Map(entries);
}

function valueForAnyColumn(row: unknown[], columns: Map<string, number>, names: readonly string[]) {
  const column = names.find((name) => columns.has(name));
  return column ? row[columns.get(column) ?? -1] ?? null : null;
}

function isTemplateHeader(row: unknown[]) {
  const columns = templateColumnMap(row);
  return templateRequiredColumns.every((column) => columns.has(column));
}

function isLegacyHeader(row: unknown[]) {
  const normalized = row.map(normalizeHeaderLabel);
  return normalized.includes('vessel') && normalized.includes('item');
}

function assertLegacyHeaderOrder(row: unknown[]) {
  const actual = row.slice(0, legacyHeaderLabels.length).map(normalizeHeaderLabel);
  const expected = legacyHeaderLabels.map(normalizeHeaderLabel);
  const mismatchIndex = expected.findIndex((label, index) => actual[index] !== label);

  if (mismatchIndex !== -1) {
    throw new WorkbookImportError(
      `Legacy workbook columns are reordered near "${legacyHeaderLabels[mismatchIndex]}". Use the original Due Dates column order or the FF template before importing.`
    );
  }
}

function rowJsonFromKeys(keys: readonly string[], values: unknown[]) {
  return Object.fromEntries(keys.map((key, index) => [key, clean(values[index] ?? null)]));
}

export function sourceFingerprint(candidate: ImportedComplianceRecord['matchCandidate']) {
  const fingerprint: Record<string, string | null> = {
    itemName: candidate.itemName,
    vesselOrScope: candidate.vesselOrScope,
    ownerCode: candidate.ownerCode,
    itemNumber: candidate.itemNumber,
    agencyType: candidate.agencyType
  };

  if (candidate.periodLabel) {
    fingerprint.periodLabel = candidate.periodLabel;
  }

  return sha256(fingerprint);
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

export function normalizePeriodLabel(value: string | null): PeriodLabel | null {
  const label = (value ?? '').trim().toLowerCase();
  if (!label) return null;

  const match = label.match(/^(?:q|qtr\.?|quarter)?\s*([1-4])$/);
  return match ? `Q${match[1]}` as PeriodLabel : null;
}

export function periodLabelFromItemName(itemName: string): PeriodLabel | null {
  const label = itemName.trim();
  const match =
    label.match(/\bq([1-4])\b/i) ??
    label.match(/\bqtr\.?\s*([1-4])\b/i) ??
    label.match(/\bquarter\s*([1-4])\b/i);

  return match ? `Q${match[1]}` as PeriodLabel : null;
}

export function resolvePeriodLabel(
  rawPeriod: string | null,
  itemName: string,
  rowNumber: number,
  warnings: WorkbookImportSummary['warnings']
) {
  const explicit = clean(rawPeriod);
  const itemNamePeriod = periodLabelFromItemName(itemName);

  if (!explicit) return itemNamePeriod;

  const explicitPeriod = normalizePeriodLabel(explicit);
  if (!explicitPeriod) {
    warnings.push({ row: rowNumber, issue: 'Invalid period label; expected Q1, Q2, Q3, or Q4', value: explicit });
    return null;
  }

  if (itemNamePeriod && itemNamePeriod !== explicitPeriod) {
    warnings.push({
      row: rowNumber,
      issue: 'Period column conflicts with item name quarter marker; using Period column value',
      value: `${explicitPeriod} vs ${itemNamePeriod}`
    });
  }

  return explicitPeriod;
}

export function inferRecurrence(frequency: string | null, periodLabel: PeriodLabel | null = null): { unit: RecurrenceUnit; interval: number | null } {
  const label = (frequency ?? '').trim().toLowerCase();
  if (!label || label === 'na' || label === 'n/a') return { unit: 'none', interval: null };
  if (label.includes('unannounced') || label.includes('new permit')) return { unit: 'manual', interval: null };
  if (label.includes('quarter') && periodLabel) return { unit: 'years', interval: 1 };
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
  detectedFormat: DetectedWorkbookFormat;
  templateVersion: string | null;
  parserVersion: string;
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
  const templateHeaderIndex = rows.findIndex((row) => isTemplateHeader(row));
  const legacyHeaderIndex = rows.findIndex((row) => isLegacyHeader(row));
  const detectedFormat: DetectedWorkbookFormat = templateHeaderIndex !== -1 ? 'ff_template_v1' : 'legacy_due_dates';
  const templateVersion = detectedFormat === 'ff_template_v1' ? 'FF Compliance Import Template v1' : null;

  if (detectedFormat === 'legacy_due_dates') {
    if (legacyHeaderIndex === -1) {
      throw new WorkbookImportError('No recognizable Due Dates header row was found.');
    }
    assertLegacyHeaderOrder(rows[legacyHeaderIndex]);
  }

  if (detectedFormat === 'ff_template_v1') {
    const headerRow = rows[templateHeaderIndex];
    const columns = templateColumnMap(headerRow);

    rows.slice(templateHeaderIndex + 1).forEach((row, index) => {
      const rowNumber = templateHeaderIndex + index + 2;
      const valueFor = (column: string) => row[columns.get(column) ?? -1] ?? null;
      const sourceRowJson = Object.fromEntries(
        Array.from(columns.entries())
          .filter(([column]) => column.length > 0)
          .map(([column, columnIndex]) => [column, clean(row[columnIndex] ?? null)])
      ) as Record<string, string | null>;

      if (!Object.values(sourceRowJson).some(Boolean)) return;

      const itemName = clean(valueFor('item_name'));
      if (!itemName) {
        warnings.push({ row: rowNumber, issue: 'Skipped row with no item name' });
        return;
      }

      const ownerRaw = clean(valueFor('owner_code'));
      const vesselOrScope = clean(valueFor('vessel_or_scope'));
      const agencyType = clean(valueFor('regulatory_party'));
      const frequencyLabel = clean(valueFor('frequency'));
      const periodLabel = resolvePeriodLabel(clean(valueForAnyColumn(row, columns, optionalPeriodColumns)), itemName, rowNumber, warnings);
      const recurrence = inferRecurrence(frequencyLabel, periodLabel);
      const itemNumber = clean(valueFor('item_number'));
      const matchCandidate = {
        itemName: normalizeMatchValue(itemName),
        vesselOrScope: normalizeMatchValue(vesselOrScope),
        ownerCode: normalizeMatchValue(ownerRaw),
        itemNumber: normalizeMatchValue(itemNumber),
        agencyType: normalizeMatchValue(agencyType),
        periodLabel
      };

      records.push({
        sourceRowNumber: rowNumber,
        sourceRowJson,
        sourceRowHash: sha256(sourceRowJson),
        sourceFingerprint: sourceFingerprint(matchCandidate),
        templateItemKey: clean(valueFor('template_item_key')),
        matchCandidate,
        ownerRaw,
        ownerCurrent: parseOwnerCurrent(ownerRaw),
        vessel: vesselOrScope,
        vesselOrScope,
        itemName,
        itemNumber,
        agencyType,
        complianceArea: clean(valueFor('compliance_domain')) ?? inferArea(agencyType, itemName),
        frequencyLabel,
        periodLabel,
        recurrenceUnit: recurrence.unit,
        recurrenceInterval: recurrence.interval,
        expirationDate: importDate(valueFor('due_or_expiration_date'), rowNumber, 'due or expiration date', warnings),
        startWorkingOn: importDate(valueFor('start_working_on'), rowNumber, 'start working date', warnings),
        status: 'not_started',
        statusNotes: clean(valueFor('status_notes')),
        instructions: clean(valueFor('instructions'))
      });
    });
  } else {
    const legacyPeriodIndex = (() => {
      const header = rows[legacyHeaderIndex] ?? [];
      const nextHeader = normalizeHeaderLabel(header[legacyHeaders.length] ?? null);
      return optionalPeriodColumns.includes(nextHeader as typeof optionalPeriodColumns[number]) ? legacyHeaders.length : -1;
    })();

    rows.slice(legacyHeaderIndex + 1).forEach((row, index) => {
    const rowNumber = legacyHeaderIndex + index + 2;
    const values = legacyHeaders.map((_, valueIndex) => row[valueIndex] ?? null);
    if (!values.some((value) => clean(value))) return;

    const raw = Object.fromEntries(legacyHeaders.map((header, headerIndex) => [header, values[headerIndex]]));
    const sourceRowJson = rowJsonFromKeys(legacyHeaders, values);
    if (legacyPeriodIndex !== -1) {
      sourceRowJson.periodLabel = clean(row[legacyPeriodIndex] ?? null);
    }
    const itemName = clean(raw.itemName);
    if (!itemName) {
      warnings.push({ row: rowNumber, issue: 'Skipped row with no item name' });
      return;
    }

    const frequencyLabel = clean(raw.frequencyLabel);
    const periodLabel = resolvePeriodLabel(legacyPeriodIndex === -1 ? null : clean(row[legacyPeriodIndex] ?? null), itemName, rowNumber, warnings);
    const recurrence = inferRecurrence(frequencyLabel, periodLabel);
    const ownerRaw = clean(raw.ownerRaw);
    const agencyType = clean(raw.agencyType);
    const vessel = clean(raw.vessel);
    const itemNumber = clean(raw.itemNumber);
    const matchCandidate = {
      itemName: normalizeMatchValue(itemName),
      vesselOrScope: normalizeMatchValue(vessel),
      ownerCode: normalizeMatchValue(ownerRaw),
      itemNumber: normalizeMatchValue(itemNumber),
      agencyType: normalizeMatchValue(agencyType),
      periodLabel
    };

    records.push({
      sourceRowNumber: rowNumber,
      sourceRowJson,
      sourceRowHash: sha256(sourceRowJson),
      sourceFingerprint: sourceFingerprint(matchCandidate),
      templateItemKey: null,
      matchCandidate,
      ownerRaw,
      ownerCurrent: parseOwnerCurrent(ownerRaw),
      vessel,
      vesselOrScope: vessel,
      itemName,
      itemNumber,
      agencyType,
      complianceArea: inferArea(agencyType, itemName),
      frequencyLabel,
      periodLabel,
      recurrenceUnit: recurrence.unit,
      recurrenceInterval: recurrence.interval,
      expirationDate: importDate(raw.expirationDate, rowNumber, 'expiration', warnings),
      startWorkingOn: importDate(raw.startWorkingOn, rowNumber, 'start working date', warnings),
      status: statusFromRaw(clean(raw.statusRaw)),
      statusNotes: clean(raw.statusNotes),
      instructions: clean(raw.instructions)
    });
  });
  }

  const vesselNames = new Set(records.map((record) => record.vessel).filter((vessel) => !isCompanyWideVessel(vessel)));
  const ownerCounts = new Map<string, number>();
  records.forEach((record) => {
    if (!record.ownerCurrent) return;
    ownerCounts.set(record.ownerCurrent, (ownerCounts.get(record.ownerCurrent) ?? 0) + 1);
  });

  return {
    sheetName,
    detectedFormat,
    templateVersion,
    parserVersion,
    records,
    summary: {
      sheet: sheetName,
      detectedFormat,
      templateVersion,
      parserVersion,
      recordCount: records.length,
      vesselCount: vesselNames.size,
      ownerCodes: Array.from(ownerCounts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, count]) => ({ code, count })),
      warnings
    }
  };
}
