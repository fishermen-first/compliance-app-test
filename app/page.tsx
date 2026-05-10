import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { AuthScreen } from '@/components/auth-screen';
import { Dashboard } from '@/components/dashboard';
import { NoAccessScreen } from '@/components/no-access-screen';
import { getCompanyOwnerCodes, getCustomerItems } from '@/lib/customer-data';
import { accessRoleLabel } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';

type HomeProps = {
  searchParams?: { message?: string; owner?: string };
};

export default async function Home({ searchParams }: HomeProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return <AuthScreen message={searchParams?.message} />;
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (isAppAdmin) {
    redirect('/admin');
  }

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    const { data: acceptedCompanyId } = await supabase.rpc('accept_company_invite', { full_name: userData.user.email?.split('@')[0] ?? 'User' });

    if (acceptedCompanyId) {
      redirect('/');
    }

    return <NoAccessScreen email={userData.user.email} />;
  }

  const [{ data: company }, { data: profile }, items, ownerCodes] = await Promise.all([
    supabase.from('companies').select('name').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle(),
    getCustomerItems(membership.company_id),
    getCompanyOwnerCodes(membership.company_id)
  ]);

  const currentUserName = profile?.full_name ?? userData.user.email ?? 'User';
  const requestedOwner = searchParams?.owner;
  const mappedOwnerCodes = ownerCodes.filter((owner) => owner.user_id === userData.user?.id).map((owner) => owner.code);
  const requestedOwnerCode = requestedOwner && requestedOwner !== 'all' ? decodeURIComponent(requestedOwner) : null;
  const validOwnerCodes = new Set([
    ...ownerCodes.map((owner) => owner.code),
    ...items.map((item) => item.owner_current).filter(Boolean) as string[]
  ]);
  const showAllOwners = requestedOwner === 'all' || (!requestedOwner && mappedOwnerCodes.length === 0);
  const selectedOwnerCodes = requestedOwnerCode && validOwnerCodes.has(requestedOwnerCode)
    ? [requestedOwnerCode]
    : showAllOwners
      ? []
      : mappedOwnerCodes;
  const canCreateItems = ['owner', 'office_admin', 'office_user'].includes(membership.role);

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} />
      <Dashboard
        companyName={company?.name ?? 'FF Compliance'}
        items={items}
        currentUserName={currentUserName}
        currentUserRole={membership.role}
        selectedOwnerCodes={selectedOwnerCodes}
        showAllOwners={showAllOwners}
        hasOwnerMapping={mappedOwnerCodes.length > 0}
        ownerCodes={ownerCodes}
        canCreateItems={canCreateItems}
      />
    </div>
  );
}
