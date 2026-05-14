import 'server-only';

import { Resend } from 'resend';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

const senderEmail = process.env.RESEND_FROM_EMAIL ?? 'FF Compliance <alerts@fishermenfirst.org>';
const defaultSendLimit = 25;

type ClaimedReminder = {
  id: string;
  company_id: string;
  item_id: string;
  recipient_email: string;
  scheduled_for: string;
  item_name: string;
  owner_current: string | null;
  start_working_on: string | null;
  expiration_date: string | null;
  status: string;
  instructions: string | null;
  vessel_name: string | null;
};

function reminderUrl(itemId: string) {
  return `${env.appBaseUrl.replace(/\/$/, '')}/items/${itemId}`;
}

function buildReminder(reminder: ClaimedReminder) {
  const subject = `Reminder: ${reminder.item_name}`;
  const body = [
    subject,
    `Vessel/company: ${reminder.vessel_name ?? 'Company-wide'}`,
    `Owner: ${reminder.owner_current ?? 'Unassigned'}`,
    `Start working on: ${reminder.start_working_on ?? 'Not set'}`,
    `Expiration date: ${reminder.expiration_date ?? 'Not set'}`,
    `Status: ${reminder.status}`,
    reminder.instructions?.trim() ? `Instructions: ${reminder.instructions}` : null,
    `Open item: ${reminderUrl(reminder.item_id)}`
  ].filter(Boolean).join('\n');

  return { subject, body };
}

export async function sendQueuedRemindersForCompany(companyId: string | null, limit = defaultSendLimit) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY.');
  }

  const admin = createAdminClient();
  const resend = new Resend(apiKey);
  const { data, error } = await admin.rpc('claim_due_reminders', {
    target_company_id: companyId ?? undefined,
    claim_limit: limit
  });

  if (error) throw new Error(error.message);

  const reminders = (data ?? []) as ClaimedReminder[];
  let sentCount = 0;
  let failedCount = 0;

  for (const reminder of reminders) {
    const { subject, body } = buildReminder(reminder);

    try {
      const sent = await resend.emails.send({
        from: senderEmail,
        to: reminder.recipient_email,
        subject,
        text: body
      });

      if (sent.error) {
        throw new Error(sent.error.message);
      }

      const { error: updateError } = await admin
        .from('reminder_send_log')
        .update({
          status: 'sent',
          subject,
          body,
          sent_at: new Date().toISOString(),
          provider_message_id: sent.data?.id ?? null,
          failure_reason: null
        })
        .eq('id', reminder.id);

      if (updateError) throw new Error(updateError.message);
      sentCount += 1;
    } catch (sendError) {
      failedCount += 1;
      const message = sendError instanceof Error ? sendError.message : 'Unknown email send failure';

      await admin
        .from('reminder_send_log')
        .update({
          status: 'failed',
          subject,
          body,
          failure_reason: message
        })
        .eq('id', reminder.id);
    }
  }

  return { claimedCount: reminders.length, sentCount, failedCount };
}
