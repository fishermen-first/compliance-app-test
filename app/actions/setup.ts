'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function getRequiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();

  if (!value) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

export async function createWorkspace(formData: FormData) {
  const companyName = getRequiredString(formData, 'companyName');
  const fullName = getRequiredString(formData, 'fullName');
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect('/');
  }

  const { error } = await supabase.rpc('create_company_workspace', {
    company_name: companyName,
    full_name: fullName
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
  redirect('/setup/vessels');
}

export async function saveVessels(formData: FormData) {
  const vesselNames = ['vessel1', 'vessel2', 'vessel3']
    .map((field) => String(formData.get(field) ?? '').trim())
    .filter(Boolean);

  if (vesselNames.length === 0) {
    throw new Error('Add at least one vessel.');
  }

  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect('/');
  }

  const { error } = await supabase.rpc('save_initial_vessels', {
    vessel_names: vesselNames
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
  redirect('/');
}
