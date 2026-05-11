'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isCompanyWideVessel, parseComplianceWorkbook } from '@/lib/workbook-import';

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  if (!value) throw new Error(`Missing required field: ${name}`);
  return value;
}

function customerImportPath(companyId: string, message: string) {
  return `/admin/customers/${companyId}/import?message=${encodeURIComponent(message)}`;
}

function customerCodesPath(companyId: string, message: string) {
  return `/admin/customers/${companyId}/codes?message=${encodeURIComponent(message)}`;
}

function warningSeverity(issue: string) {
  const normalized = issue.toLowerCase();
  if (normalized.includes('skipped')) return 'fix';
  if (normalized.includes('outlier')) return 'fix';
  return 'review';
}

type ImporterUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function metadataString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function ensureImporterProfile(admin: ReturnType<typeof createAdminClient>, user: ImporterUser) {
  const email = user.email?.trim().toLowerCase();

  if (!email) {
    throw new Error('FF admin email is required before importing a workbook.');
  }

  const fullName =
    metadataString(user.user_metadata?.full_name) ||
    metadataString(user.user_metadata?.name) ||
    email.split('@')[0];

  const { error } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );

  if (error) throw new Error(error.message);
}

async function requireAppAdmin() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');
  if (!isAppAdmin) redirect('/');

  return userData.user;
}

export async function importComplianceWorkbook(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const workbook = formData.get('workbook');

  const user = await requireAppAdmin();

  if (!(workbook instanceof File) || workbook.size === 0) {
    redirect(customerImportPath(companyId, 'Choose a workbook to import.'));
  }

  const buffer = await workbook.arrayBuffer();
  const { sheetName, records, summary } = await parseComplianceWorkbook(buffer);

  if (records.length === 0) {
    redirect(customerImportPath(companyId, 'No compliance rows were found in the workbook.'));
  }

  const admin = createAdminClient();
  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError) throw new Error(companyError.message);
  if (!company) redirect('/admin?message=Company%20not%20found.');

  await ensureImporterProfile(admin, user);

  const vesselNames = Array.from(new Set(records.map((record) => record.vessel).filter((vessel) => !isCompanyWideVessel(vessel)) as string[])).sort();
  if (vesselNames.length > 0) {
    const { error } = await admin.from('vessels').upsert(
      vesselNames.map((name) => ({ company_id: companyId, name, active: true, updated_at: new Date().toISOString() })),
      { onConflict: 'company_id,name' }
    );
    if (error) throw new Error(error.message);
  }

  const { data: vessels, error: vesselError } = await admin
    .from('vessels')
    .select('id, name')
    .eq('company_id', companyId);

  if (vesselError) throw new Error(vesselError.message);

  const vesselIdByName = new Map((vessels ?? []).map((vessel) => [vessel.name, vessel.id]));
  const ownerCodes = summary.ownerCodes.map((owner) => owner.code);
  if (ownerCodes.length > 0) {
    const { error } = await admin.from('company_owner_codes').upsert(
      ownerCodes.map((code) => ({ company_id: companyId, code, updated_at: new Date().toISOString() })),
      { onConflict: 'company_id,code' }
    );
    if (error) throw new Error(error.message);
  }

  const importPayload = records.map((record) => ({
    vesselId: record.vessel && !isCompanyWideVessel(record.vessel) ? vesselIdByName.get(record.vessel) ?? null : null,
    ownerRaw: record.ownerRaw,
    ownerCurrent: record.ownerCurrent,
    itemName: record.itemName,
    itemNumber: record.itemNumber,
    agencyType: record.agencyType,
    complianceArea: record.complianceArea,
    frequencyLabel: record.frequencyLabel,
    recurrenceUnit: record.recurrenceUnit,
    recurrenceInterval: record.recurrenceInterval,
    startWorkingOn: record.startWorkingOn,
    expirationDate: record.expirationDate,
    status: record.status,
    statusNotes: record.statusNotes,
    instructions: record.instructions,
    sourceRowNumber: record.sourceRowNumber
  }));

  const { error: importError } = await admin.rpc('import_compliance_workbook_records', {
    target_company_id: companyId,
    target_sheet: sheetName,
    records: importPayload
  });

  if (importError) throw new Error(importError.message);

  const { data: importedItems, error: importedItemsError } = await admin
    .from('compliance_items')
    .select('id, company_id')
    .eq('company_id', companyId)
    .eq('source_sheet', sheetName)
    .not('source_row_number', 'is', null);

  if (importedItemsError) throw new Error(importedItemsError.message);

  const reminderRows = (importedItems ?? []).flatMap((item) => [
    {
      item_id: item.id,
      company_id: companyId,
      label: 'Start working reminder',
      trigger_type: 'on_start_date'
    },
    {
      item_id: item.id,
      company_id: companyId,
      label: '14 days before expiration',
      trigger_type: 'days_before_expiration',
      days_before: 14
    }
  ]);

  for (let index = 0; index < reminderRows.length; index += 100) {
    const { error } = await admin
      .from('compliance_item_reminder_rules')
      .upsert(reminderRows.slice(index, index + 100), { onConflict: 'item_id,label,trigger_type' });
    if (error) throw new Error(error.message);
  }

  const { data: importRun, error: importRunError } = await admin
    .from('company_import_runs')
    .insert({
      company_id: companyId,
      sheet_name: sheetName,
      workbook_name: workbook.name || null,
      record_count: summary.recordCount,
      vessel_count: summary.vesselCount,
      owner_code_count: summary.ownerCodes.length,
      warning_count: summary.warnings.length,
      imported_by: user.id
    })
    .select('id')
    .single();

  if (importRunError) throw new Error(importRunError.message);

  if (summary.warnings.length > 0) {
    const { error: warningsError } = await admin.from('company_import_warnings').insert(
      summary.warnings.map((warning) => ({
        import_run_id: importRun.id,
        company_id: companyId,
        row_number: warning.row,
        issue: warning.issue,
        value: warning.value ?? null,
        severity: warningSeverity(warning.issue)
      }))
    );

    if (warningsError) throw new Error(warningsError.message);
  }

  revalidatePath('/admin');
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}/overview`);
  revalidatePath(`/admin/customers/${companyId}/import`);
  revalidatePath(`/admin/customers/${companyId}/codes`);

  const warningCopy = summary.warnings.length > 0 ? ` ${summary.warnings.length} import warnings need review.` : '';
  redirect(customerCodesPath(companyId, `Imported ${summary.recordCount} items, ${summary.vesselCount} vessels, and ${summary.ownerCodes.length} owner codes.${warningCopy}`));
}
