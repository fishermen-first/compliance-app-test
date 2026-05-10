'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const allowedRoles = ['owner', 'office_admin', 'office_user'] as const;

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();

  if (!value) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

function isExistingAuthUserError(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes('already') && (normalized.includes('registered') || normalized.includes('exists'));
}

async function sendAuthInvite(email: string) {
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.appBaseUrl}/auth/callback`
  });

  if (!error) {
    return 'sent';
  }

  if (isExistingAuthUserError(error.message)) {
    return 'existing';
  }

  throw new Error(`Invitation saved, but Supabase could not send the auth invite: ${error.message}`);
}

export async function createInvitation(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const email = requiredString(formData, 'email').toLowerCase();
  const role = requiredString(formData, 'role');
  const supabase = createClient();

  if (!allowedRoles.includes(role as (typeof allowedRoles)[number])) {
    throw new Error('Invalid role');
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) {
    throw new Error('Only FF admins can invite demo users right now.');
  }

  const { error } = await supabase
    .from('company_invitations')
    .upsert(
      {
        company_id: companyId,
        email,
        role,
        accepted_at: null
      },
      { onConflict: 'company_id,email' }
    );

  if (error) {
    throw new Error(error.message);
  }

  const authInviteStatus = await sendAuthInvite(email);

  revalidatePath('/admin');
  const message =
    authInviteStatus === 'sent'
      ? 'Invitation saved and login email sent'
      : 'Invitation saved. Existing user can request a login link.';
  redirect(`/admin?message=${encodeURIComponent(message)}`);
}
