import 'server-only';

import { getAppAdminClassification } from '@/lib/app-admins';
import {
  getCustomerDetail,
  getCustomerUsers,
  normalizedEmail,
  relation,
  type CustomerDetail,
  type CustomerRole,
  type CustomerUser
} from '@/lib/customer-detail';
import { type Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';

type AppRole = Database['public']['Enums']['app_role'];
type ComplianceItemStatus = Database['public']['Enums']['compliance_item_status'];
type RecurrenceUnit = Database['public']['Enums']['recurrence_unit'];
type ReminderStatus = Database['public']['Enums']['reminder_status'];

type ProfileRelation = {
  email: string | null;
  full_name: string | null;
};

type OwnerCodeRow = {
  id: string;
  code: string;
  display_name: string | null;
  user_id: string | null;
  pending_email: string | null;
  handoff_exempt: boolean;
  handoff_exemption_reason: string | null;
  profiles?: ProfileRelation | ProfileRelation[] | null;
};

type ItemRow = {
  id: string;
  vessel_id: string | null;
  owner_current: string | null;
  item_name: string;
  status: ComplianceItemStatus;
  recurrence_unit: RecurrenceUnit;
  start_working_on: string | null;
  expiration_date: string | null;
  source_sheet: string | null;
  source_row_number: number | null;
  updated_at: string;
};

type ImportRunRow = {
  id: string;
  sheet_name: string;
  workbook_name: string | null;
  record_count: number;
  vessel_count: number;
  owner_code_count: number;
  warning_count: number;
  issue_count: number;
  safe_create_count: number;
  safe_update_count: number;
  skipped_count: number;
  mode: string;
  status: string;
  detected_format: string | null;
  template_version: string | null;
  parser_version: string | null;
  applied_from_run_id: string | null;
  applied_run_id: string | null;
  applied_at: string | null;
  imported_by: string | null;
  created_at: string;
};

type ImportWarningRow = {
  id: string;
  row_number: number | null;
  issue: string;
  value: string | null;
  severity: string;
};

type ImportIssueRow = {
  id: string;
  source_row_number: number | null;
  issue_type: string;
  severity: string;
  message: string;
  status: string;
};

type ReminderLogRow = {
  id: string;
  recipient_email: string;
  status: ReminderStatus;
  failure_reason: string | null;
  scheduled_for: string;
  subject: string;
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  metadata: unknown;
};

type MembershipIndexRow = {
  company_id: string;
  profiles?: ProfileRelation | ProfileRelation[] | null;
};

type InvitationIndexRow = {
  company_id: string;
  email: string | null;
  accepted_at: string | null;
};

type OwnerCodeStatus = 'mapped' | 'pending' | 'needs-email' | 'exempt' | 'invalid-admin-email';

type InviteFailureRow = {
  invitationId: string;
  email: string | null;
  message: string;
  createdAt: string;
};

export type AdminCustomerNavData = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  vesselCount: number;
  itemCount: number;
  ownerCodeCount: number;
  userCount: number;
  pendingInvitationCount: number;
  gates: CustomerDetail['gates'];
  lastEditAt: string;
  lastEditBy: string | null;
};

