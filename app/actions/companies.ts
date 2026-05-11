'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function customerConsolePath(companyId: string, message?: string) {
  const query = message ? `?message=${encodeURIComponent(message)}` : '';
  return `/admin/customers/${companyId}/overview${query}`;
}

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();

  if (!value) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

export async function createCompany(formData: FormData) {
  const name = requiredString(formData, 'companyName');
  const timezone = String(formData.get('timezone') ?? '').trim() || 'America/Los_Angeles';
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) {
    redirect('/');
  }

  const { data: existing, error: existingError } = await admin
    .from('companies')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    redirect(customerConsolePath(existing.id, `${existing.name} already exists.`));
  }

  const { data: company, error } = await admin
    .from('companies')
    .insert({ name, timezone })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin');
  redirect(customerConsolePath(company.id, 'Workspace created. Import the compliance workbook next.'));
}
