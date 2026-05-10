'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  if (!value) throw new Error(`Missing required field: ${name}`);
  return value;
}

function optionalEmail(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim().toLowerCase();
  return value || null;
}

function optionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function safeRedirectPath(value: FormDataEntryValue | null) {
  const path = String(value ?? '').trim();
  if (path === '/settings') return path;
  if (/^\/admin\/companies\/[0-9a-f-]+$/i.test(path)) return path;
  return '/settings';
}

async function requireOwnerCodeAdmin(companyId: string) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');
  if (isAppAdmin) return;

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || !['owner', 'office_admin'].includes(membership.role)) {
    redirect('/');
  }
}

export async function saveOwnerCodeMapping(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const code = requiredString(formData, 'code');
  const personName = optionalString(formData, 'personName') ?? optionalString(formData, 'displayName');
  const loginEmail = optionalEmail(formData, 'loginEmail') ?? optionalEmail(formData, 'assignmentEmail');
  const redirectTo = safeRedirectPath(formData.get('redirectTo'));

  await requireOwnerCodeAdmin(companyId);

  const admin = createAdminClient();
  let userId: string | null = null;
  let pendingEmail: string | null = null;

  if (loginEmail) {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('email', loginEmail)
      .limit(1)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    if (profile?.id) {
      const { data: membership, error: membershipError } = await admin
        .from('company_memberships')
        .select('id')
        .eq('company_id', companyId)
        .eq('user_id', profile.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw new Error(membershipError.message);

      if (membership) {
        userId = profile.id;
      } else {
        pendingEmail = loginEmail;
      }
    } else {
      pendingEmail = loginEmail;
    }
  }

  const { error } = await admin
    .from('company_owner_codes')
    .upsert(
      {
        company_id: companyId,
        code,
        display_name: personName,
        user_id: userId,
        pending_email: pendingEmail,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id,code' }
    );

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath('/admin');
  revalidatePath(`/admin/companies/${companyId}`);
  redirect(redirectTo);
}
