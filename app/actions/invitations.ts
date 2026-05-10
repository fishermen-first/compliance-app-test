'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const allowedRoles = ['owner', 'office_admin', 'office_user'] as const;

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();

  if (!value) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
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

  revalidatePath('/admin');
  redirect('/admin?message=Invitation saved');
}
