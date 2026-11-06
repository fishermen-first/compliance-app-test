import { AppSidebar } from '@/components/app-sidebar';
import { CombinedDashboard } from '@/components/combined-dashboard';
import { isWorkQueueItem, workspaceToday } from '@/lib/compliance';
import { getCustomerContext } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';
import { getWorkspaceWork } from '@/lib/workspace-work';

type Props = { searchParams?: { owner?: string; view?: string; q?: string; page?: string } };

export default async function WorkPage({ searchParams }: Props) {
  const { user, membership, company, profile } = await getCustomerContext();
  const view = ['snoozed', 'archived', 'awaiting'].includes(searchParams?.view ?? '') ? searchParams!.view! : 'active';
  const work = await getWorkspaceWork({ companyId: membership.company_id, userId: user.id, role: membership.role,
    requestedOwner: searchParams?.owner, includeArchived: view === 'archived', fullName: profile?.full_name, email: profile?.email ?? user.email });
  const today = workspaceToday(company?.timezone || 'America/Los_Angeles');
  const count = work.tasks.filter((task) => task.status === 'open').length + work.complianceItems.filter((item) => isWorkQueueItem(item, today)).length;
  const userName = profile?.full_name ?? user.email ?? 'User';
  return <div className="app-shell">
    <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} userName={userName} userEmail={user.email} dueCount={count} dueLabel="things needing attention" activePath="/work" />
    <CombinedDashboard greeting="" currentUserId={user.id} currentUserName={userName} {...work}
      ownerNames={Object.fromEntries(work.ownerCodes.map((owner) => [owner.code, owner.display_name ?? owner.code]))}
      timeZone={company?.timezone || 'America/Los_Angeles'} fullQueue queueView={view} query={searchParams?.q ?? ''} page={Math.max(1, Number(searchParams?.page) || 1)} />
  </div>;
}
