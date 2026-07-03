import 'server-only';

import { Resend } from 'resend';
import { env } from '@/lib/env';
import { buildReminderEmail } from '@/lib/reminder-email';
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

type ReminderContext = {
  recipientKind: 'office' | 'external';
  ownerName: string;
  ownerEmail: string | null;
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function reminderContext(admin: ReturnType<typeof createAdminClient>, reminder: ClaimedReminder): Promise<ReminderContext> {
  const [{ data: additionalRecipient }, { data: ownerCode }] = await Promise.all([
    admin
      .from('compliance_item_notification_recipients')
      .select('recipient_type')
      .eq('item_id', reminder.item_id)
      .eq('recipient_email', reminder.recipient_email)
      .maybeSingle(),
    reminder.owner_current
      ? admin
          .from('company_owner_codes')
          .select('display_name, profiles(full_name, email)')
          .eq('company_id', reminder.company_id)
          .eq('code', reminder.owner_current)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const profile = relation((ownerCode as any)?.profiles);
  const ownerName = (ownerCode as any)?.display_name ?? profile?.full_name ?? reminder.owner_current ?? 'Office';

  return {
    recipientKind: ['additional', 'external'].includes(additionalRecipient?.recipient_type ?? '') ? 'external' : 'office',
    ownerName,
    ownerEmail: profile?.email ?? null
  };
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
    const context = await reminderContext(admin, reminder);
    const { subject, body, html } = buildReminderEmail(reminder, { ...context, appBaseUrl: env.appBaseUrl });

    try {
      const sent = await resend.emails.send({
        from: senderEmail,
        to: reminder.recipient_email,
        subject,
        text: body,
        html
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
