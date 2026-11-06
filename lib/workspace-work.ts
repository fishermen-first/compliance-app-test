import { fetchAllRows } from '@/lib/fetch-all-rows';
import { type DashboardMember, type DashboardTask } from '@/components/combined-dashboard';
import { itemHasAnyOwnerCode } from '@/lib/compliance';
import { getCompanyOwnerCodes, getCustomerItems } from '@/lib/customer-data';
import { createClient } from '@/lib/supabase/server';

export async function getWorkspaceWork({ companyId, userId, role, requestedOwner, includeArchived = false, fullName, email }: {
  companyId: string; userId: string; role: string; requestedOwner?: string; includeArchived?: boolean; fullName?: string | null; email?: string | null;
}) {
  const supabase = createClient();
  const [allItems, ownerCodes] = await Promise.all([getCustomerItems(companyId, { includeArchived }), getCompanyOwnerCodes(companyId)]);
  const canViewEveryone = role === 'owner' || role === 'office_admin';
  const mappedOwnerCodes = ownerCodes.filter((owner) => owner.is_assigned_to_current_user).map((owner) => owner.code);
  const showEveryone = canViewEveryone && (requestedOwner === 'all' || (!requestedOwner && mappedOwnerCodes.length === 0));
  const complianceItems = showEveryone ? allItems : allItems.filter((item) => itemHasAnyOwnerCode(item, mappedOwnerCodes));
  const manageableItemIds = complianceItems.filter((item) => role === 'owner' || (role === 'office_user' && itemHasAnyOwnerCode(item, mappedOwnerCodes))).map((item) => item.id);
  const [taskRows, memberResult] = await Promise.all([
    fetchAllRows((from, to) => {
      let query = supabase.from('workspace_tasks')
        .select('id, title, details, assigned_to, status, priority, due_date, completed_at, archived_at, created_at, compliance_item_id, reminder_at, reminder_dismissed_at, compliance_items!workspace_tasks_compliance_item_id_fkey(id, item_name)', { count: 'exact' })
        .eq('company_id', companyId).is('archived_at', null);
      if (!showEveryone) query = query.eq('assigned_to', userId);
      return query.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).order('id').range(from, to);
    }),
    canViewEveryone ? supabase.rpc('get_workspace_task_members', { target_company_id: companyId }) : Promise.resolve({ data: [{ user_id: userId, full_name: fullName ?? null, email: email ?? null }], error: null })
  ]);
  if (memberResult.error) throw new Error(memberResult.error.message);
  return { complianceItems, manageableItemIds, tasks: taskRows.map((row) => ({ ...row, compliance_items: Array.isArray(row.compliance_items) ? row.compliance_items[0] ?? null : row.compliance_items })) as DashboardTask[], members: (memberResult.data ?? []) as DashboardMember[], ownerCodes, canViewEveryone, showEveryone };
}
