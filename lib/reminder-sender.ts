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

type ReminderContext = {
  recipientKind: 'office' | 'vessel';
  ownerName: string;
  ownerEmail: string | null;
};

function reminderUrl(itemId: string) {
  return `${env.appBaseUrl.replace(/\/$/, '')}/items/${itemId}`;
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatReminderDate(value: string | null) {
  if (!value) return 'date not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

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
    recipientKind: additionalRecipient?.recipient_type === 'additional' ? 'vessel' : 'office',
    ownerName,
    ownerEmail: profile?.email ?? null
  };
}

function buildReminder(reminder: ClaimedReminder, context: ReminderContext) {
  const dueDate = formatReminderDate(reminder.expiration_date);
  const vessel = reminder.vessel_name ?? 'Company-wide';
  const officeContact = context.ownerEmail ? `${context.ownerName} <${context.ownerEmail}>` : context.ownerName;
  const subject = `Reminder — ${reminder.item_name} due ${dueDate} · ${vessel}`;
  const body = [
    'This item is coming due soon',
    `Item: ${reminder.item_name}`,
    `Vessel: ${vessel}`,
    `Due date: ${dueDate}`,
    `Office contact: ${officeContact}`,
    reminder.instructions?.trim() ? `Instructions: ${reminder.instructions}` : null,
    context.recipientKind === 'office'
      ? `Open in FF Compliance: ${reminderUrl(reminder.item_id)}`
      : `You're receiving this because ${context.ownerName} added you to vessel reminders. No login or reply is needed - the office tracks completion.`
  ].filter(Boolean).join('\n');

  const instructionsHtml = reminder.instructions?.trim()
    ? `<div style="margin-top:18px;padding:14px 16px;border-radius:10px;background:#f7f5ec;border:1px solid #e1e0d6;"><strong style="display:block;margin-bottom:6px;color:#18211f;">Instructions</strong><div style="white-space:pre-wrap;color:#38423f;">${escapeHtml(reminder.instructions)}</div></div>`
    : '';
  const ctaHtml = context.recipientKind === 'office'
    ? `<a href="${escapeHtml(reminderUrl(reminder.item_id))}" style="display:inline-block;margin-top:18px;padding:10px 14px;border-radius:8px;background:#12786d;color:#ffffff;text-decoration:none;font-weight:700;">Open in FF Compliance</a>`
    : `<p style="margin:18px 0 0;color:#6d7773;font-size:13px;">You're receiving this because ${escapeHtml(context.ownerName)} added you to vessel reminders. No login or reply is needed - the office tracks completion.</p>`;
  const html = `
    <div style="margin:0;padding:0;background:#f4f3ee;color:#18211f;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
        <div style="background:#142d3d;color:#f3f1e8;border-radius:14px 14px 0 0;padding:22px 24px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#aebfc0;">FF Compliance</div>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.15;">This item is coming due soon</h1>
        </div>
        <div style="background:#fffefa;border:1px solid #e1e0d6;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;">
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tbody>
              <tr><td style="padding:8px 0;color:#6d7773;font-size:12px;font-weight:700;text-transform:uppercase;">Item</td><td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(reminder.item_name)}</td></tr>
              <tr><td style="padding:8px 0;color:#6d7773;font-size:12px;font-weight:700;text-transform:uppercase;">Vessel</td><td style="padding:8px 0;text-align:right;">${escapeHtml(vessel)}</td></tr>
              <tr><td style="padding:8px 0;color:#6d7773;font-size:12px;font-weight:700;text-transform:uppercase;">Due date</td><td style="padding:8px 0;text-align:right;">${escapeHtml(dueDate)}</td></tr>
              <tr><td style="padding:8px 0;color:#6d7773;font-size:12px;font-weight:700;text-transform:uppercase;">Office contact</td><td style="padding:8px 0;text-align:right;">${escapeHtml(officeContact)}</td></tr>
            </tbody>
          </table>
          ${instructionsHtml}
          ${ctaHtml}
        </div>
      </div>
    </div>
  `;

  return { subject, body, html };
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
    const { subject, body, html } = buildReminder(reminder, context);

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
