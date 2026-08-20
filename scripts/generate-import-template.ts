#!/usr/bin/env node

import type { Cell, DataValidation, Fill, Workbook, Worksheet } from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';

const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
const { resolve } = require('node:path') as typeof import('node:path');
const ExcelJS = require('exceljs') as typeof import('exceljs');
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');

const outputFilename = 'FF Compliance Import Template.xlsx';
const emptyRowCount = 200;
const listCapacity = 250;
const dataStartRow = 2;
const exampleRowCount = 3;

const templateColumns = [
  { key: 'owner_code', prompt: 'Customer owner code responsible for this item.' },
  { key: 'vessel_or_scope', prompt: 'Vessel name, listed company-wide scope, or blank for company-wide.' },
  { key: 'item_name', prompt: 'Compliance obligation name as the customer recognizes it.' },
  { key: 'item_number', prompt: 'Permit, certificate, account, or agency reference number, if any.' },
  { key: 'regulatory_party', prompt: 'Agency, regulator, certifier, or other responsible external party.' },
  { key: 'compliance_domain', prompt: 'Compliance area; leave blank when it should be inferred.' },
  { key: 'obligation_type', prompt: 'Type of work or obligation represented by this row.' },
  { key: 'applicability_scope', prompt: 'Choose whether this item applies to a vessel or company-wide.' },
  { key: 'frequency', prompt: 'How often this item recurs.' },
  { key: 'start_working_on', prompt: 'Real date work should begin, formatted yyyy-mm-dd.' },
  { key: 'due_or_expiration_date', prompt: 'Real due or expiration date, formatted yyyy-mm-dd.' }
] as const;

type TemplateColumnKey = typeof templateColumns[number]['key'];

type TemplateLists = {
  ownerCodes: string[];
  vesselScopes: string[];
  regulatoryParties: string[];
  complianceDomains: string[];
  obligationTypes: string[];
  applicabilityScopes: string[];
  frequencies: string[];
};

type NamedListConfig = {
  label: string;
  namedRange: string;
  values: string[];
};

type CustomerListRows = {
  ownerCodes: string[];
  vessels: string[];
  agencies: string[];
};

const companyWideScopes = ['ASMG', 'ASHCO', 'Company', 'Office'];

const genericLists: TemplateLists = {
  ownerCodes: ['ES', 'MA', 'SN', 'VN'],
  vesselScopes: ['Arctic Storm', 'Arctic Fjord', 'Northern Jaeger', ...companyWideScopes],
  regulatoryParties: ['USCG', 'NOAA / NMFS', 'ADEC', 'FCC', 'EPA', 'MSC', 'BRC', 'Chadux'],
  complianceDomains: [
    'Vessel Compliance',
    'Environmental',
    'Food Safety',
    'Audits & Certifications',
    'Fishing / Quota Reporting'
  ],
  obligationTypes: ['Inspection', 'License', 'Audit', 'Training', 'Recordkeeping', 'Contract', 'Plan filing', 'Maintenance'],
  applicabilityScopes: ['Vessel', 'Company-wide'],
  frequencies: ['Annual', 'Quarterly', 'Monthly', 'Every 2 years', 'Every 5 years', 'Every 10 years', 'One-time']
};

const examples: Array<Record<TemplateColumnKey, string | Date>> = [
  {
    owner_code: 'ES',
    vessel_or_scope: 'Arctic Storm',
    item_name: 'USCG Certificate of Inspection',
    item_number: 'COI-2026',
    regulatory_party: 'USCG',
    compliance_domain: 'Vessel Compliance',
    obligation_type: 'Inspection',
    applicability_scope: 'Vessel',
    frequency: 'Annual',
    start_working_on: new Date(Date.UTC(2026, 0, 15)),
    due_or_expiration_date: new Date(Date.UTC(2026, 2, 1))
  },
  {
    owner_code: 'MA',
    vessel_or_scope: 'Northern Jaeger',
    item_name: 'NOAA VMS Permit Renewal',
    item_number: 'VMS-001',
    regulatory_party: 'NOAA / NMFS',
    compliance_domain: 'Fishing / Quota Reporting',
    obligation_type: 'License',
    applicability_scope: 'Vessel',
    frequency: 'Annual',
    start_working_on: new Date(Date.UTC(2026, 1, 1)),
    due_or_expiration_date: new Date(Date.UTC(2026, 3, 1))
  },
  {
    owner_code: 'SN',
    vessel_or_scope: 'Office',
    item_name: 'BRCGS Food Safety Audit',
    item_number: 'BRC-2026',
    regulatory_party: 'BRC',
    compliance_domain: 'Food Safety',
    obligation_type: 'Audit',
    applicability_scope: 'Company-wide',
    frequency: 'Annual',
    start_working_on: new Date(Date.UTC(2026, 4, 1)),
    due_or_expiration_date: new Date(Date.UTC(2026, 6, 15))
  }
];

