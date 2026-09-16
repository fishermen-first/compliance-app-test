import 'server-only';
import { createHash } from 'node:crypto';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

export const LOGIN_LINK_COOLDOWN_MESSAGE = 'A login link was requested recently. Check your newest email, or wait one minute before requesting another link.';

export async function createLoginLink(admin: ReturnType<typeof createAdminClient>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: reserved, error: reservationError } = await admin.rpc('reserve_login_link_request', {
    p_email_digest: createHash('sha256').update(normalizedEmail).digest('hex')
  });
  if (reservationError) {
    console.error('auth.link_reservation_failed', { code: reservationError.code });
    throw new Error('Unable to request a login link right now. Please try again in one minute.');
  }
  if (!reserved) throw new Error(LOGIN_LINK_COOLDOWN_MESSAGE);

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink', email: normalizedEmail,
    options: { redirectTo: `${env.appBaseUrl}/auth/confirm` }
  });
  if (error || !data.properties?.hashed_token) {
    console.error('auth.link_generation_failed', { code: error?.code, status: error?.status });
    throw new Error('Could not create a login link. Please try again in one minute.');
  }
  // Supabase can return a signup token for a previously unconfirmed user.
  const type = data.properties.verification_type;
  if (!['magiclink', 'signup', 'invite', 'recovery', 'email'].includes(type)) {
    throw new Error('Could not create a login link. Please contact support.');
  }
  return `${env.appBaseUrl}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${encodeURIComponent(type)}`;
}
