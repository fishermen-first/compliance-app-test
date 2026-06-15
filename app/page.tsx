import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { Dashboard, type DashboardFilters } from '@/components/dashboard';
import { NoAccessScreen } from '@/components/no-access-screen';
import { WorkspaceBlockedScreen } from '@/components/workspace-blocked-screen';
import { displayState, itemIsOverdue } from '@/lib/compliance';
import { getCompanyOwnerCodes, getCustomerItems } from '@/lib/customer-data';
import { accessRoleLabel, canCreateComplianceItems, isCustomerOwnerRole } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type HomeProps = {
  searchParams?: { message?: string; owner?: string; status?: string; type?: string; vessel?: string; frequency?: string; sort?: string; dir?: string; columns?: string };
};

function filterValue(value?: string) {
  return value?.trim() || undefined;
}

export default async function Home({ searchParams }: HomeProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    const params = new URLSearchParams();
    if (searchParams?.message) params.set('message', searchParams.message);
    const qs = params.toString();
    redirect(qs ? `/login?${qs}` : '/login');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (isAppAdmin) {
    redirect('/admin');
  }

  const { data: memberships } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: true });

  if (!memberships || memberships.length === 0) {
    const { data: acceptedCompanyId, error: acceptError } = await supabase.rpc('accept_company_invite', {});

    if (acceptError?.message.includes('MULTI_COMPANY_MEMBERSHIP_BLOCKED')) {
      return <WorkspaceBlockedScreen email={userData.user.email} />;
    }

    if (acceptError) {
      return <NoAccessScreen email={userData.user.email} />;
    }

    if (acceptedCompanyId) {
      redirect('/');
    }

    return <NoAccessScreen email={userData.user.email} />;
  }

  if (memberships.length > 1) {
    return <WorkspaceBlockedScreen email={userData.user.email} />;
  }

  const membership = memberships[0];

  const [{ data: company }, { data: profile }, items, ownerCodes] = await Promise.all([
    supabase.from('companies').select('name').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle(),
    getCustomerItems(membership.company_id),
    getCompanyOwnerCodes(membership.company_id)
  ]);

  const currentUserName = profile?.full_name ?? userData.user.email ?? 'User';
  const requestedOwner = searchParams?.owner;
  const mappedOwnerCodes = ownerCodes.filter((owner) => owner.is_assigned_to_current_user).map((owner) => owner.code);
  const isCustomerOwner = isCustomerOwnerRole(membership.role);
  const requestedOwnerCode = requestedOwner && requestedOwner !== 'all' ? decodeURIComponent(requestedOwner) : null;
  const validOwnerCodes = new Set([
    ...ownerCodes.map((owner) => owner.code),
    ...items.map((item) => item.owner_current).filter(Boolean) as string[]
  ]);
  const requestedOwnerAllowed = Boolean(
    requestedOwnerCode
    && validOwnerCodes.has(requestedOwnerCode)
    && (isCustomerOwner || mappedOwnerCodes.includes(requestedOwnerCode))
  );
  const showAllOwners = isCustomerOwner && (requestedOwner === 'all' || (!requestedOwner && mappedOwnerCodes.length === 0));
  const selectedOwnerCodes = requestedOwnerAllowed && requestedOwnerCode
    ? [requestedOwnerCode]
    : showAllOwners
      ? []
      : mappedOwnerCodes;
  const canCreateItems = canCreateComplianceItems(membership.role);
  const validOwnerFilter = requestedOwner === 'all' && isCustomerOwner
    ? 'all'
    : requestedOwnerAllowed && requestedOwnerCode
      ? requestedOwnerCode
      : undefined;
  const ownerFilterCodes = isCustomerOwner
    ? Array.from(validOwnerCodes).sort((a, b) => a.localeCompare(b))
    : mappedOwnerCodes;
  const sidebarDueCount = items.filter((item) => {
    if (['complete', 'discontinued'].includes(item.status)) return false;
    if (!showAllOwners && selectedOwnerCodes.length > 0 && (!item.owner_current || !selectedOwnerCodes.includes(item.owner_current))) return false;
    if (!showAllOwners && selectedOwnerCodes.length === 0) return false;
    return displayState(item) === 'Due' || itemIsOverdue(item);
  }).length;
  const filters: DashboardFilters = {
    owner: filterValue(validOwnerFilter),
    status: filterValue(searchParams?.status),
    type: filterValue(searchParams?.type),
    vessel: filterValue(searchParams?.vessel),
    frequency: filterValue(searchParams?.frequency),
    sort: filterValue(searchParams?.sort),
    dir: filterValue(searchParams?.dir),
    columns: filterValue(searchParams?.columns)
  };

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={currentUserName}
        userEmail={userData.user.email}
        dueCount={sidebarDueCount}
      />
      <Dashboard
        companyName={company?.name ?? 'FF Compliance'}
        items={items}
        currentUserName={currentUserName}
        currentUserRole={membership.role}
        selectedOwnerCodes={selectedOwnerCodes}
        showAllOwners={showAllOwners}
        hasOwnerMapping={mappedOwnerCodes.length > 0}
        ownerFilterCodes={ownerFilterCodes}
        canCreateItems={canCreateItems}
        filters={filters}
      />
    </div>
  );
}
