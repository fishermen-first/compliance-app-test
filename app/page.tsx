import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { CombinedDashboard } from '@/components/combined-dashboard';
import { NoAccessScreen } from '@/components/no-access-screen';
import { WorkspaceBlockedScreen } from '@/components/workspace-blocked-screen';
import { isWorkQueueItem, workspaceToday } from '@/lib/compliance';
import { getWorkspaceWork } from '@/lib/workspace-work';
import { accessRoleLabel } from '@/lib/roles';
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
  const [{ data: company }, { data: profile }] = await Promise.all([
    supabase.from('companies').select('name, timezone').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name, email').eq('id', userData.user.id).maybeSingle()
  ]);

  const { complianceItems, tasks, members, ownerCodes, canViewEveryone, showEveryone, manageableItemIds } = await getWorkspaceWork({
    companyId: membership.company_id, userId: userData.user.id, role: membership.role,
    requestedOwner: searchParams?.owner, fullName: profile?.full_name, email: profile?.email ?? userData.user.email
  });
  const today = workspaceToday(company?.timezone || 'America/Los_Angeles');
  const attentionCount = tasks.filter((task) => task.status === 'open').length + complianceItems.filter((item) => isWorkQueueItem(item, today)).length;
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
        manageableItemIds={manageableItemIds}
        greeting={greetingFor(company?.timezone)}
        currentUserId={userData.user.id}
        currentUserName={currentUserName}
        complianceItems={complianceItems}
        tasks={tasks}
        members={members}
        ownerNames={Object.fromEntries(ownerCodes.map((owner) => [owner.code, owner.display_name ?? owner.code]))}
        canViewEveryone={canViewEveryone}
        showEveryone={showEveryone}
        timeZone={company?.timezone || 'America/Los_Angeles'}
      />
    </div>
  );
}
