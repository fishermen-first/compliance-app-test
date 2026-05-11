import { notFound } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { ComplianceItemDetail } from '@/components/compliance-item-detail';
import { getCompanyOwnerCodes, getCustomerContext, mapComplianceItem } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';

type ItemDetailPageProps = { params: { id: string } };

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { supabase, membership, company } = await getCustomerContext();

  const [{ data: rawItem }, { data: history }, { data: reminderRules }, { data: recipients }, ownerCodes] = await Promise.all([
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
    getCompanyOwnerCodes(membership.company_id)
  ]);

  if (!rawItem) notFound();

  const item = mapComplianceItem(rawItem);
  const canManageItem =
    ['owner', 'office_admin'].includes(membership.role)
    || (
      membership.role === 'office_user'
      && Boolean(item.owner_current)
      && ownerCodes.some((owner) => owner.code === item.owner_current && owner.is_assigned_to_current_user)
    );

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} activePath="/" />
      <main className="workspace list-workspace item-detail-page">
        <ComplianceItemDetail
          item={item}
          history={(history ?? []) as any}
          reminderRules={reminderRules ?? []}
          recipients={recipients ?? []}
          canManageItem={canManageItem}
          backHref="/"
          backLabel="Back to work queue"
          itemPathPrefix="/items"
        />
      </main>
    </div>
  );
}
