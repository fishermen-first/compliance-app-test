import { redirect } from 'next/navigation';
import { WorkspaceSetup } from '@/components/workspace-setup';
import { createClient } from '@/lib/supabase/server';

export default async function VesselSetupPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('role')
    .eq('user_id', userData.user.id)
    .in('role', ['owner', 'office_admin'])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect('/');
  }

  return <WorkspaceSetup step="vessels" email={userData.user.email} />;
}
