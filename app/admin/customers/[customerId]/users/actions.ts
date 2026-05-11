'use server';

import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { getAppAdminClassification } from '@/lib/app-admins';
import { type CustomerRole, normalizedEmail, relation, toAppRole } from '@/lib/customer-detail';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const senderEmail = process.env.RESEND_FROM_EMAIL ?? 'FF Compliance <alerts@fishermenfirst.org>';

type ActionResult = {
  message: string;
};

type OwnerCodeAssignmentTarget = {
  userId: string | null;
  email: string | null;
  previousEmail?: string | null;
};

type OwnerCodeRow = {
  id: string;
  code: string;
  user_id: string | null;
  pending_email: string | null;
};

function assertValidEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Enter a valid customer email address.');
  }

  return normalized;
}

async function requireFfAdmin() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    throw new Error('You must be signed in.');
  }

  const classification = await getAppAdminClassification();
  const email = normalizedEmail(userData.user.email);

  if (classification.status === 'unverified' || !email || !classification.appAdminEmails.has(email)) {
    throw new Error('Only FF admins can manage customer access.');
  }

  return userData.user;
}

function revalidateCustomer(customerId: string) {
  revalidatePath('/admin');
  revalidatePath(`/admin/companies/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/users`);
}

async function assertCustomerEmail(email: string) {
  const classification = await getAppAdminClassification();
  const normalized = assertValidEmail(email);

  if (classification.status === 'unverified' || classification.appAdminEmails.has(normalized)) {
    throw new Error('This email cannot be used for a customer user.');
  }

  return normalized;
}

async function updateOwnerCodeAssignments(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  target: OwnerCodeAssignmentTarget,
  codes: string[]
) {
  const desiredCodes = new Set(codes.map((code) => code.trim()).filter(Boolean));
  const nextEmail = normalizedEmail(target.email);
  const previousEmail = normalizedEmail(target.previousEmail);

  if (desiredCodes.size > 0 && !target.userId && !nextEmail) {
    throw new Error('Owner codes require a customer email.');
  }

  const { data, error } = await admin
    .from('company_owner_codes')
    .select('id, code, user_id, pending_email')
    .eq('company_id', customerId)
    .order('code');

  if (error) throw new Error(error.message);

  const ownerCodes = (data ?? []) as OwnerCodeRow[];
  const existingCodes = new Set(ownerCodes.map((owner) => owner.code));
  const unknownCodes = Array.from(desiredCodes).filter((code) => !existingCodes.has(code));

  if (unknownCodes.length > 0) {
    throw new Error(`Unknown owner code: ${unknownCodes.join(', ')}`);
  }

  for (const owner of ownerCodes) {
    const assignedToTarget =
      owner.user_id === target.userId ||
      (previousEmail && normalizedEmail(owner.pending_email) === previousEmail) ||
      (nextEmail && normalizedEmail(owner.pending_email) === nextEmail);
    const shouldAssign = desiredCodes.has(owner.code);

    if (!assignedToTarget && !shouldAssign) continue;

    const patch = shouldAssign
      ? {
          user_id: target.userId,
          pending_email: target.userId ? null : nextEmail,
          updated_at: new Date().toISOString()
        }
      : {
          user_id: null,
          pending_email: null,
          updated_at: new Date().toISOString()
        };

    const { error: updateError } = await admin.from('company_owner_codes').update(patch).eq('id', owner.id);

    if (updateError) throw new Error(updateError.message);
  }
}

