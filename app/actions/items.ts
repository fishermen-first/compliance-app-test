'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { inferRecurrence, parseOwnerCurrent } from '@/lib/compliance';
import { type Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';

type RecurrenceUnit = Database['public']['Enums']['recurrence_unit'];
type ComplianceItemStatus = Database['public']['Enums']['compliance_item_status'];

const recurrenceUnits = new Set<RecurrenceUnit>(['years', 'months', 'manual', 'none']);
const complianceItemStatuses = new Set<ComplianceItemStatus>(['not_started', 'in_progress', 'submitted', 'complete', 'discontinued']);

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

function integerList(formData: FormData, name: string) {
  const values = new Set<number>();

  for (const entry of formData.getAll(name)) {
    const value = String(entry ?? '').trim();
    if (!value) continue;

    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${name} must be a whole number`);
    if (parsed < 0) throw new Error(`${name} must be zero or greater`);
    values.add(parsed);
  }

  return Array.from(values).sort((a, b) => b - a);
}

function dateList(formData: FormData, name: string) {
  const values = new Set<string>();

  for (const entry of formData.getAll(name)) {
    const value = String(entry ?? '').trim();
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be a date`);

    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error(`${name} must be a valid date`);
    }

    values.add(value);
  }

  return Array.from(values).sort();
}

function stringList(formData: FormData, name: string) {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const entry of formData.getAll(name)) {
    const value = String(entry ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
}

function ownerCodeList(formData: FormData) {
  const values: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | null) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    values.push(value);
  };

  add(optionalString(formData, 'ownerCurrent'));
  stringList(formData, 'ownerCoOwnerCodes').forEach(add);
  stringList(formData, 'ownerCodes').forEach(add);

  return values;
}

function requiredRecurrenceUnit(formData: FormData, name: string) {
  const value = requiredString(formData, name);
  if (!recurrenceUnits.has(value as RecurrenceUnit)) {
    throw new Error(`${name} is invalid`);
  }
  return value as RecurrenceUnit;
}

function requireEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid recipient email: ${value}`);
  }
  return email;
}

type AdditionalRecipient = {
  recipient_type: 'external' | 'group';
  recipient_name: string | null;
  recipient_email?: string;
  external_contact_id?: string | null;
  contact_group_id?: string | null;
};

function addRecipient(
  recipients: Map<string, AdditionalRecipient>,
  name: string | null,
  email: string,
  externalContactId?: string | null
) {
  const recipientEmail = requireEmail(email);
  if (!recipients.has(recipientEmail)) {
    recipients.set(recipientEmail, {
      recipient_type: 'external',
      recipient_name: name?.trim() || null,
      recipient_email: recipientEmail,
      external_contact_id: externalContactId || null
    });
  }
}

function addGroupRecipient(recipients: Map<string, AdditionalRecipient>, name: string | null, groupId: string) {
  const key = `group:${groupId}`;
  if (!recipients.has(key)) {
    recipients.set(key, {
      recipient_type: 'group',
      recipient_name: name?.trim() || null,
      contact_group_id: groupId
    });
  }
}

function parseAdditionalRecipients(formData: FormData) {
  const recipients = new Map<string, AdditionalRecipient>();
  const types = formData.getAll('additionalRecipientType');
  const names = formData.getAll('additionalRecipientName');
  const emails = formData.getAll('additionalRecipientEmail');
  const contactIds = formData.getAll('additionalRecipientContactId');
  const groupIds = formData.getAll('additionalRecipientGroupId');
  const rowCount = Math.max(types.length, names.length, emails.length, contactIds.length, groupIds.length);

  for (let index = 0; index < rowCount; index += 1) {
    const type = String(types[index] ?? '').trim();
    const name = String(names[index] ?? '').trim();
    const email = String(emails[index] ?? '').trim();
    const contactId = String(contactIds[index] ?? '').trim();
    const groupId = String(groupIds[index] ?? '').trim();

    if (type === 'group' || groupId) {
      if (!groupId) throw new Error('Contact group is required for group recipients');
      addGroupRecipient(recipients, name, groupId);
      continue;
    }

    if (!name && !email) continue;
    if (!email) throw new Error('Additional recipient email is required when a name is provided');

    addRecipient(recipients, name, email, contactId || null);
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

  if (!membership || !['owner', 'office_user'].includes(membership.role)) {
    redirect('/');
  }

  return { supabase, membership };
}

export async function createComplianceItem(formData: FormData) {
  const { supabase, membership } = await requireMembership({ allowAppAdmin: true });
  const targetCompanyId = membership?.company_id ?? optionalString(formData, 'companyId');

  if (!targetCompanyId) redirect('/');

  const ownerRaw = optionalString(formData, 'ownerRaw');
  const frequencyLabel = optionalString(formData, 'frequencyLabel');
  const recurrence = inferRecurrence(frequencyLabel);
  const owners = ownerCodeList(formData);
  const primaryOwner = owners[0] ?? optionalString(formData, 'ownerCurrent') ?? parseOwnerCurrent(ownerRaw);

  const { data: itemId, error } = await supabase.rpc('create_compliance_item', {
    target_company_id: targetCompanyId,
    target_vessel_id: optionalString(formData, 'vesselId'),
    item_owner_raw: ownerRaw,
    item_owner_current: primaryOwner,
    item_owner_codes: owners.length ? owners : primaryOwner ? [primaryOwner] : [],
    item_name: requiredString(formData, 'itemName'),
    item_number: optionalString(formData, 'itemNumber'),
    item_agency_type: optionalString(formData, 'agencyType'),
    item_agency_id: optionalString(formData, 'agencyId'),
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
  redirect(itemDetailPath(formData, itemId));
}

export async function updateComplianceItemCore(formData: FormData) {
  const itemId = requiredString(formData, 'itemId');
  const { supabase } = await requireMembership({ allowAppAdmin: true });
  const ownerCodes = ownerCodeList(formData);
  const primaryOwner = ownerCodes[0] ?? optionalString(formData, 'ownerCurrent') ?? parseOwnerCurrent(optionalString(formData, 'ownerRaw'));

  const { error } = await supabase.rpc('update_compliance_item_core', {
    target_item_id: itemId,
    next_vessel_id: optionalString(formData, 'vesselId'),
    next_owner_raw: optionalString(formData, 'ownerRaw'),
    next_owner_current: primaryOwner,
    next_owner_codes: ownerCodes.length ? ownerCodes : primaryOwner ? [primaryOwner] : [],
    next_item_name: requiredString(formData, 'itemName'),
    next_item_number: optionalString(formData, 'itemNumber'),
    next_agency_type: optionalString(formData, 'agencyType'),
    next_compliance_area: requiredString(formData, 'complianceArea'),
    next_frequency_label: optionalString(formData, 'frequencyLabel'),
    next_recurrence_unit: requiredRecurrenceUnit(formData, 'recurrenceUnit'),
    next_recurrence_interval: optionalInteger(formData, 'recurrenceInterval'),
    next_start_working_on: optionalString(formData, 'startWorkingOn'),
    next_expiration_date: optionalString(formData, 'expirationDate'),
    next_status_notes: optionalString(formData, 'statusNotes'),
    next_instructions: optionalString(formData, 'instructions'),
    next_sharepoint_url: optionalString(formData, 'sharepointUrl'),
    ...(formData.has('agencyId') ? { next_agency_id: optionalString(formData, 'agencyId') } : {})
  });

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/items');
  revalidatePath(`/items/${itemId}`);
  revalidatePath(itemDetailPath(formData, itemId));
  redirect(itemDetailPath(formData, itemId));
}

export async function updateComplianceItemStatus(formData: FormData) {
  const itemId = requiredString(formData, 'itemId');
  const notes = optionalString(formData, 'notes');
  const { supabase } = await requireMembership({ allowAppAdmin: true });
  const requestedStatus = optionalString(formData, 'status');
  let status: ComplianceItemStatus;

  if (requestedStatus) {
    if (!complianceItemStatuses.has(requestedStatus as ComplianceItemStatus)) {
      throw new Error('status is invalid');
    }
    status = requestedStatus as ComplianceItemStatus;
  } else {
    const { data: currentItem, error: currentItemError } = await supabase
      .from('compliance_items')
      .select('status')
      .eq('id', itemId)
      .maybeSingle();

    if (currentItemError) throw new Error(currentItemError.message);
    if (!currentItem) throw new Error('Compliance item not found');

    status = currentItem.status as ComplianceItemStatus;
  }

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

  if (newItemId) {
    redirect(`${itemDetailPath(formData, itemId)}?completed=1&nextItem=${encodeURIComponent(newItemId)}`);
  }

  redirect(itemDetailPath(formData, itemId));
}

export async function saveComplianceItemReminders(formData: FormData) {
  const itemId = requiredString(formData, 'itemId');
  const { supabase } = await requireMembership({ allowAppAdmin: true });
  const ownerExpirationRuleActive = checkboxValue(formData, 'ownerExpirationRuleActive') || checkboxValue(formData, 'expirationRuleActive');
  const ownerRepeatRuleActive = checkboxValue(formData, 'ownerRepeatRuleActive') || checkboxValue(formData, 'repeatRuleActive');
  const ownerExpirationDaysBefore = integerList(formData, 'ownerExpirationDaysBefore');
  const fallbackExpirationDaysBefore = integerList(formData, 'expirationDaysBefore');
  const ownerOneOffDates = dateList(formData, 'ownerOneOffDate');
  const fallbackOneOffDates = dateList(formData, 'oneOffDate');
  const ownerRepeatEveryDays = optionalInteger(formData, 'ownerRepeatEveryDays') ?? optionalInteger(formData, 'repeatEveryDays');
  const externalExpirationRuleActive = checkboxValue(formData, 'externalExpirationRuleActive');
  const externalRepeatRuleActive = checkboxValue(formData, 'externalRepeatRuleActive');
  const externalExpirationDaysBefore = integerList(formData, 'externalExpirationDaysBefore');
  const externalOneOffDates = dateList(formData, 'externalOneOffDate');
  const externalRepeatEveryDays = optionalInteger(formData, 'externalRepeatEveryDays');

  [
    ['ownerRepeatEveryDays', ownerRepeatEveryDays],
    ['externalRepeatEveryDays', externalRepeatEveryDays]
  ].forEach(([name, value]) => {
    if (value !== null && Number(value) <= 0) {
      throw new Error(`${name} must be greater than zero`);
    }
  });

  if (ownerRepeatRuleActive && (!ownerRepeatEveryDays || ownerRepeatEveryDays <= 0)) {
    throw new Error('ownerRepeatEveryDays is required when owner repeat reminders are active');
  }

  if (externalRepeatRuleActive && (!externalRepeatEveryDays || externalRepeatEveryDays <= 0)) {
    throw new Error('externalRepeatEveryDays is required when external repeat reminders are active');
  }

  const { error } = await supabase.rpc('save_compliance_item_reminders', {
    target_item_id: itemId,
    item_instructions: optionalString(formData, 'instructions'),
    owner_start_rule_active: checkboxValue(formData, 'ownerStartRuleActive') || checkboxValue(formData, 'startRuleActive'),
    owner_expiration_rule_active: ownerExpirationRuleActive,
    owner_expiration_days_before: ownerExpirationDaysBefore.length ? ownerExpirationDaysBefore : fallbackExpirationDaysBefore,
    owner_repeat_rule_active: ownerRepeatRuleActive,
    owner_repeat_every_days: ownerRepeatEveryDays,
    owner_one_off_dates: ownerOneOffDates.length ? ownerOneOffDates : fallbackOneOffDates,
    external_start_rule_active: checkboxValue(formData, 'externalStartRuleActive'),
    external_expiration_rule_active: externalExpirationRuleActive,
    external_expiration_days_before: externalExpirationDaysBefore,
    external_repeat_rule_active: externalRepeatRuleActive,
    external_repeat_every_days: externalRepeatEveryDays,
    external_one_off_dates: externalOneOffDates,
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
