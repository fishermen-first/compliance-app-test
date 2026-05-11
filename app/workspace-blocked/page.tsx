import { redirect } from 'next/navigation';
import { WorkspaceBlockedScreen } from '@/components/workspace-blocked-screen';
import { createClient } from '@/lib/supabase/server';

export default async function WorkspaceBlockedPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect('/login');
  }

  return <WorkspaceBlockedScreen email={data.user.email} />;
}
