import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, LogOut } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { ComplianceItemDetail } from '@/components/compliance-item-detail';
import { mapComplianceItem } from '@/lib/customer-data';
import { createClient } from '@/lib/supabase/server';

type AdminItemDetailPageProps = {
  params: { id: string; itemId: string };
};

export default async function AdminItemDetailPage({ params }: AdminItemDetailPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) redirect('/');

  const companyId = params.id;
  const itemId = params.itemId;

  const [{ data: company }, { data: rawItem }, { data: history }, { data: reminderRules }, { data: recipients }, { data: reminderLogs }, { data: vessels }] = await Promise.all([
    supabase.from('companies').select('id, name, timezone').eq('id', companyId).maybeSingle(),
    supabase
      .from('compliance_items')
      .select('*, vessels(name)')
      .eq('company_id', companyId)
      .eq('id', itemId)
      .maybeSingle(),
    supabase
      .from('compliance_item_status_history')
      .select('from_status, to_status, notes, changed_at, profiles(full_name, email)')
      .eq('company_id', companyId)
      .eq('item_id', itemId)
      .order('changed_at', { ascending: false }),
    supabase
      .from('compliance_item_reminder_rules')
      .select('label, trigger_type, days_before, repeat_every_days, active')
      .eq('company_id', companyId)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true }),
    supabase
      .from('compliance_item_notification_recipients')
      .select('recipient_name, recipient_email, recipient_type')
      .eq('company_id', companyId)
      .eq('item_id', itemId)
      .order('created_at', { ascending: true }),
    supabase
      .from('reminder_send_log')
      .select('recipient_email, status, scheduled_for, sent_at, failure_reason')
      .eq('company_id', companyId)
      .eq('item_id', itemId)
      .order('scheduled_for', { ascending: false })
      .limit(5),
    supabase
      .from('vessels')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('name')
  ]);

  if (!company || !rawItem) notFound();

  return (
    <main className="admin-console admin-detail-console">
      <aside className="admin-rail">
        <Link className="admin-back-link" href={`/admin/customers/${companyId}/users`}>
          <ArrowLeft aria-hidden="true" />
          Customer users
        </Link>
        <div className="admin-rail-footer">
          <span>Workspace</span>
          <strong>{company.name}</strong>
          <form action={signOut}>
            <button className="admin-logout" type="submit"><LogOut aria-hidden="true" /> Log out</button>
          </form>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar admin-setup-topbar">
          <div>
            <p className="eyebrow">FF Admin item review</p>
            <h1>{company.name}</h1>
          </div>
          <span className="admin-subtle-pill">{company.timezone}</span>
        </header>

        <ComplianceItemDetail
          item={mapComplianceItem(rawItem)}
          history={(history ?? []) as any}
          reminderRules={reminderRules ?? []}
          recipients={recipients ?? []}
          reminderLogs={reminderLogs ?? []}
          vessels={vessels ?? []}
          canUpdateStatus
          canCompleteItem
          canEditCore
          canManageReminders
          backHref={`/admin/customers/${companyId}/users`}
          backLabel="Back to customer users"
          itemPathPrefix={`/admin/companies/${companyId}/items`}
        />
      </section>
    </main>
  );
}
