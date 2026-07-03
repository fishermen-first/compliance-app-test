export type ReminderEmailRecipientKind = 'office' | 'external';

export type ReminderEmailReminder = {
  item_id: string;
  item_name: string;
  expiration_date: string | null;
  instructions: string | null;
  vessel_name: string | null;
};

export type ReminderEmailContext = {
  recipientKind: ReminderEmailRecipientKind;
  ownerName: string;
  ownerEmail: string | null;
  appBaseUrl: string;
};

function reminderUrl(appBaseUrl: string, itemId: string) {
  return `${appBaseUrl.replace(/\/$/, '')}/items/${itemId}`;
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

export function buildReminderEmail(reminder: ReminderEmailReminder, context: ReminderEmailContext) {
  const dueDate = formatReminderDate(reminder.expiration_date);
  const vessel = reminder.vessel_name ?? 'Company-wide';
  const officeContact = context.ownerEmail ? `${context.ownerName} <${context.ownerEmail}>` : context.ownerName;
  const itemUrl = reminderUrl(context.appBaseUrl, reminder.item_id);
  const subject = `Reminder \u2014 ${reminder.item_name} due ${dueDate} \u00b7 ${vessel}`;
  const body = [
    'This item is coming due soon',
    `Item: ${reminder.item_name}`,
    `Vessel: ${vessel}`,
    `Due date: ${dueDate}`,
    `Office contact: ${officeContact}`,
    reminder.instructions?.trim() ? `Instructions: ${reminder.instructions}` : null,
    context.recipientKind === 'office'
      ? `Open in FF Compliance: ${itemUrl}`
      : `You're receiving this because ${context.ownerName} added you to external compliance reminders. No login or reply is needed - the office tracks completion.`
  ].filter(Boolean).join('\n');

  const instructionsHtml = reminder.instructions?.trim()
    ? `<div style="margin-top:18px;padding:14px 16px;border-radius:10px;background:#f7f5ec;border:1px solid #e1e0d6;"><strong style="display:block;margin-bottom:6px;color:#18211f;">Instructions</strong><div style="white-space:pre-wrap;color:#38423f;">${escapeHtml(reminder.instructions)}</div></div>`
    : '';
  const ctaHtml = context.recipientKind === 'office'
    ? `<a href="${escapeHtml(itemUrl)}" style="display:inline-block;margin-top:18px;padding:10px 14px;border-radius:8px;background:#12786d;color:#ffffff;text-decoration:none;font-weight:700;">Open in FF Compliance</a>`
    : `<p style="margin:18px 0 0;color:#6d7773;font-size:13px;">You're receiving this because ${escapeHtml(context.ownerName)} added you to external compliance reminders. No login or reply is needed - the office tracks completion.</p>`;
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
