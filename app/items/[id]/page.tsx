import { notFound } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { ComplianceItemDetail } from '@/components/compliance-item-detail';
import { getCompanyOwnerCodes, getCustomerContext, mapComplianceItem } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type ItemDetailPageProps = { params: { id: string } };

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { supabase, membership, company, profile, user } = await getCustomerContext();

  const [{ data: rawItem }, { data: history }, { data: reminderRules }, { data: recipients }, { data: reminderLogs }, { data: vessels }, ownerCodes] = await Promise.all([
    supabase
      .from('compliance_items')
      .select('*, vessels(name)')
      .eq('company_id', membership.company_id)
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('compliance_item_status_history')
      .select('from_status, to_status, notes, changed_at, profiles(full_name, email)')
      .eq('company_id', membership.company_id)
      .eq('item_id', params.id)
      .order('changed_at', { ascending: false }),
    supabase
      .from('compliance_item_reminder_rules')
      .select('label, trigger_type, days_before, repeat_every_days, active')
      .eq('company_id', membership.company_id)
      .eq('item_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('compliance_item_notification_recipients')
      .select('recipient_name, recipient_email, recipient_type')
      .eq('company_id', membership.company_id)
      .eq('item_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('reminder_send_log')
      .select('recipient_email, status, scheduled_for, sent_at, failure_reason')
      .eq('company_id', membership.company_id)
      .eq('item_id', params.id)
      .order('scheduled_for', { ascending: false })
      .limit(5),
    supabase
      .from('vessels')
      .select('id, name')
      .eq('company_id', membership.company_id)
      .eq('active', true)
      .order('name'),
    getCompanyOwnerCodes(membership.company_id)
  ]);

  if (!rawItem) notFound();

  const item = mapComplianceItem(rawItem);
  const isOwner = membership.role === 'owner';
  const isCreator = item.created_by === user.id;
  const isAssignedOfficeUser = (
    membership.role === 'office_user'
    && Boolean(item.owner_current)
    && ownerCodes.some((owner) => owner.code === item.owner_current && owner.is_assigned_to_current_user)
  );
  const canManageItem = isOwner || isAssignedOfficeUser || isCreator;
  const canEditCore = isOwner || isCreator;

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={profile?.full_name ?? user.email}
        userEmail={user.email}
        activePath="/"
      />
      <main className="workspace list-workspace item-detail-page">
        <ComplianceItemDetail
          item={item}
          history={(history ?? []) as any}
          reminderRules={reminderRules ?? []}
          recipients={recipients ?? []}
          reminderLogs={reminderLogs ?? []}
          vessels={vessels ?? []}
          ownerOptions={ownerCodes.map((owner) => ({ code: owner.code, display_name: owner.display_name }))}
          canUpdateStatus={canManageItem}
          canCompleteItem={canManageItem}
          canEditCore={canEditCore}
          canManageReminders={canEditCore}
          backHref="/"
          backLabel="Back to work queue"
          itemPathPrefix="/items"
        />
      </main>
    </div>
  );
}
