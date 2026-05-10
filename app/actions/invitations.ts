'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const companyRoles = ['owner', 'office_admin', 'office_user'] as const;
const allowedRoles = ['app_admin', ...companyRoles] as const;

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

async function provisionAuthUser(email: string) {
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true
  });

  if (!error) {
    return 'created';
  }

  if (isExistingAuthUserError(error.message)) {
    return 'existing';
  }

  throw new Error(`Invitation saved, but Supabase could not provision the auth user: ${error.message}`);
}

export async function createInvitation(formData: FormData) {
  const companyId = String(formData.get('companyId') ?? '').trim();
  const email = requiredString(formData, 'email').toLowerCase();
  const role = requiredString(formData, 'role');
  const supabase = createClient();
  const supabaseAdmin = createAdminClient();

  if (!allowedRoles.includes(role as (typeof allowedRoles)[number])) {
    redirect('/admin?message=Choose%20a%20valid%20role.');
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) {
    throw new Error('Only FF admins can invite demo users right now.');
  }

  if (role === 'app_admin') {
    const { error } = await supabaseAdmin
      .from('app_admins')
      .upsert({ email }, { onConflict: 'email' });

    if (error) {
      throw new Error(error.message);
    }

    const authUserStatus = await provisionAuthUser(email);

    revalidatePath('/admin');
    const message =
      authUserStatus === 'created'
        ? 'FF admin created. User can request a login link.'
        : 'FF admin saved. Existing user can request a login link.';
    redirect(`/admin?message=${encodeURIComponent(message)}`);
  }

  if (!companyId) {
    redirect('/admin?message=Choose%20a%20company%20for%20company%20roles.');
  }

  const { error } = await supabaseAdmin
    .from('company_invitations')
    .upsert(
      {
        company_id: companyId,
        email,
        role: role as (typeof companyRoles)[number],
        accepted_at: null
      },
      { onConflict: 'company_id,email' }
    );

  if (error) {
    throw new Error(error.message);
  }

  const authUserStatus = await provisionAuthUser(email);

  revalidatePath('/admin');
  const message =
    authUserStatus === 'created'
      ? 'Invitation saved. User can request a login link.'
      : 'Invitation saved. Existing user can request a login link.';
  redirect(`/admin?message=${encodeURIComponent(message)}`);
}
