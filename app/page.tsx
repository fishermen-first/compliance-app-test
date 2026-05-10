import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { AuthScreen } from '@/components/auth-screen';
import { Dashboard } from '@/components/dashboard';
import { NoAccessScreen } from '@/components/no-access-screen';
import { getCustomerItems, ownerCodeForUser } from '@/lib/customer-data';
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

  const [{ data: company }, { data: profile }, items] = await Promise.all([
    supabase.from('companies').select('name').eq('id', membership.company_id).single(),
    supabase.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle(),
    getCustomerItems(membership.company_id)
  ]);

  const currentUserName = profile?.full_name ?? userData.user.email ?? 'User';
  const userOwnerCode = ownerCodeForUser(currentUserName, userData.user.email);
  const requestedOwner = searchParams?.owner;
  const showAllOwners = requestedOwner === 'all' || (!requestedOwner && !userOwnerCode);
  const currentOwnerCode = requestedOwner && requestedOwner !== 'all' ? requestedOwner : userOwnerCode;
  const canCreateItems = ['owner', 'office_admin', 'office_user'].includes(membership.role);

  return (
    <div className="app-shell">
      <AppSidebar companyName={company?.name ?? 'FF Compliance'} userRole={accessRoleLabel(membership.role)} />
      <Dashboard
        companyName={company?.name ?? 'FF Compliance'}
        items={items}
        currentUserName={currentUserName}
        currentUserRole={membership.role}
        currentOwnerCode={currentOwnerCode}
        showAllOwners={showAllOwners}
        canCreateItems={canCreateItems}
      />
    </div>
  );
}
