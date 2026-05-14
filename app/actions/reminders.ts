'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { todayIso } from '@/lib/compliance';
import { sendQueuedRemindersForCompany } from '@/lib/reminder-sender';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function requireReminderAccess() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || membership.role !== 'owner') redirect('/');

  return { supabase, membership };
}

export async function queueTodaysReminders() {
  const { supabase, membership } = await requireReminderAccess();

  const { error } = await supabase.rpc('schedule_due_reminders', {
    target_company_id: membership.company_id,
    target_run_date: todayIso()
  });

  if (error) throw new Error(error.message);

  revalidatePath('/reminders');
}

export async function queueCompanyReminders(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) redirect('/');

  const admin = createAdminClient();
  const { error } = await admin.rpc('schedule_due_reminders', {
    target_company_id: companyId,
    target_run_date: todayIso()
  });

  if (error) throw new Error(error.message);

  revalidatePath('/reminders');
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}/diagnostics`);
  revalidatePath(`/admin/customers/${companyId}/overview`);
}

export async function sendQueuedReminders() {
  const { membership } = await requireReminderAccess();
  await sendQueuedRemindersForCompany(membership.company_id);

  revalidatePath('/reminders');
}