function invitationEmailHtml(loginUrl: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#18211f">
      <h1 style="font-size:24px;margin:0 0 12px">Open your FF Compliance workspace</h1>
      <p style="margin:0 0 18px">Use this one-time link to log in to your customer compliance workspace.</p>
      <p style="margin:0 0 22px">
        <a href="${loginUrl}" style="display:inline-block;background:#12786d;color:#ffffff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:700">Log in</a>
      </p>
      <p style="margin:0;color:#6d7773;font-size:13px">This link is only for the email address that was invited.</p>
    </div>
  `;
}

async function sendInvitationLink(admin: ReturnType<typeof createAdminClient>, invitationId: string) {
  const { data: invitation, error } = await admin
    .from('company_invitations')
    .select('id, company_id, email, accepted_at')
    .eq('id', invitationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!invitation) throw new Error('Invitation not found.');
  if (invitation.accepted_at) throw new Error('This invitation has already been accepted.');

  const email = assertValidEmail(invitation.email);
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('Resend is not configured.');
  }

  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${env.appBaseUrl}/auth/confirm`
    }
  });

  if (linkError) throw new Error(linkError.message);

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error('Could not create a login link.');

  const loginUrl = `${env.appBaseUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;
  const resend = new Resend(apiKey);
  const sent = await resend.emails.send({
    from: senderEmail,
    to: email,
    subject: 'Your FF Compliance login link',
    html: invitationEmailHtml(loginUrl),
    text: `Log in to FF Compliance: ${loginUrl}`
  });

  if (sent.error) throw new Error(sent.error.message);

  return invitation.company_id;
}

export async function updateUserAccess(input: {
  customerId: string;
  userKey: string;
  name?: string;
  email?: string;
  role?: CustomerRole;
  codes?: string[];
}): Promise<ActionResult> {
  await requireFfAdmin();

  const admin = createAdminClient();
  const [kind, id] = input.userKey.split(':');

  if (!id || (kind !== 'membership' && kind !== 'invitation')) {
    throw new Error('Choose a valid customer user.');
  }

  if (kind === 'membership') {
    const { data: membership, error } = await admin
      .from('company_memberships')
      .select('id, company_id, user_id, role, profiles(email, full_name)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!membership || membership.company_id !== input.customerId) throw new Error('Customer membership not found.');

    const profile = relation(membership.profiles);
    const previousEmail = profile?.email ?? null;
    const nextEmail = input.email === undefined ? previousEmail : await assertCustomerEmail(input.email);
    const nextName = input.name?.trim();

    if (input.role) {
      const { error: roleError } = await admin
        .from('company_memberships')
        .update({ role: toAppRole(input.role) })
        .eq('id', membership.id);

      if (roleError) throw new Error(roleError.message);
    }

    if (input.email !== undefined && nextEmail && normalizedEmail(nextEmail) !== normalizedEmail(previousEmail)) {
      const { error: authError } = await admin.auth.admin.updateUserById(membership.user_id, {
        email: nextEmail,
        email_confirm: true
      });

      if (authError) throw new Error(authError.message);
    }

    if (input.email !== undefined || input.name !== undefined) {
      const fallbackName = nextName || profile?.full_name || nextEmail?.split('@')[0] || 'Customer user';
      const fallbackEmail = nextEmail ?? previousEmail;

      if (!fallbackEmail) throw new Error('Customer email is required.');

      const { error: profileError } = await admin
        .from('profiles')
        .upsert(
          {
            id: membership.user_id,
            full_name: fallbackName,
            email: fallbackEmail,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        );

      if (profileError) throw new Error(profileError.message);
    }

    if (input.codes) {
      if (nextEmail) await assertCustomerEmail(nextEmail);
      await updateOwnerCodeAssignments(
        admin,
        input.customerId,
        { userId: membership.user_id, email: nextEmail, previousEmail },
        input.codes
      );
    }
  } else {
    const { data: invitation, error } = await admin
      .from('company_invitations')
      .select('id, company_id, email, role, accepted_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invitation || invitation.company_id !== input.customerId) throw new Error('Customer invitation not found.');
    if (invitation.accepted_at) throw new Error('Accepted invitations are managed from the active membership.');

    const previousEmail = invitation.email;
    const nextEmail = input.email === undefined ? invitation.email : await assertCustomerEmail(input.email);
    if (!nextEmail) throw new Error('Customer email is required.');

    const update: { email?: string; role?: ReturnType<typeof toAppRole> } = {};
    if (input.email !== undefined) update.email = nextEmail;
    if (input.role) update.role = toAppRole(input.role);

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await admin.from('company_invitations').update(update).eq('id', invitation.id);
      if (updateError) throw new Error(updateError.message);
    }

    if (input.codes) {
      await assertCustomerEmail(nextEmail);
      await updateOwnerCodeAssignments(
        admin,
        input.customerId,
        { userId: null, email: nextEmail, previousEmail },
        input.codes
      );
    }
  }

  revalidateCustomer(input.customerId);
  return { message: 'User access saved.' };
}

export async function resendInvitation(invitationId: string): Promise<ActionResult> {
  await requireFfAdmin();

  const admin = createAdminClient();
  const customerId = await sendInvitationLink(admin, invitationId);

  revalidateCustomer(customerId);
  return { message: 'Invitation resent.' };
}

export async function suspendUser(membershipId: string): Promise<ActionResult> {
  await requireFfAdmin();

  const admin = createAdminClient();
  const { data: membership, error } = await admin
    .from('company_memberships')
    .select('company_id')
    .eq('id', membershipId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (membership) revalidateCustomer(membership.company_id);

  return { message: 'Coming soon.' };
}

export async function removeUser(membershipId: string): Promise<ActionResult> {
  await requireFfAdmin();

  const admin = createAdminClient();
  const { data: membership, error } = await admin
    .from('company_memberships')
    .select('company_id')
    .eq('id', membershipId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (membership) revalidateCustomer(membership.company_id);

  return { message: 'Coming soon.' };
}

export async function bulkResendInvitations(invitationIds: string[]): Promise<ActionResult> {
  await requireFfAdmin();

  const admin = createAdminClient();
  const customerIds = new Set<string>();

  for (const invitationId of invitationIds) {
    customerIds.add(await sendInvitationLink(admin, invitationId));
  }

  customerIds.forEach(revalidateCustomer);
  return { message: `${invitationIds.length} invitation${invitationIds.length === 1 ? '' : 's'} resent.` };
}

export async function handoffCustomer(customerId: string): Promise<ActionResult> {
  await requireFfAdmin();
  revalidateCustomer(customerId);

  return { message: 'Coming soon.' };
}
