import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { NoAccessScreen } from '@/components/no-access-screen';
import { ReferenceListsPanel } from '@/components/reference-lists/reference-lists-panel';
import { WorkspaceBlockedScreen } from '@/components/workspace-blocked-screen';
import { accessRoleLabel, isActiveCustomerRole } from '@/lib/roles';
import { getReferenceLists } from '@/lib/reference-lists';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

type AppRole = Database['public']['Enums']['app_role'];

type SettingsListsProps = {
  searchParams?: { message?: string };
};

type CompanyRelation = {
  id: string;
  name: string;
  timezone: string | null;
};

type MembershipContextRow = {
  company_id: string;
  role: AppRole;
  companies?: CompanyRelation | CompanyRelation[] | null;
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SettingsListsPage({ searchParams }: SettingsListsProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (isAppAdmin) {
    redirect('/admin');
  }

  const [membershipsResult, profileResult] = await Promise.all([
    supabase
      .from('company_memberships')
      .select('company_id, role, companies(id, name, timezone)')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('full_name').eq('id', userData.user.id).maybeSingle()
  ]);

  if (membershipsResult.error || !membershipsResult.data || membershipsResult.data.length === 0) {
    return <NoAccessScreen email={userData.user.email} />;
  }

  const memberships = membershipsResult.data as unknown as MembershipContextRow[];

  if (memberships.length > 1) {
    return <WorkspaceBlockedScreen email={userData.user.email} />;
  }

  const membership = memberships[0];
  const company = relation(membership.companies);

  if (!isActiveCustomerRole(membership.role)) {
    return (
      <div className="app-shell">
        <AppSidebar
          companyName={company?.name ?? 'FF Compliance'}
          userRole={accessRoleLabel(membership.role)}
          userName={profileResult.data?.full_name ?? userData.user.email}
          userEmail={userData.user.email}
          activePath="/settings"
        />
        <main className="settings-setup-page">
          <section className="degraded-block">
            <strong>Workspace editor access required.</strong>
            <p>Ask a workspace owner or FF Admin to review reference lists.</p>
          </section>
        </main>
      </div>
    );
  }

  const referenceLists = await getReferenceLists(membership.company_id);

  return (
    <div className="app-shell">
      <AppSidebar
        companyName={company?.name ?? 'FF Compliance'}
        userRole={accessRoleLabel(membership.role)}
        userName={profileResult.data?.full_name ?? userData.user.email}
        userEmail={userData.user.email}
        activePath="/settings"
      />
      <main className="settings-setup-page">
        <header className="page-header">
          <p className="eyebrow">Settings</p>
          <h1>Reference lists</h1>
          <p className="page-intro">Manage the canonical agencies, vessels, contacts, and groups used by imports and reminders.</p>
        </header>
        <ReferenceListsPanel data={referenceLists} redirectTo="/settings/lists" message={searchParams?.message} />
      </main>
    </div>
  );
}
