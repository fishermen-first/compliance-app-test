'use server';

import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const senderEmail = process.env.RESEND_FROM_EMAIL ?? 'FF Compliance <alerts@fishermenfirst.org>';

function loginErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('signups not allowed') ||
    normalized.includes('user not found') ||
    normalized.includes('database error saving new user')
  ) {
    return 'This email is not invited yet. Ask an FF admin to add you first.';
  }

  return message;
}

async function hasLoginAccess(email: string) {
  const admin = createAdminClient();
  const [{ data: appAdmin, error: appAdminError }, { data: invitation, error: invitationError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin.from('app_admins').select('email').eq('email', email).maybeSingle(),
      admin.from('company_invitations').select('email').eq('email', email).limit(1).maybeSingle(),
      admin.from('profiles').select('id').eq('email', email).limit(1).maybeSingle()
    ]);

  if (appAdminError || invitationError || profileError) {
    throw new Error(appAdminError?.message ?? invitationError?.message ?? profileError?.message);
  }

  if (appAdmin || invitation) {
    return true;
  }

  if (!profile) {
    return false;
  }

  const { data: membership, error: membershipError } = await admin
    .from('company_memberships')
    .select('company_id')
    .eq('user_id', profile.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  return Boolean(membership);
}

function loginEmailHtml(loginUrl: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#18211f">
      <h1 style="font-size:24px;margin:0 0 12px">Log in to FF Compliance</h1>
      <p style="margin:0 0 18px">Use this one-time link to open your compliance workspace.</p>
      <p style="margin:0 0 22px">
        <a href="${loginUrl}" style="display:inline-block;background:#12786d;color:#ffffff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:700">Log in</a>
      </p>
      <p style="margin:0;color:#6d7773;font-size:13px">This link is only for the email address that requested it.</p>
    </div>
  `;
}

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    redirect('/?message=Enter%20an%20email%20address');
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    redirect('/?message=Login%20email%20is%20not%20configured%20yet.');
  }

  let canLogIn = false;

  try {
    canLogIn = await hasLoginAccess(email);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify login access.';
    redirect(`/?message=${encodeURIComponent(message)}`);
  }

  if (!canLogIn) {
    redirect('/?message=This%20email%20is%20not%20invited%20yet.%20Ask%20an%20FF%20admin%20to%20add%20you%20first.');
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${env.appBaseUrl}/auth/confirm`
    }
  });

  if (error) {
    redirect(`/?message=${encodeURIComponent(loginErrorMessage(error.message))}`);
  }

  const tokenHash = data.properties?.hashed_token;

  if (!tokenHash) {
    redirect('/?message=Could%20not%20create%20a%20login%20link.');
  }

  const loginUrl = `${env.appBaseUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;
  const resend = new Resend(apiKey);
  const sent = await resend.emails.send({
    from: senderEmail,
    to: email,
    subject: 'Your FF Compliance login link',
    html: loginEmailHtml(loginUrl),
    text: `Log in to FF Compliance: ${loginUrl}`
  });

  if (sent.error) {
    redirect(`/?message=${encodeURIComponent(sent.error.message)}`);
  }

  redirect('/?message=Check%20your%20email%20for%20the%20login%20link');
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/');
}
