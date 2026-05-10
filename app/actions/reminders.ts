'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { todayIso } from '@/lib/compliance';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const senderEmail = process.env.RESEND_FROM_EMAIL ?? 'FF Compliance <alerts@fishermenfirst.org>';
const sendLimit = 25;

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

  if (!membership || !['owner', 'office_admin', 'office_user'].includes(membership.role)) redirect('/');

  return { supabase, membership };
}

export async function queueTodaysReminders() {
  const { supabase } = await requireReminderAccess();

  const { error } = await supabase.rpc('schedule_due_reminders', { target_run_date: todayIso() });

  if (error) throw new Error(error.message);

  revalidatePath('/reminders');
}

export async function sendQueuedReminders() {
  const { membership } = await requireReminderAccess();
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY.');
  }

  const admin = createAdminClient();
  const resend = new Resend(apiKey);
  const now = new Date().toISOString();

  const { data: reminders, error } = await admin
    .from('reminder_send_log')
    .select('id, recipient_email, subject, body, status, scheduled_for')
    .eq('company_id', membership.company_id)
    .in('status', ['scheduled', 'queued'])
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(sendLimit);

  if (error) throw new Error(error.message);

  for (const reminder of reminders ?? []) {
    const queued = await admin
      .from('reminder_send_log')
      .update({ status: 'queued', failure_reason: null })
      .eq('id', reminder.id)
      .in('status', ['scheduled', 'queued'])
      .select('id')
      .single();

    if (queued.error) {
      continue;
    }

    try {
      const sent = await resend.emails.send({
        from: senderEmail,
        to: reminder.recipient_email,
        subject: reminder.subject,
        text: reminder.body
      });

      if (sent.error) {
        throw new Error(sent.error.message);
      }

      await admin
        .from('reminder_send_log')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: sent.data?.id ?? null,
          failure_reason: null
        })
        .eq('id', reminder.id);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unknown email send failure';

      await admin
        .from('reminder_send_log')
        .update({
          status: 'failed',
          failure_reason: message
        })
        .eq('id', reminder.id);
    }
  }

  revalidatePath('/reminders');
}
