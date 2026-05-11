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
  handoff_exempt: boolean;
  handoff_exemption_reason: string | null;
};

function assertValidEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Enter a valid customer email address.');
  }

  return normalized;
}

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function metadataString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function ensureFfAdminProfile(user: AuthUser) {
  const email = user.email?.trim().toLowerCase();

  if (!email) {
    throw new Error('FF admin email is required.');
  }

  const { error } = await createAdminClient().from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name:
        metadataString(user.user_metadata?.full_name) ||
        metadataString(user.user_metadata?.name) ||
        email.split('@')[0],
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );

  if (error) throw new Error(error.message);
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

  await ensureFfAdminProfile(userData.user);

  return userData.user;
}

function revalidateCustomer(customerId: string) {
  revalidatePath('/admin');
  revalidatePath(`/admin/companies/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath(`/admin/customers/${customerId}/overview`);
  revalidatePath(`/admin/customers/${customerId}/setup`);
  revalidatePath(`/admin/customers/${customerId}/import`);
  revalidatePath(`/admin/customers/${customerId}/codes`);
  revalidatePath(`/admin/customers/${customerId}/users`);
  revalidatePath(`/admin/customers/${customerId}/diagnostics`);
  revalidatePath(`/admin/customers/${customerId}/danger`);
}

async function assertCustomerEmail(email: string) {
  const classification = await getAppAdminClassification();
  const normalized = assertValidEmail(email);

  if (classification.status === 'unverified' || classification.appAdminEmails.has(normalized)) {
    throw new Error('This email cannot be used for a customer user.');
  }

  return normalized;
}

async function assertNoActiveMembershipInAnotherCompany(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  email: string
) {
  const normalized = normalizedEmail(email);
  if (!normalized) return;

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .limit(1)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.id) return;

  const { data: memberships, error: membershipError } = await admin
    .from('company_memberships')
    .select('company_id')
    .eq('user_id', profile.id);

  if (membershipError) throw new Error(membershipError.message);

  if ((memberships ?? []).some((membership) => membership.company_id !== customerId)) {
    throw new Error('This email is already tied to another workspace. Ask FF Admin to review access.');
  }
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
    .select('id, code, user_id, pending_email, handoff_exempt, handoff_exemption_reason')
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
          handoff_exempt: false,
          handoff_exemption_reason: null,
          handoff_exempted_by: null,
          handoff_exempted_at: null,
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

  const email = await assertCustomerEmail(invitation.email ?? '');
  await assertNoActiveMembershipInAnotherCompany(admin, invitation.company_id, email);
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

    if (nextEmail) {
      await assertNoActiveMembershipInAnotherCompany(admin, input.customerId, nextEmail);
    }

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

    await assertNoActiveMembershipInAnotherCompany(admin, input.customerId, nextEmail);

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
  const user = await requireFfAdmin();
  const classification = await getAppAdminClassification();

  if (classification.status === 'unverified') {
    throw new Error('FF-admin classification could not be verified.');
  }

  const admin = createAdminClient();
  const [
    itemsResult,
    ownerCodesResult,
    membershipsResult,
    invitationsResult
  ] = await Promise.all([
    admin.from('compliance_items').select('id', { count: 'exact', head: true }).eq('company_id', customerId),
    admin
      .from('company_owner_codes')
      .select('id, code, user_id, pending_email, handoff_exempt, handoff_exemption_reason, profiles!company_owner_codes_user_id_fkey(email)')
      .eq('company_id', customerId),
    admin
      .from('company_memberships')
      .select('id, profiles(email)')
      .eq('company_id', customerId),
    admin
      .from('company_invitations')
      .select('id, email, accepted_at')
      .eq('company_id', customerId)
      .is('accepted_at', null)
  ]);

  const firstError = [itemsResult, ownerCodesResult, membershipsResult, invitationsResult].find((result) => result.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const ownerCodes = (ownerCodesResult.data ?? []) as Array<OwnerCodeRow & { profiles?: { email: string | null } | { email: string | null }[] | null }>;
  const memberships = (membershipsResult.data ?? []) as Array<{ profiles?: { email: string | null } | { email: string | null }[] | null }>;
  const invitations = (invitationsResult.data ?? []) as Array<{ id: string; email: string | null }>;
  const customerMembershipCount = memberships.filter((membership) => {
    const profile = relation(membership.profiles);
    return profile?.email && !classification.appAdminEmails.has(normalizedEmail(profile.email));
  }).length;
  const pendingInvitations = invitations.filter((invite) => {
    const email = normalizedEmail(invite.email);
    return email && !classification.appAdminEmails.has(email);
  });
  const ownerCodesReady = ownerCodes.length > 0 && ownerCodes.every((owner) => {
    const profile = relation(owner.profiles);
    const email = normalizedEmail(profile?.email ?? owner.pending_email);
    if (email && classification.appAdminEmails.has(email)) return false;
    if (owner.handoff_exempt && owner.handoff_exemption_reason?.trim()) return true;
    return Boolean((owner.user_id || owner.pending_email) && email && !classification.appAdminEmails.has(email));
  });

  if ((itemsResult.count ?? 0) === 0) {
    return { message: 'Import the customer workbook before sending invites.' };
  }

  if (!ownerCodesReady) {
    return { message: 'Map or explicitly exempt every owner code before sending invites.' };
  }

  if (customerMembershipCount + pendingInvitations.length === 0) {
    return { message: 'Stage at least one customer user before handoff.' };
  }

  if (pendingInvitations.length === 0) {
    revalidateCustomer(customerId);
    return { message: 'No pending invitations to send.' };
  }

  const sent: string[] = [];
  const failed: Array<{ invitationId: string; email: string | null; message: string }> = [];

  for (const invite of pendingInvitations) {
    try {
      await sendInvitationLink(admin, invite.id);
      sent.push(invite.id);
    } catch (error) {
      failed.push({
        invitationId: invite.id,
        email: invite.email,
        message: error instanceof Error ? error.message : 'Unknown invite send failure'
      });
    }
  }

  const { error: auditError } = await admin.from('audit_log').insert({
    company_id: customerId,
    actor_id: user.id,
    entity_type: 'company',
    entity_id: customerId,
    action: 'handoff_invites_sent',
    metadata: {
      sent: sent.length,
      failed: failed.length,
      failedInvitations: failed
    }
  });

  if (auditError) throw new Error(auditError.message);

  revalidateCustomer(customerId);

  if (failed.length > 0) {
    return {
      message: `${sent.length} invitation${sent.length === 1 ? '' : 's'} sent. ${failed.length} failed; review diagnostics.`
    };
  }

  return { message: `${sent.length} pending invitation${sent.length === 1 ? '' : 's'} sent.` };
}

export async function setOwnerCodeExemption(formData: FormData) {
  const user = await requireFfAdmin();
  const customerId = String(formData.get('customerId') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  const exempt = String(formData.get('handoffExempt') ?? '') === 'true';
  const reason = String(formData.get('reason') ?? '').trim();

  if (!customerId || !code) {
    throw new Error('Customer and owner code are required.');
  }

  if (exempt && !reason) {
    throw new Error('An exemption reason is required.');
  }

  const admin = createAdminClient();
  const { data: ownerCode, error } = await admin
    .from('company_owner_codes')
    .update({
      handoff_exempt: exempt,
      handoff_exemption_reason: exempt ? reason : null,
      handoff_exempted_by: exempt ? user.id : null,
      handoff_exempted_at: exempt ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', customerId)
    .eq('code', code)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!ownerCode) throw new Error('Owner code was not found.');

  const { error: auditError } = await admin.from('audit_log').insert({
    company_id: customerId,
    actor_id: user.id,
    entity_type: 'company_owner_code',
    entity_id: ownerCode.id,
    action: exempt ? 'owner_code_exempted' : 'owner_code_exemption_cleared',
    metadata: { code, reason: exempt ? reason : null }
  });

  if (auditError) throw new Error(auditError.message);

  revalidateCustomer(customerId);
}
