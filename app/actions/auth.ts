'use server';

import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    redirect('/?message=Enter%20an%20email%20address');
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${env.appBaseUrl}/auth/callback`,
      shouldCreateUser: false
    }
  });

  if (error) {
    redirect('/?message=This%20email%20is%20not%20invited%20yet.%20Ask%20an%20FF%20admin%20to%20add%20you%20first.');
  }

  redirect('/?message=Check%20your%20email%20for%20the%20login%20link');
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/');
}
