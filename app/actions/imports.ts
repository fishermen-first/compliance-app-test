'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { parseComplianceWorkbook, WorkbookImportError } from '@/lib/workbook-import';

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  if (!value) throw new Error(`Missing required field: ${name}`);
  return value;
}

function customerImportPath(companyId: string, message: string) {
  return `/admin/customers/${companyId}/import?message=${encodeURIComponent(message)}`;
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
  let parsed: Awaited<ReturnType<typeof parseComplianceWorkbook>>;

  try {
    parsed = await parseComplianceWorkbook(buffer);
  } catch (error) {
    if (error instanceof WorkbookImportError) {
      redirect(customerImportPath(companyId, error.message));
    }
    throw error;
  }

  const { sheetName, detectedFormat, templateVersion, parserVersion, records, summary } = parsed;

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

  const importPayload = records.map((record) => ({
    sourceRowNumber: record.sourceRowNumber,
    sourceRowJson: record.sourceRowJson,
    sourceRowHash: record.sourceRowHash,
    sourceFingerprint: record.sourceFingerprint,
    templateItemKey: record.templateItemKey,
    matchCandidate: record.matchCandidate,
    ownerRaw: record.ownerRaw,
    ownerCurrent: record.ownerCurrent,
    vessel: record.vessel,
    vesselOrScope: record.vesselOrScope,
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
    instructions: record.instructions
  }));

  const { data: importRunId, error: importError } = await admin.rpc('dry_run_compliance_workbook_import', {
    target_company_id: companyId,
    target_sheet: sheetName,
    workbook_name: workbook.name || undefined,
    detected_format: detectedFormat,
    template_version: templateVersion ?? undefined,
    parser_version: parserVersion,
    records: importPayload,
    parse_summary: summary,
    imported_by: user.id
  });

  if (importError) throw new Error(importError.message);

  const { data: importRun, error: importRunError } = await admin
    .from('company_import_runs')
    .select('id, record_count, issue_count, safe_create_count, safe_update_count, skipped_count')
    .eq('id', importRunId)
    .single();

  if (importRunError) throw new Error(importRunError.message);

  revalidatePath('/admin');
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}/overview`);
  revalidatePath(`/admin/customers/${companyId}/import`);
  revalidatePath(`/admin/customers/${companyId}/codes`);

  const safeCount = importRun.safe_create_count + importRun.safe_update_count;
  const issueCopy = importRun.issue_count > 0 ? ` ${importRun.issue_count} issues need review.` : '';
  redirect(customerImportPath(companyId, `Dry run complete: ${importRun.record_count} rows parsed, ${safeCount} safe to apply.${issueCopy}`));
}

export async function applyComplianceWorkbookImport(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const importRunId = requiredString(formData, 'importRunId');
  const user = await requireAppAdmin();
  const admin = createAdminClient();

  await ensureImporterProfile(admin, user);

  const { data: applyRunId, error: applyError } = await admin.rpc('apply_compliance_workbook_import', {
    target_import_run_id: importRunId,
    approved_issue_ids: [],
    applied_by: user.id
  });

  if (applyError) throw new Error(applyError.message);

  const { data: applyRun, error: applyRunError } = await admin
    .from('company_import_runs')
    .select('safe_create_count, safe_update_count, skipped_count')
    .eq('id', applyRunId)
    .eq('company_id', companyId)
    .single();

  if (applyRunError) throw new Error(applyRunError.message);

  revalidatePath('/admin');
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}/overview`);
  revalidatePath(`/admin/customers/${companyId}/import`);
  revalidatePath(`/admin/customers/${companyId}/codes`);

  const skippedCopy = applyRun.skipped_count > 0 ? ` ${applyRun.skipped_count} rows were left unchanged for review.` : '';
  redirect(customerImportPath(companyId, `Applied ${applyRun.safe_create_count} new rows and ${applyRun.safe_update_count} source updates.${skippedCopy}`));
}
