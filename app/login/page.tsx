import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/auth-screen';
import { createClient } from '@/lib/supabase/server';

type LoginProps = {
  searchParams?: { message?: string };
};

export default async function LoginPage({ searchParams }: LoginProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  // Already signed in — send them into the app.
  if (userData.user) {
    redirect('/');
  }

  return <AuthScreen message={searchParams?.message} />;
}