export type AdminCustomerWorkspace = {
  customer: CustomerDetail;
  nav: AdminCustomerNavData;
  nextAction: {
    title: string;
    detail: string;
    href: string;
    tone: 'ready' | 'attention' | 'info';
  };
  customerRows: Array<{
    id: string;
    name: string;
    state: string;
    tone: 'ready' | 'attention' | 'danger';
    nextAction: string;
    nextHref: string;
    users: number;
    updatedAt: string;
  }>;
  importReview: {
    latestRun: ImportRunRow | null;
    warnings: ImportWarningRow[];
    issues: ImportIssueRow[];
    metrics: {
      importedRecords: number;
      warningCount: number;
      issueCount: number;
      safeCreateCount: number;
      safeUpdateCount: number;
      skippedCount: number;
      companyWideCount: number;
      vesselCount: number;
      manualRecurrenceCount: number;
      missingDateCount: number;
    };
    sampleItems: ItemRow[];
  };
  ownerCodeRows: Array<{
    id: string;
    code: string;
    records: number;
    displayName: string | null;
    loginEmail: string | null;
    handoffExempt: boolean;
    handoffExemptionReason: string | null;
    status: OwnerCodeStatus;
  }>;
  users: CustomerUser[];
  diagnostics: {
    reminderLogs: ReminderLogRow[];
    inviteFailures: InviteFailureRow[];
    failedReminderCount: number;
    pendingInviteCount: number;
    expiredInviteCount: number;
    firstLoginVerified: boolean;
    statusChangeCount: number;
    auditRows: AuditRow[];
    visibilityRows: Array<{
      label: string;
      email: string | null;
      role: CustomerRole;
      codes: string[];
      visibleRecords: number;
      note: string;
    }>;
  };
  danger: {
    itemCount: number;
    vesselCount: number;
    ownerCodeCount: number;
    activeUserCount: number;
    pendingInviteCount: number;
    recentActivityCount: number;
  };
};

export function toAdminCustomerNavData(customer: CustomerDetail): AdminCustomerNavData {
  return {
    id: customer.id,
    name: customer.name,
    timezone: customer.timezone,
    createdAt: customer.createdAt.toISOString(),
    vesselCount: customer.vesselCount,
    itemCount: customer.itemCount,
    ownerCodeCount: customer.ownerCodeCount,
    userCount: customer.userCount,
    pendingInvitationCount: customer.pendingInvitationCount,
    gates: customer.gates,
    lastEditAt: customer.lastEditAt.toISOString(),
    lastEditBy: customer.lastEditBy
  };
}

function formatDateLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function itemCountsByOwner(items: ItemRow[]) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    if (!item.owner_current) return;
    counts.set(item.owner_current, (counts.get(item.owner_current) ?? 0) + 1);
  });

  return counts;
}

function profileEmail(row: { profiles?: ProfileRelation | ProfileRelation[] | null }) {
  return normalizedEmail(relation(row.profiles)?.email);
}

function stageForCounts(counts: {
  id: string;
  items: number;
  ownerCodes: number;
  mappedOwnerCodes: number;
  users: number;
  pendingInvites: number;
}) {
  if (counts.items === 0) {
    return {
      state: 'Workbook needed',
      tone: 'attention' as const,
      nextAction: 'Import workbook',
      nextHref: `/admin/customers/${counts.id}/import`
    };
  }

  if (counts.ownerCodes === 0) {
    return {
      state: 'Review import',
      tone: 'attention' as const,
      nextAction: 'Review owner codes',
      nextHref: `/admin/customers/${counts.id}/import`
    };
  }

  if (counts.mappedOwnerCodes < counts.ownerCodes) {
    const remaining = counts.ownerCodes - counts.mappedOwnerCodes;
    return {
      state: 'Map owners',
      tone: 'attention' as const,
      nextAction: `${remaining} owner code${remaining === 1 ? '' : 's'} need review`,
      nextHref: `/admin/customers/${counts.id}/codes`
    };
  }

  if (counts.users + counts.pendingInvites === 0) {
    return {
      state: 'Add users',
      tone: 'attention' as const,
      nextAction: 'Stage customer users',
      nextHref: `/admin/customers/${counts.id}/users`
    };
  }

  return {
    state: 'Users staged',
    tone: 'ready' as const,
    nextAction: 'Verify first login',
    nextHref: `/admin/customers/${counts.id}/diagnostics`
  };
}

