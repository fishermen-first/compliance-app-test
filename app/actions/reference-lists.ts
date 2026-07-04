'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const agencyKinds = new Set(['agency', 'coop', 'certification', 'internal']);
const contactRoles = new Set(['master', 'mate', 'engineer', 'purser', 'factory_manager', 'office', 'other']);

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  if (!value) throw new Error(`Missing required field: ${name}`);
  return value;
}

function optionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function requiredKind(formData: FormData) {
  const value = requiredString(formData, 'kind');
  if (!agencyKinds.has(value)) throw new Error('Choose a valid agency kind.');
  return value;
}

function requiredRole(formData: FormData, name = 'role') {
  const value = requiredString(formData, name);
  if (!contactRoles.has(value)) throw new Error('Choose a valid contact role.');
  return value;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email: ${value}`);
  }
  return email;
}

function optionalUuid(formData: FormData, name: string) {
  const value = optionalString(formData, name);
  return value === '__unset__' ? null : value;
}

function safeRedirectPath(value: FormDataEntryValue | null) {
  const path = String(value ?? '').trim();
  if (path === '/settings' || path === '/settings/lists') return path;
  if (/^\/admin\/customers\/[0-9a-f-]+\/lists$/i.test(path)) return path;
  return '/settings';
}

function redirectWithMessage(formData: FormData, message: string) {
  const redirectTo = safeRedirectPath(formData.get('redirectTo'));
  const params = new URLSearchParams();
  params.set('message', message);
  redirect(`${redirectTo}?${params.toString()}`);
}

function revalidateReferenceListPaths(companyId: string) {
  revalidatePath('/settings');
  revalidatePath('/settings/lists');
  revalidatePath('/items/new');
  revalidatePath('/items/[id]', 'page');
  revalidatePath('/admin');
  revalidatePath(`/admin/customers/${companyId}`);
  revalidatePath(`/admin/customers/${companyId}/lists`);
  revalidatePath(`/admin/customers/${companyId}/import`);
}

async function requireReferenceListEditor(companyId: string) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/login');

  const [{ data: isAppAdmin }, { data: membership }] = await Promise.all([
    supabase.rpc('is_app_admin'),
    supabase
      .from('company_memberships')
      .select('id')
      .eq('company_id', companyId)
      .eq('user_id', userData.user.id)
      .in('role', ['owner', 'office_user'])
      .maybeSingle()
  ]);

  if (!isAppAdmin && !membership) redirect('/');
  return supabase as any;
}

export async function addAgency(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const supabase = await requireReferenceListEditor(companyId);
  const name = requiredString(formData, 'name');
  const kind = requiredKind(formData);

  const { error } = await supabase.from('agencies').insert({ company_id: companyId, name, kind });
  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Added "${name}" to agencies.`);
}

