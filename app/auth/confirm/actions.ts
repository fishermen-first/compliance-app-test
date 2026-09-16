'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { parseConfirmation, safeNext } from '@/lib/auth-confirm';

export async function confirmSignIn(form: FormData) {
  const confirmation = parseConfirmation(form.get('token_hash'), form.get('type'));
  if (!confirmation) redirect('/auth/confirm?error=invalid');

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp(confirmation);
  if (error) {
    // Never log the URL, token, email, or raw provider error message.
    console.warn('auth.confirm_failed', { code: error.code, status: error.status });
    redirect(`/auth/confirm?error=${error.code === 'otp_expired' ? 'invalid' : 'unavailable'}`);
  }
  const { error: inviteError } = await supabase.rpc('accept_company_invite', {});
  if (inviteError) {
    console.error('auth.invite_accept_failed', { code: inviteError.code });
    redirect('/auth/confirm?error=workspace');
  }
  redirect(safeNext(form.get('next')));
}