function nextActionFor(customer: CustomerDetail) {
  const blocking = customer.gates.find((gate) => !gate.done);

  if (!blocking) {
    return {
      title: 'Workspace handoff is verified',
      detail: 'Customer setup gates are complete. Use diagnostics for support checks and reminder delivery.',
      href: `/admin/customers/${customer.id}/diagnostics`,
      tone: 'ready' as const
    };
  }

  if (blocking.id === 'workbook') {
    return {
      title: 'Import the customer workbook',
      detail: 'Create the imported work queue before mapping owner codes or inviting users.',
      href: `/admin/customers/${customer.id}/import`,
      tone: 'attention' as const
    };
  }

  if (blocking.id === 'codes') {
    return {
      title: 'Map owner codes before customer handoff',
      detail: 'Every imported owner code needs a customer email or an explicit exception before invites go out.',
      href: `/admin/customers/${customer.id}/codes`,
      tone: 'attention' as const
    };
  }

  if (blocking.id === 'users') {
    return {
      title: 'Stage customer users',
      detail: 'Add the customer people who should receive login access after owner-code mapping is safe.',
      href: `/admin/customers/${customer.id}/users`,
      tone: 'attention' as const
    };
  }

  return {
    title: 'Send pending invites and verify first login',
    detail: 'Invite links can go out now. First-login evidence confirms users land in the expected workspace.',
    href: `/admin/customers/${customer.id}/diagnostics`,
    tone: 'info' as const
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function statusForOwner(owner: OwnerCodeRow, appAdminEmails: Set<string>): OwnerCodeStatus {
  const profile = relation(owner.profiles);
  const loginEmail = normalizedEmail(profile?.email ?? owner.pending_email);

  if (loginEmail && appAdminEmails.has(loginEmail)) return 'invalid-admin-email';
  if (owner.handoff_exempt && owner.handoff_exemption_reason?.trim()) return 'exempt' as const;
  if (owner.user_id) return 'mapped' as const;
  if (owner.pending_email) return 'pending' as const;
  return 'needs-email' as const;
}

function inviteFailuresFromAudit(row: AuditRow): InviteFailureRow[] {
  if (row.action !== 'handoff_invites_sent' || !isRecord(row.metadata)) return [];

  const failures = row.metadata.failedInvitations;
  if (!Array.isArray(failures)) return [];

  return failures.flatMap((failure) => {
    if (!isRecord(failure)) return [];

    const invitationId = stringValue(failure.invitationId);
    const message = stringValue(failure.message) || 'Unknown invite send failure';

    return [{
      invitationId,
      email: stringValue(failure.email) || null,
      message,
      createdAt: row.created_at
    }];
  });
}

function visibleRecordsFor(user: CustomerUser, totalItems: number, ownerCounts: Map<string, number>) {
  if (user.role === 'owner') {
    return totalItems;
  }

  return user.codes.reduce((sum, code) => sum + (ownerCounts.get(code) ?? 0), 0);
}

export async function getAdminCustomerWorkspace(customerId: string): Promise<AdminCustomerWorkspace> {
  const admin = createAdminClient();
  const classification = await getAppAdminClassification();

  if (classification.status === 'unverified') {
    throw new Error('FF-admin classification could not be verified.');
  }

  const [
    customer,
    users,
    companiesResult,
    allItemsResult,
    allOwnerCodesResult,
    allMembershipsResult,
    allInvitationsResult,
    itemsResult,
    ownerCodesResult,
    latestImportResult,
    reminderLogsResult,
    statusHistoryResult,
    auditResult,
    inviteAuditResult
  ] = await Promise.all([
    getCustomerDetail(customerId),
    getCustomerUsers(customerId),
    admin.from('companies').select('id, name, updated_at').order('updated_at', { ascending: false }),
    admin.from('compliance_items').select('id, company_id'),
    admin.from('company_owner_codes').select('id, company_id, user_id, pending_email, handoff_exempt, handoff_exemption_reason, profiles!company_owner_codes_user_id_fkey(email)'),
    admin.from('company_memberships').select('company_id, profiles(email)'),
    admin.from('company_invitations').select('company_id, email, accepted_at'),
    admin
      .from('compliance_items')
      .select('id, vessel_id, owner_current, item_name, status, recurrence_unit, start_working_on, expiration_date, source_sheet, source_row_number, updated_at')
      .eq('company_id', customerId)
      .order('source_row_number', { ascending: true, nullsFirst: false }),
    admin
      .from('company_owner_codes')
      .select('id, code, display_name, user_id, pending_email, handoff_exempt, handoff_exemption_reason, profiles!company_owner_codes_user_id_fkey(email, full_name)')
      .eq('company_id', customerId)
      .order('code'),
    admin
      .from('company_import_runs')
      .select('id, sheet_name, workbook_name, record_count, vessel_count, owner_code_count, warning_count, issue_count, safe_create_count, safe_update_count, skipped_count, mode, status, detected_format, template_version, parser_version, applied_from_run_id, applied_run_id, applied_at, imported_by, created_at')
      .eq('company_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('reminder_send_log')
      .select('id, recipient_email, status, failure_reason, scheduled_for, subject')
      .eq('company_id', customerId)
      .order('scheduled_for', { ascending: false })
      .limit(8),
    admin
      .from('compliance_item_status_history')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', customerId),
    admin
      .from('audit_log')
      .select('id, action, entity_type, created_at, metadata')
      .eq('company_id', customerId)
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('audit_log')
      .select('id, action, entity_type, created_at, metadata')
      .eq('company_id', customerId)
      .eq('action', 'handoff_invites_sent')
      .order('created_at', { ascending: false })
      .limit(25)
  ]);

  const results = [
    companiesResult,
    allItemsResult,
    allOwnerCodesResult,
    allMembershipsResult,
    allInvitationsResult,
    itemsResult,
    ownerCodesResult,
    latestImportResult,
    reminderLogsResult,
    statusHistoryResult,
    auditResult,
    inviteAuditResult
  ];
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const items = (itemsResult.data ?? []) as ItemRow[];
  const ownerCodes = (ownerCodesResult.data ?? []) as unknown as OwnerCodeRow[];
  const latestRun = (latestImportResult.data ?? null) as ImportRunRow | null;
  const issueRunId = latestRun?.mode === 'apply'
    ? latestRun.applied_from_run_id ?? latestRun.id
    : latestRun?.id ?? null;
  const warningsResult = latestRun
    ? await admin
        .from('company_import_warnings')
        .select('id, row_number, issue, value, severity')
        .eq('import_run_id', latestRun.id)
        .order('row_number', { ascending: true, nullsFirst: false })
        .limit(50)
    : { data: [], error: null };
  const issuesResult = issueRunId
    ? await admin
        .from('compliance_import_issues')
        .select('id, source_row_number, issue_type, severity, message, status')
        .eq('import_run_id', issueRunId)
        .order('source_row_number', { ascending: true, nullsFirst: false })
        .limit(75)
    : { data: [], error: null };

  if (warningsResult.error) throw new Error(warningsResult.error.message);
  if (issuesResult.error) throw new Error(issuesResult.error.message);

  const ownerCounts = itemCountsByOwner(items);
  const appAdminEmails = classification.appAdminEmails;
  const allItems = (allItemsResult.data ?? []) as Array<{ id: string; company_id: string }>;
  const allOwnerCodes = (allOwnerCodesResult.data ?? []) as Array<{
    company_id: string;
    user_id: string | null;
    pending_email: string | null;
    handoff_exempt: boolean;
    handoff_exemption_reason: string | null;
    profiles?: ProfileRelation | ProfileRelation[] | null;
  }>;
  const allMemberships = (allMembershipsResult.data ?? []) as unknown as MembershipIndexRow[];
  const allInvitations = (allInvitationsResult.data ?? []) as InvitationIndexRow[];

  const customerRows = (companiesResult.data ?? []).slice(0, 8).map((company) => {
    const companyOwnerCodes = allOwnerCodes.filter((owner) => owner.company_id === company.id);
    const usersForCompany = allMemberships.filter(
      (membership) => membership.company_id === company.id && !appAdminEmails.has(profileEmail(membership))
    ).length;
    const pendingInvites = allInvitations.filter(
      (invite) =>
        invite.company_id === company.id &&
        !invite.accepted_at &&
        !appAdminEmails.has(normalizedEmail(invite.email))
    ).length;
    const mappedOwnerCodes = companyOwnerCodes.filter((owner) => {
      const profile = relation(owner.profiles);
      const mappedEmail = normalizedEmail(profile?.email ?? owner.pending_email);
      if (mappedEmail && appAdminEmails.has(mappedEmail)) return false;
      if (owner.handoff_exempt && owner.handoff_exemption_reason?.trim()) return true;
      return Boolean(owner.user_id || owner.pending_email);
    }).length;
    const stage = stageForCounts({
      id: company.id,
      items: allItems.filter((item) => item.company_id === company.id).length,
      ownerCodes: companyOwnerCodes.length,
      mappedOwnerCodes,
      users: usersForCompany,
      pendingInvites
    });

    return {
      id: company.id,
      name: company.name,
      state: stage.state,
      tone: stage.tone,
      nextAction: stage.nextAction,
      nextHref: stage.nextHref,
      users: usersForCompany + pendingInvites,
      updatedAt: formatDateLabel(company.updated_at)
    };
  });

  const ownerCodeRows = ownerCodes.map((owner) => {
    const profile = relation(owner.profiles);
    return {
      id: owner.id,
      code: owner.code,
      records: ownerCounts.get(owner.code) ?? 0,
      displayName: owner.display_name,
      loginEmail: profile?.email ?? owner.pending_email,
      handoffExempt: owner.handoff_exempt,
      handoffExemptionReason: owner.handoff_exemption_reason,
      status: statusForOwner(owner, appAdminEmails)
    };
  });

  const reminderLogs = (reminderLogsResult.data ?? []) as ReminderLogRow[];
  const auditRows = (auditResult.data ?? []) as AuditRow[];
  const inviteFailures = ((inviteAuditResult.data ?? []) as AuditRow[]).flatMap(inviteFailuresFromAudit);
  const activeUsers = users.filter((user) => user.kind === 'membership' && user.status === 'active');

  return {
    customer,
    nav: toAdminCustomerNavData(customer),
    nextAction: nextActionFor(customer),
    customerRows,
    importReview: {
      latestRun,
      warnings: (warningsResult.data ?? []) as ImportWarningRow[],
      issues: (issuesResult.data ?? []) as ImportIssueRow[],
      metrics: {
        importedRecords: latestRun?.record_count ?? customer.itemCount,
        warningCount: latestRun?.warning_count ?? 0,
        issueCount: latestRun?.issue_count ?? 0,
        safeCreateCount: latestRun?.safe_create_count ?? 0,
        safeUpdateCount: latestRun?.safe_update_count ?? 0,
        skippedCount: latestRun?.skipped_count ?? 0,
        companyWideCount: items.filter((item) => !item.vessel_id).length,
        vesselCount: customer.vesselCount,
        manualRecurrenceCount: items.filter((item) => item.recurrence_unit === 'manual' || item.recurrence_unit === 'none').length,
        missingDateCount: items.filter((item) => !item.start_working_on || !item.expiration_date).length
      },
      sampleItems: items.slice(0, 8)
    },
    ownerCodeRows,
    users,
    diagnostics: {
      reminderLogs,
      inviteFailures,
      failedReminderCount: reminderLogs.filter((log) => log.status === 'failed').length,
      pendingInviteCount: users.filter((user) => user.status === 'pending').length,
      expiredInviteCount: users.filter((user) => user.status === 'expired').length,
      firstLoginVerified: activeUsers.some((user) => Boolean(user.lastLoginAt)),
      statusChangeCount: statusHistoryResult.count ?? 0,
      auditRows,
      visibilityRows: users.slice(0, 8).map((user) => ({
        label: user.name ?? user.email ?? 'Customer user',
        email: user.email,
        role: user.role,
        codes: user.codes,
        visibleRecords: visibleRecordsFor(user, items.length, ownerCounts),
        note: user.role === 'owner' ? 'Workspace owner sees all workspace items' : 'Derived from assigned owner codes'
      }))
    },
    danger: {
      itemCount: customer.itemCount,
      vesselCount: customer.vesselCount,
      ownerCodeCount: customer.ownerCodeCount,
      activeUserCount: users.filter((user) => user.status === 'active').length,
      pendingInviteCount: users.filter((user) => user.status === 'pending' || user.status === 'expired').length,
      recentActivityCount: auditRows.length
    }
  };
}
