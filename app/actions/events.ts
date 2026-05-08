'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function optionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export async function createComplianceEvent(formData: FormData) {
  const title = requiredString(formData, 'title');
  const dueDate = requiredString(formData, 'dueDate');
  const vesselId = optionalString(formData, 'vesselId');
  const category = requiredString(formData, 'category');
  const priority = requiredString(formData, 'priority');
  const status = requiredString(formData, 'status');
  const sharepointUrl = optionalString(formData, 'sharepointUrl');
  const notes = optionalString(formData, 'notes');
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect('/');
  }

  const { error } = await supabase.rpc('create_compliance_event', {
    event_title: title,
    event_due_at: new Date(`${dueDate}T12:00:00`).toISOString(),
    event_vessel_id: vesselId,
    event_category: category,
    event_priority: priority,
    event_status: status,
    event_sharepoint_url: sharepointUrl,
    event_notes: notes
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/');
  redirect('/');
}