export async function updateAgency(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const agencyId = requiredString(formData, 'agencyId');
  const supabase = await requireReferenceListEditor(companyId);
  const name = requiredString(formData, 'name');
  const kind = requiredKind(formData);

  const { error } = await supabase
    .from('agencies')
    .update({ name, kind, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', agencyId);

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Updated "${name}".`);
}

export async function removeAgencyAlias(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const aliasId = requiredString(formData, 'aliasId');
  const supabase = await requireReferenceListEditor(companyId);

  const { error } = await supabase.from('agency_aliases').delete().eq('company_id', companyId).eq('id', aliasId);
  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, 'Alias removed.');
}

export async function mergeAgencies(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const fromAgencyId = requiredString(formData, 'fromAgencyId');
  const toAgencyId = requiredString(formData, 'toAgencyId');
  const supabase = await requireReferenceListEditor(companyId);

  const { error } = await supabase.rpc('merge_agencies', {
    from_agency_id: fromAgencyId,
    to_agency_id: toAgencyId
  });

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, 'Agencies merged and alias saved.');
}

export async function removeAgency(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const agencyId = requiredString(formData, 'agencyId');
  const expectedCount = Number(requiredString(formData, 'expectedCount'));
  const supabase = await requireReferenceListEditor(companyId);

  const { error } = await supabase.rpc('remove_agency', {
    target_agency_id: agencyId,
    reassign_to_agency_id: optionalUuid(formData, 'reassignToAgencyId'),
    expected_item_count: expectedCount
  });

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, expectedCount > 0 ? 'Agency reassigned and removed.' : 'Agency removed.');
}

export async function addVessel(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const supabase = await requireReferenceListEditor(companyId);
  const name = requiredString(formData, 'name');

  const { error } = await supabase.from('vessels').insert({ company_id: companyId, name, active: true });
  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Added "${name}" to vessels.`);
}

export async function updateVessel(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const vesselId = requiredString(formData, 'vesselId');
  const supabase = await requireReferenceListEditor(companyId);
  const name = requiredString(formData, 'name');
  const active = requiredString(formData, 'active') === 'true';

  const { error } = await supabase
    .from('vessels')
    .update({ name, active, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', vesselId);

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Updated "${name}".`);
}

export async function removeVessel(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const vesselId = requiredString(formData, 'vesselId');
  const expectedCount = Number(requiredString(formData, 'expectedCount'));
  const supabase = await requireReferenceListEditor(companyId);

  const { error } = await supabase.rpc('remove_vessel', {
    target_vessel_id: vesselId,
    reassign_to_vessel_id: optionalUuid(formData, 'reassignToVesselId'),
    expected_item_count: expectedCount
  });

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, expectedCount > 0 ? 'Vessel reassigned and removed.' : 'Vessel removed.');
}

export async function addContact(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const supabase = await requireReferenceListEditor(companyId);
  const email = normalizeEmail(requiredString(formData, 'email'));

  const { error } = await supabase.from('external_contacts').insert({
    company_id: companyId,
    name: optionalString(formData, 'name'),
    email,
    role: requiredRole(formData)
  });

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Added ${email} to external contacts.`);
}

export async function updateContact(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const contactId = requiredString(formData, 'contactId');
  const supabase = await requireReferenceListEditor(companyId);
  const email = normalizeEmail(requiredString(formData, 'email'));

  const { error } = await supabase
    .from('external_contacts')
    .update({
      name: optionalString(formData, 'name'),
      email,
      role: requiredRole(formData),
      active: formData.get('active') !== 'false',
      updated_at: new Date().toISOString()
    })
    .eq('company_id', companyId)
    .eq('id', contactId);

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Updated ${email}.`);
}

export async function removeContact(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const contactId = requiredString(formData, 'contactId');
  const supabase = await requireReferenceListEditor(companyId);

  const { error } = await supabase.from('external_contacts').delete().eq('company_id', companyId).eq('id', contactId);
  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, 'Contact removed. Past reminder sends keep their snapshot.');
}

export async function addContactGroup(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const supabase = await requireReferenceListEditor(companyId);
  const name = requiredString(formData, 'name');

  const { error } = await supabase.from('contact_groups').insert({ company_id: companyId, name });
  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Added "${name}" group.`);
}

export async function updateContactGroup(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const groupId = requiredString(formData, 'groupId');
  const supabase = await requireReferenceListEditor(companyId);
  const name = requiredString(formData, 'name');

  const { error } = await supabase
    .from('contact_groups')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', groupId);

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Updated "${name}" group.`);
}

export async function removeContactGroup(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const groupId = requiredString(formData, 'groupId');
  const supabase = await requireReferenceListEditor(companyId);

  const { error } = await supabase.from('contact_groups').delete().eq('company_id', companyId).eq('id', groupId);
  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, 'Group removed.');
}

export async function addContactGroupMember(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const groupId = requiredString(formData, 'groupId');
  const supabase = await requireReferenceListEditor(companyId);
  const email = normalizeEmail(requiredString(formData, 'email'));

  const { error } = await supabase.from('contact_group_members').insert({
    company_id: companyId,
    group_id: groupId,
    email,
    name: optionalString(formData, 'name')
  });

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Added ${email} to group.`);
}

export async function removeContactGroupMember(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const memberId = requiredString(formData, 'memberId');
  const supabase = await requireReferenceListEditor(companyId);

  const { error } = await supabase.from('contact_group_members').delete().eq('company_id', companyId).eq('id', memberId);
  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, 'Group member removed.');
}

export async function addPastedContacts(formData: FormData) {
  const companyId = requiredString(formData, 'companyId');
  const supabase = await requireReferenceListEditor(companyId);
  const names = formData.getAll('pasteName');
  const emails = formData.getAll('pasteEmail');
  const roles = formData.getAll('pasteRole');
  const rows = new Map<string, { company_id: string; name: string | null; email: string; role: string }>();

  emails.forEach((value, index) => {
    const email = normalizeEmail(String(value ?? ''));
    const name = String(names[index] ?? '').trim() || null;
    rows.set(email, {
      company_id: companyId,
      name,
      email,
      role: contactRoles.has(String(roles[index] ?? 'office')) ? String(roles[index]) : 'office'
    });
  });

  if (rows.size === 0) {
    redirectWithMessage(formData, 'No staged contacts to add.');
  }

  const { error } = await supabase.from('external_contacts').insert(Array.from(rows.values()));

  if (error) throw new Error(error.message);

  revalidateReferenceListPaths(companyId);
  redirectWithMessage(formData, `Added ${rows.size} contact${rows.size === 1 ? '' : 's'} from the pasted list.`);
}
