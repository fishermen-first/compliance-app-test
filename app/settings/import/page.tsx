import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { applyComplianceWorkbookImport, importComplianceWorkbook } from '@/app/actions/imports';
import { AppSidebar } from '@/components/app-sidebar';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { accessRoleLabel } from '@/lib/roles';

type Props = { searchParams?: { message?: string } };

export default async function WorkspaceImportPage({ searchParams }: Props) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect('/login');

  const { data: memberships } = await supabase.from('company_memberships')
    .select('company_id, role, companies(name)').eq('user_id', userData.user.id).order('created_at', { ascending: true });
  if (!memberships || memberships.length !== 1) redirect('/');
  const membership = memberships[0] as typeof memberships[number] & { companies?: { name: string } | { name: string }[] | null };
  const company = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies;
  if (membership.role !== 'owner') redirect('/settings');

  const admin = createAdminClient();
  const { data: latest } = await admin.from('company_import_runs')
    .select('id, workbook_name, record_count, issue_count, safe_create_count, safe_update_count, skipped_count, mode, status, applied_run_id, created_at')
    .eq('company_id', membership.company_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: issues } = latest?.id ? await admin.from('compliance_import_issues')
    .select('id, source_row_number, issue_type, severity, message, status').eq('import_run_id', latest.id)
    .eq('status', 'open').order('source_row_number', { ascending: true }) : { data: [] };
  const safeRows = (latest?.safe_create_count ?? 0) + (latest?.safe_update_count ?? 0);
  const canApply = latest?.mode === 'dry_run' && !latest.applied_run_id && safeRows > 0;

  return <div className="app-shell">
    <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} userName={userData.user.email} userEmail={userData.user.email} activePath="/settings/import" />
    <main className="workspace-import-page">
      <header className="workspace-import-header"><div><p className="eyebrow">Workspace tools</p><h1>Import workbook</h1><p>Validate and preview every change before it reaches the live compliance schedule.</p></div><a className="import-template-link" href="/api/import-template"><Download aria-hidden="true" /> Download template</a></header>
      {searchParams?.message ? <div className="inline-message" role="status">{searchParams.message}</div> : null}
      <section className="workspace-import-panel">
        <div className="workspace-import-panel-head"><div><h2>1. Upload and validate</h2><p>Required columns are checked before a dry run is created.</p></div><span>Owner access</span></div>
        <form action={importComplianceWorkbook} className="workspace-import-upload"><input type="hidden" name="companyId" value={membership.company_id} /><label><UploadCloud aria-hidden="true" /><strong>Choose an Excel workbook</strong><small>.xlsx or .xls · no live records change during validation</small><input name="workbook" type="file" accept=".xlsx,.xls" required /></label><button type="submit">Validate workbook</button></form>
      </section>
      <section className="workspace-import-panel">
        <div className="workspace-import-panel-head"><div><h2>2. Review proposed changes</h2><p>Safe rows can be applied while unresolved rows remain held.</p></div>{latest ? <span>{latest.mode.replaceAll('_', ' ')} · {latest.status.replaceAll('_', ' ')}</span> : null}</div>
        {!latest ? <div className="workspace-import-empty"><FileSpreadsheet aria-hidden="true" /><p>Upload a workbook to create the first review.</p></div> : <>
          <div className="workspace-import-metrics"><div><span>Rows parsed</span><strong>{latest.record_count}</strong></div><div><span>New records</span><strong>{latest.safe_create_count}</strong></div><div><span>Updates</span><strong>{latest.safe_update_count}</strong></div><div><span>Held</span><strong>{latest.skipped_count}</strong></div></div>
          <div className="workspace-import-summary"><CheckCircle2 aria-hidden="true" /><div><strong>{safeRows} rows are ready</strong><span>{latest.workbook_name ?? 'Uploaded workbook'} · {new Date(latest.created_at).toLocaleDateString()}</span></div></div>
          {(issues ?? []).length > 0 ? <div className="workspace-import-issues"><h3><AlertTriangle aria-hidden="true" /> {(issues ?? []).length} rows need attention</h3>{(issues ?? []).map((issue) => <div key={issue.id}><strong>{issue.message}</strong><span>Row {issue.source_row_number ?? '—'} · {issue.issue_type.replaceAll('_', ' ')}</span></div>)}<Link href="/settings/lists">Review vessels and agencies</Link></div> : null}
          <form action={applyComplianceWorkbookImport} className="workspace-import-confirm"><input type="hidden" name="companyId" value={membership.company_id} /><input type="hidden" name="importRunId" value={latest.id} /><p>This adds or updates safe rows only. It does not delete records or change user access.</p><button type="submit" disabled={!canApply}>Import {safeRows} safe rows</button></form>
        </>}
      </section>
    </main>
  </div>;
}
