'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { inferRecurrence, parseOwnerCurrent } from '@/lib/compliance';
import { createClient } from '@/lib/supabase/server';

function optionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function requiredString(formData: FormData, name: string) {
  const value = optionalString(formData, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function requireMembership() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || !['owner', 'office_admin', 'office_user'].includes(membership.role)) {
    redirect('/');
  }

  return { supabase, membership };
}

export async function createComplianceItem(formData: FormData) {
  const { supabase, membership } = await requireMembership();
  const ownerRaw = optionalString(formData, 'ownerRaw');
  const frequencyLabel = optionalString(formData, 'frequencyLabel');
  const recurrence = inferRecurrence(frequencyLabel);

  const { data: itemId, error } = await supabase.rpc('create_compliance_item', {
    target_company_id: membership.company_id,
    target_vessel_id: optionalString(formData, 'vesselId'),
    item_owner_raw: ownerRaw,
    item_owner_current: optionalString(formData, 'ownerCurrent') ?? parseOwnerCurrent(ownerRaw),
    item_name: requiredString(formData, 'itemName'),
    item_number: optionalString(formData, 'itemNumber'),
    item_agency_type: optionalString(formData, 'agencyType'),
    item_compliance_area: requiredString(formData, 'complianceArea'),
    item_frequency_label: frequencyLabel,
    item_recurrence_unit: recurrence.recurrence_unit,
    item_recurrence_interval: recurrence.recurrence_interval,
    item_start_working_on: optionalString(formData, 'startWorkingOn'),
    item_expiration_date: optionalString(formData, 'expirationDate'),
    item_status_notes: optionalString(formData, 'statusNotes'),
    item_instructions: optionalString(formData, 'instructions'),
    item_sharepoint_url: optionalString(formData, 'sharepointUrl')
  });

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/items');
  redirect(`/items/${itemId}`);
}

export async function updateComplianceItemStatus(formData: FormData) {
  const itemId = requiredString(formData, 'itemId');
  const status = requiredString(formData, 'status');
  const notes = optionalString(formData, 'notes');
  const { supabase } = await requireMembership();

  const { error } = await supabase.rpc('update_compliance_item_status', {
    target_item_id: itemId,
    next_status: status,
    next_notes: notes
  });

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/items');
  revalidatePath(`/items/${itemId}`);
}

export async function completeComplianceItem(formData: FormData) {
  const itemId = requiredString(formData, 'itemId');
  const { supabase } = await requireMembership();
  const shouldCreateNext = formData.get('createNext') === 'on';

  const { data: newItemId, error } = await supabase.rpc('complete_compliance_item', {
    target_item_id: itemId,
    completion_date: requiredString(formData, 'completionDate'),
    final_notes: optionalString(formData, 'finalNotes'),
    should_create_next: shouldCreateNext,
    next_start_working_on: optionalString(formData, 'nextStartWorkingOn'),
    next_expiration_date: optionalString(formData, 'nextExpirationDate')
  });

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/items');
  revalidatePath(`/items/${itemId}`);

  if (newItemId) redirect(`/items/${newItemId}`);
  redirect(`/items/${itemId}`);
}
