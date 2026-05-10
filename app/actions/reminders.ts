'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { todayIso } from '@/lib/compliance';
import { createClient } from '@/lib/supabase/server';

export async function queueTodaysReminders() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || !['owner', 'office_admin', 'office_user'].includes(membership.role)) redirect('/');

  const { error } = await supabase.rpc('schedule_due_reminders', { target_run_date: todayIso() });

  if (error) throw new Error(error.message);

  revalidatePath('/reminders');
}
