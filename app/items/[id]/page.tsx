import { notFound } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { ComplianceItemDetail } from '@/components/compliance-item-detail';
import { itemHasAnyOwnerCode } from '@/lib/compliance';
import { getCompanyOwnerCodes, getCustomerContext, mapComplianceItem } from '@/lib/customer-data';
import { getReferenceLists } from '@/lib/reference-lists';
import { accessRoleLabel } from '@/lib/roles';

type ItemDetailPageProps = { params: { id: string }; searchParams?: { completed?: string; nextItem?: string } };

export default async function ItemDetailPage({ params, searchParams }: ItemDetailPageProps) {
  const { supabase, membership, company, profile, user } = await getCustomerContext();

  const [{ data: rawItem }, { data: history }, { data: reminderRules }, { data: recipients }, { data: reminderLogs }, { data: vessels }, ownerCodes, referenceLists] = await Promise.all([
    supabase
      .from('compliance_items')
      .select('*, vessels(name), compliance_item_owner_codes(owner_code, is_primary)')
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
      .select('label, trigger_type, days_before, repeat_every_days, send_on, audience, active')
      .eq('company_id', membership.company_id)
      .eq('item_id', params.id)
      .order('created_at', { ascending: true }),
    (supabase as any)
      .from('compliance_item_notification_recipients')
      .select('recipient_name, recipient_email, recipient_type, external_contact_id, contact_group_id')
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
    getCompanyOwnerCodes(membership.company_id),
    getReferenceLists(membership.company_id)
  ]);

  if (!rawItem) notFound();

  const item = mapComplianceItem(rawItem);
  const isOwner = membership.role === 'owner';
  const mappedOwnerCodes = ownerCodes.filter((owner) => owner.is_assigned_to_current_user).map((owner) => owner.code);
  const isAssignedOfficeUser = (
    membership.role === 'office_user'
    && itemHasAnyOwnerCode(item, mappedOwnerCodes)
  );
  const canManageItem = isOwner || isAssignedOfficeUser;
  const canEditCore = canManageItem;
  const rolledForwardHref = searchParams?.completed === '1' && searchParams.nextItem ? `/items/${searchParams.nextItem}` : undefined;

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
          agencyOptions={referenceLists.agencies.map((agency) => ({ id: agency.id, name: agency.name }))}
          referenceContacts={referenceLists.contacts}
          referenceContactGroups={referenceLists.groups}
          canUpdateStatus={canManageItem}
          canCompleteItem={canManageItem}
          canEditCore={canEditCore}
          canManageReminders={canEditCore}
          rolledForwardHref={rolledForwardHref}
          backHref="/"
          backLabel="Back to work queue"
          itemPathPrefix="/items"
          referenceListHref="/settings/lists"
        />
      </main>
    </div>
  );
}
