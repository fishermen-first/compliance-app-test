import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { CombinedDashboard, type DashboardMember, type DashboardTask } from '@/components/combined-dashboard';
import { NoAccessScreen } from '@/components/no-access-screen';
import { WorkspaceBlockedScreen } from '@/components/workspace-blocked-screen';
import { isWorkQueueItem, itemHasAnyOwnerCode } from '@/lib/compliance';
import { getCompanyOwnerCodes, getCustomerItems } from '@/lib/customer-data';
import { accessRoleLabel, isCustomerOwnerRole } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type HomeProps = { searchParams?: { message?: string; owner?: string } };

function greetingFor(timeZone: string | null | undefined) {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: timeZone || 'America/Los_Angeles' }).format(new Date()));
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  } catch {
    return 'Welcome back';
  }
}

export default async function Home({ searchParams }: HomeProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    const params = new URLSearchParams();
    if (searchParams?.message) params.set('message', searchParams.message);
    redirect(params.size ? `/login?${params}` : '/login');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');
  if (isAppAdmin) redirect('/admin');

  const { data: memberships } = await supabase.from('company_memberships').select('company_id, role').eq('user_id', userData.user.id).order('created_at', { ascending: true });
  if (!memberships || memberships.length === 0) {
    const { data: acceptedCompanyId, error: acceptError } = await supabase.rpc('accept_company_invite', {});
    if (acceptError?.message.includes('MULTI_COMPANY_MEMBERSHIP_BLOCKED')) return <WorkspaceBlockedScreen email={userData.user.email} />;
    if (acceptError) return <NoAccessScreen email={userData.user.email} />;
    if (acceptedCompanyId) redirect('/');
    return <NoAccessScreen email={userData.user.email} />;
  }
  if (memberships.length > 1) return <WorkspaceBlockedScreen email={userData.user.email} />;

  const membership = memberships[0];
  const [{ data: company }, { data: profile }, allItems, ownerCodes] = await Promise.all([
    supabase.from('companies').select('name, timezone').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name, email').eq('id', userData.user.id).maybeSingle(),
    getCustomerItems(membership.company_id),
    getCompanyOwnerCodes(membership.company_id)
  ]);

  const isCustomerOwner = isCustomerOwnerRole(membership.role);
  const canViewEveryone = isCustomerOwner || membership.role === 'office_admin';
  const mappedOwnerCodes = ownerCodes.filter((owner) => owner.is_assigned_to_current_user).map((owner) => owner.code);
  const showEveryone = canViewEveryone && (searchParams?.owner === 'all' || (!searchParams?.owner && mappedOwnerCodes.length === 0));
  const complianceItems = showEveryone
    ? allItems
    : mappedOwnerCodes.length
      ? allItems.filter((item) => itemHasAnyOwnerCode(item, mappedOwnerCodes))
      : [];

  let taskQuery = (supabase as any)
    .from('workspace_tasks')
    .select('id, title, details, assigned_to, status, priority, due_date, completed_at, archived_at, created_at')
    .eq('company_id', membership.company_id)
    .is('archived_at', null);
  if (!showEveryone) taskQuery = taskQuery.eq('assigned_to', userData.user.id);

  const [{ data: taskRows, error: taskError }, memberResult] = await Promise.all([
    taskQuery.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }),
    canViewEveryone
      ? supabase.rpc('get_workspace_task_members', { target_company_id: membership.company_id })
      : Promise.resolve({ data: [{ user_id: userData.user.id, full_name: profile?.full_name ?? null, email: profile?.email ?? userData.user.email ?? null }], error: null })
  ]);
  if (taskError) throw new Error(taskError.message);
  if (memberResult.error) throw new Error(memberResult.error.message);

  const tasks = (taskRows ?? []) as DashboardTask[];
  const members = (memberResult.data ?? []) as DashboardMember[];
  const attentionCount = tasks.filter((task) => task.status === 'open').length + complianceItems.filter(isWorkQueueItem).length;
  const currentUserName = profile?.full_name ?? userData.user.email ?? 'User';

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={currentUserName}
        userEmail={userData.user.email}
        dueCount={attentionCount}
        dueLabel="things needing attention"
      />
      <CombinedDashboard
        greeting={greetingFor(company?.timezone)}
        currentUserId={userData.user.id}
        currentUserName={currentUserName}
        complianceItems={complianceItems}
        tasks={tasks}
        members={members}
        canViewEveryone={canViewEveryone}
        showEveryone={showEveryone}
      />
    </div>
  );
}
