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

function checkboxValue(formData: FormData, name: string) {
  return formData.get(name) === 'on';
}

function optionalInteger(formData: FormData, name: string) {
  const value = optionalString(formData, name);
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be a whole number`);
  return parsed;
}

function requireEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid recipient email: ${value}`);
  }
  return email;
}

function addRecipient(recipients: Map<string, { recipient_name: string | null; recipient_email: string }>, name: string | null, email: string) {
  const recipientEmail = requireEmail(email);
  if (!recipients.has(recipientEmail)) {
    recipients.set(recipientEmail, {
      recipient_name: name?.trim() || null,
      recipient_email: recipientEmail
    });
  }
}

function parseAdditionalRecipients(formData: FormData) {
  const recipients = new Map<string, { recipient_name: string | null; recipient_email: string }>();
  const names = formData.getAll('additionalRecipientName');
  const emails = formData.getAll('additionalRecipientEmail');
  const rowCount = Math.max(names.length, emails.length);

  for (let index = 0; index < rowCount; index += 1) {
    const name = String(names[index] ?? '').trim();
    const email = String(emails[index] ?? '').trim();

    if (!name && !email) continue;
    if (!email) throw new Error('Additional recipient email is required when a name is provided');

    addRecipient(recipients, name, email);
  }

  const bulkRecipients = optionalString(formData, 'additionalRecipients');
  if (bulkRecipients) {
    for (const line of bulkRecipients.split(/\r?\n/)) {
      const value = line.trim();
      if (!value) continue;

      const match = value.match(/^(.*?)<([^<>]+)>$/);
      if (match) {
        addRecipient(recipients, match[1].trim(), match[2].trim());
      } else {
        addRecipient(recipients, null, value);
      }
    }
  }

  return Array.from(recipients.values());
}

function itemPathPrefix(formData: FormData) {
  const value = optionalString(formData, 'itemPathPrefix');
  if (value === '/items' || value?.startsWith('/admin/companies/')) return value;
  return '/items';
}

function itemDetailPath(formData: FormData, itemId: string) {
  return `${itemPathPrefix(formData)}/${itemId}`;
}

async function requireMembership(options: { allowAppAdmin?: boolean } = {}) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  if (options.allowAppAdmin) {
    const { data: isAppAdmin } = await supabase.rpc('is_app_admin');
    if (isAppAdmin) return { supabase, membership: null };
  }

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
  if (!membership) redirect('/');
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
  const { supabase } = await requireMembership({ allowAppAdmin: true });

  const { error } = await supabase.rpc('update_compliance_item_status', {
    target_item_id: itemId,
    next_status: status,
    next_notes: notes
  });

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/items');
  revalidatePath(`/items/${itemId}`);
  revalidatePath(itemDetailPath(formData, itemId));
  redirect(itemDetailPath(formData, itemId));
}

export async function completeComplianceItem(formData: FormData) {
  const itemId = requiredString(formData, 'itemId');
  const { supabase } = await requireMembership({ allowAppAdmin: true });
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
  revalidatePath(itemDetailPath(formData, itemId));

  if (newItemId) redirect(itemDetailPath(formData, newItemId));
  redirect(itemDetailPath(formData, itemId));
}

export async function saveComplianceItemReminders(formData: FormData) {
  const itemId = requiredString(formData, 'itemId');
  const { supabase } = await requireMembership({ allowAppAdmin: true });
  const expirationRuleActive = checkboxValue(formData, 'expirationRuleActive');
  const repeatRuleActive = checkboxValue(formData, 'repeatRuleActive');
  const expirationDaysBefore = optionalInteger(formData, 'expirationDaysBefore') ?? 14;
  const repeatEveryDays = optionalInteger(formData, 'repeatEveryDays');

  if (expirationDaysBefore < 0) {
    throw new Error('expirationDaysBefore must be zero or greater');
  }

  if (repeatEveryDays !== null && repeatEveryDays <= 0) {
    throw new Error('repeatEveryDays must be greater than zero');
  }

  if (repeatRuleActive && (!repeatEveryDays || repeatEveryDays <= 0)) {
    throw new Error('repeatEveryDays is required when repeat reminders are active');
  }

  const { error } = await supabase.rpc('save_compliance_item_reminders', {
    target_item_id: itemId,
    item_instructions: optionalString(formData, 'instructions'),
    start_rule_active: checkboxValue(formData, 'startRuleActive'),
    expiration_rule_active: expirationRuleActive,
    expiration_days_before: expirationDaysBefore,
    repeat_rule_active: repeatRuleActive,
    repeat_every_days: repeatEveryDays,
    additional_recipients: parseAdditionalRecipients(formData)
  });

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/items');
  revalidatePath(`/items/${itemId}`);
  revalidatePath(itemDetailPath(formData, itemId));
  revalidatePath('/reminders');
  redirect(itemDetailPath(formData, itemId));
}