const headerFill: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123C49' } };
const exampleFill: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } };
const listHeaderFill: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF0' } };

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function columnLetter(index: number) {
  let value = index;
  let letters = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return letters;
}

function parseArgs(argv: string[]) {
  let customerId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--customer') {
      customerId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith('--customer=')) {
      customerId = arg.slice('--customer='.length) || null;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (customerId !== null && customerId.trim() === '') {
    throw new Error('Pass a company id after --customer.');
  }

  return { customerId };
}

function printHelp() {
  console.log([
    'Usage: npm run generate:import-template -- [--customer <company_id>]',
    '',
    `Writes ${outputFilename} in the project root.`,
    'With --customer, dropdown values are pulled from the local Supabase stack.'
  ].join('\n'));
}

function parseShellAssignments(text: string) {
  const values: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function isLocalSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function localSupabaseCredentials() {
  const envUrl =
    process.env.LOCAL_SUPABASE_URL ??
    process.env.SUPABASE_LOCAL_URL ??
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envServiceRoleKey =
    process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
    process.env.SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (envUrl && envServiceRoleKey && isLocalSupabaseUrl(envUrl)) {
    return { url: envUrl, serviceRoleKey: envServiceRoleKey };
  }

  try {
    const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const values = parseShellAssignments(status);
    const url = values.API_URL ?? values.SUPABASE_URL ?? values.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = values.SERVICE_ROLE_KEY ?? values.SUPABASE_SERVICE_ROLE_KEY;

    if (url && serviceRoleKey && isLocalSupabaseUrl(url)) {
      return { url, serviceRoleKey };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read local Supabase credentials from "supabase status -o env": ${message}. Start the local stack or set LOCAL_SUPABASE_URL and LOCAL_SUPABASE_SERVICE_ROLE_KEY.`
    );
  }

  throw new Error('No local Supabase credentials found. Start the local stack or set LOCAL_SUPABASE_URL and LOCAL_SUPABASE_SERVICE_ROLE_KEY.');
}

async function fetchCustomerRows(customerId: string): Promise<CustomerListRows> {
  const credentials = localSupabaseCredentials();
  const supabase = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  }) as SupabaseClient;

  const company = await supabase.from('companies').select('id, name').eq('id', customerId).maybeSingle();
  if (company.error) throw new Error(`Could not load company ${customerId}: ${company.error.message}`);
  if (!company.data) throw new Error(`No local company found for id ${customerId}.`);

  const [ownerCodes, vessels, agencies] = await Promise.all([
    supabase.from('company_owner_codes').select('code').eq('company_id', customerId).order('code'),
    supabase.from('vessels').select('name').eq('company_id', customerId).eq('active', true).order('name'),
    supabase.from('agencies').select('name').eq('company_id', customerId).order('name')
  ]);

  for (const result of [ownerCodes, vessels, agencies]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    ownerCodes: uniqueSorted((ownerCodes.data ?? []).map((row) => String(row.code ?? ''))),
    vessels: uniqueSorted((vessels.data ?? []).map((row) => String(row.name ?? ''))),
    agencies: uniqueSorted((agencies.data ?? []).map((row) => String(row.name ?? '')))
  };
}

function listsFromCustomer(rows: CustomerListRows): TemplateLists {
  return {
    ...genericLists,
    ownerCodes: rows.ownerCodes.length > 0 ? rows.ownerCodes : genericLists.ownerCodes,
    vesselScopes: uniqueSorted([...rows.vessels, ...companyWideScopes]),
    regulatoryParties: rows.agencies.length > 0 ? rows.agencies : genericLists.regulatoryParties
  };
}

function namedLists(lists: TemplateLists): NamedListConfig[] {
  return [
    { label: 'Owner Codes', namedRange: 'OwnerCodes', values: lists.ownerCodes },
    { label: 'Vessels and Company-wide Scopes', namedRange: 'VesselScopes', values: lists.vesselScopes },
    { label: 'Regulatory Parties', namedRange: 'RegulatoryParties', values: lists.regulatoryParties },
    { label: 'Compliance Domains', namedRange: 'ComplianceDomains', values: lists.complianceDomains },
    { label: 'Obligation Types', namedRange: 'ObligationTypes', values: lists.obligationTypes },
    { label: 'Applicability Scopes', namedRange: 'ApplicabilityScopes', values: lists.applicabilityScopes },
    { label: 'Frequencies', namedRange: 'Frequencies', values: lists.frequencies }
  ];
}

function listValidation(namedRange: string, prompt: string, options: { strict?: boolean; allowBlank?: boolean; error?: string } = {}): DataValidation {
  const strict = options.strict ?? false;
  return {
    type: 'list',
    formulae: [namedRange],
    allowBlank: options.allowBlank ?? true,
    showInputMessage: true,
    promptTitle: 'FF template',
    prompt,
    showErrorMessage: strict,
    errorStyle: strict ? 'stop' : 'warning',
    errorTitle: strict ? 'Choose a listed value' : 'Review this value',
    error: options.error ?? 'Choose a value from the dropdown.'
  };
}

function dateValidation(prompt: string, fieldName: string): DataValidation {
  return {
    type: 'date',
    operator: 'between',
    formulae: [new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2040, 11, 31))],
    allowBlank: false,
    showInputMessage: true,
    promptTitle: 'Date required',
    prompt,
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Real date required',
    error: `Enter a real ${fieldName} between 2020-01-01 and 2040-12-31.`
  };
}

function promptOnlyValidation(prompt: string): DataValidation {
  return {
    type: 'custom',
    formulae: ['TRUE'],
    allowBlank: true,
    showInputMessage: true,
    promptTitle: 'FF template',
    prompt,
    showErrorMessage: false
  };
}

function validationForColumn(column: TemplateColumnKey, prompt: string): DataValidation | null {
  switch (column) {
    case 'owner_code':
      return listValidation('OwnerCodes', prompt, {
        strict: true,
        allowBlank: false,
        error: 'Owner code must match one of the customer owner codes on the Lists sheet.'
      });
    case 'vessel_or_scope':
      return listValidation('VesselScopes', prompt, { allowBlank: true });
    case 'regulatory_party':
      return listValidation('RegulatoryParties', prompt, { allowBlank: true });
    case 'compliance_domain':
      return listValidation('ComplianceDomains', prompt, { allowBlank: true });
    case 'obligation_type':
      return listValidation('ObligationTypes', prompt, { allowBlank: true });
    case 'applicability_scope':
      return listValidation('ApplicabilityScopes', prompt, {
        strict: true,
        allowBlank: false,
        error: 'Applicability scope must be Vessel or Company-wide.'
      });
    case 'frequency':
      return listValidation('Frequencies', prompt, { allowBlank: true });
    case 'start_working_on':
      return dateValidation(prompt, 'start working date');
    case 'due_or_expiration_date':
      return dateValidation(prompt, 'due or expiration date');
    default:
      return promptOnlyValidation(prompt);
  }
}

function styleHeaderCell(cell: Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = headerFill;
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.protection = { locked: true };
  cell.border = {
    bottom: { style: 'thin', color: { argb: 'FF8AA0A8' } }
  };
}

function styleInputCell(cell: Cell, isExample: boolean) {
  cell.protection = { locked: false };
  cell.alignment = { vertical: 'top', wrapText: true };
  cell.border = {
    bottom: { style: 'hair', color: { argb: 'FFD9E1E4' } }
  };

  if (isExample) {
    cell.fill = exampleFill;
    cell.font = { italic: true, color: { argb: 'FF59420A' } };
  }
}

function applyColumnWidths(sheet: Worksheet) {
  templateColumns.forEach((column, index) => {
    const columnIndex = index + 1;
    let maxLength = column.key.length;
    sheet.getColumn(columnIndex).eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value instanceof Date ? 'yyyy-mm-dd' : String(cell.value ?? '');
      maxLength = Math.max(maxLength, value.length);
    });
    sheet.getColumn(columnIndex).width = Math.min(Math.max(maxLength + 2, 14), 32);
  });

  sheet.getColumn(3).width = 34;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(10).width = 18;
  sheet.getColumn(11).width = 22;
}

function populateDueDatesSheet(workbook: Workbook, lists: TemplateLists) {
  const sheet = workbook.addWorksheet('Due Dates', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  sheet.properties.defaultRowHeight = 20;
  sheet.autoFilter = {
    from: 'A1',
    to: `${columnLetter(templateColumns.length)}1`
  };

  const headerRow = sheet.getRow(1);
  headerRow.values = templateColumns.map((column) => column.key);
  headerRow.height = 36;
  headerRow.eachCell(styleHeaderCell);

  const totalRows = exampleRowCount + emptyRowCount;
  for (let offset = 0; offset < totalRows; offset += 1) {
    const rowNumber = dataStartRow + offset;
    const row = sheet.getRow(rowNumber);
    const example = examples[offset];
    const isExample = Boolean(example);

    templateColumns.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      if (example) cell.value = example[column.key] ?? null;
      styleInputCell(cell, isExample);

      if (column.key === 'start_working_on' || column.key === 'due_or_expiration_date') {
        cell.numFmt = 'yyyy-mm-dd';
      }

      const validation = validationForColumn(column.key, column.prompt);
      if (validation) cell.dataValidation = validation;
    });

    if (isExample) {
      row.height = 24;
      row.getCell(1).note = 'Delete these example rows before importing';
    }
  }

  applyColumnWidths(sheet);

  return sheet;
}

function populateListsSheet(workbook: Workbook, lists: TemplateLists) {
  const sheet = workbook.addWorksheet('Lists', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  const configs = namedLists(lists);

  configs.forEach((config, index) => {
    const columnIndex = index + 1;
    const letter = columnLetter(columnIndex);
    const headerCell = sheet.getCell(1, columnIndex);
    headerCell.value = config.label;
    headerCell.font = { bold: true, color: { argb: 'FF123C49' } };
    headerCell.fill = listHeaderFill;
    headerCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    config.values.forEach((value, valueIndex) => {
      sheet.getCell(valueIndex + 2, columnIndex).value = value;
    });

    sheet.getColumn(columnIndex).width = Math.min(Math.max(config.label.length + 4, 18), 34);
    workbook.definedNames.add(`Lists!$${letter}$2:$${letter}$${listCapacity + 1}`, config.namedRange);
  });

  sheet.getRow(1).height = 34;
  return sheet;
}

function populateInstructionsSheet(workbook: Workbook) {
  const sheet = workbook.addWorksheet('Instructions');
  const rows = [
    ['FF Compliance Import Template v1'],
    ['One row per compliance item per period.'],
    ['Use real dates in yyyy-mm-dd format for start_working_on and due_or_expiration_date.'],
    ['Pick names from dropdowns where offered; FF admins can extend dropdowns on the Lists sheet before sending.'],
    ["New agency and vessel names are fine; they are reviewed at import instead of silently inserted."],
    ['Never add a key column; the system manages item identity and returns keys in exports.'],
    ['Delete the example rows on the Due Dates sheet before importing customer data.']
  ];

  rows.forEach((row, index) => {
    const cell = sheet.getCell(index + 1, 1);
    cell.value = row[0];
    cell.alignment = { wrapText: true, vertical: 'top' };
    if (index === 0) {
      cell.font = { bold: true, size: 14, color: { argb: 'FF123C49' } };
    }
  });

  sheet.getColumn(1).width = 110;
  sheet.getRow(1).height = 24;
  return sheet;
}

async function protectSheets(dueDates: Worksheet, lists: Worksheet) {
  await dueDates.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    insertRows: true,
    autoFilter: true
  });
  await lists.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true
  });
}

async function buildWorkbook(lists: TemplateLists) {
  const workbook = new ExcelJS.Workbook() as Workbook;
  workbook.creator = 'Fishermen First';
  workbook.lastModifiedBy = 'Fishermen First';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = 'FF Compliance Import Template';
  workbook.subject = 'FF template v1 customer import workbook';

  const dueDates = populateDueDatesSheet(workbook, lists);
  const listsSheet = populateListsSheet(workbook, lists);
  populateInstructionsSheet(workbook);
  await protectSheets(dueDates, listsSheet);

  return workbook;
}

async function main() {
  const { customerId } = parseArgs(process.argv.slice(2));
  const lists = customerId ? listsFromCustomer(await fetchCustomerRows(customerId)) : genericLists;
  const workbook = await buildWorkbook(lists);
  const outputPath = resolve(process.cwd(), outputFilename);

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Generated ${outputPath}`);

  if (customerId) {
    console.log(`Customer lists loaded from local Supabase company ${customerId}.`);
  } else {
    console.log('Generated generic sample dropdown lists.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
