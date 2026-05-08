import { redirect } from 'next/navigation';
import { WorkspaceSetup } from '@/components/workspace-setup';
import { createClient } from '@/lib/supabase/server';

export default async function VesselSetupPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  return <WorkspaceSetup step="vessels" email={userData.user.email} />;
}
