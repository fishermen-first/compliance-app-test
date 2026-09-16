import type { EmailOtpType } from '@supabase/supabase-js';

const allowedTypes = new Set(['magiclink', 'email', 'signup', 'invite', 'recovery']);

export function parseConfirmation(token: unknown, type: unknown) {
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{20,256}$/.test(token) || typeof type !== 'string' || !allowedTypes.has(type)) return null;
  return { token_hash: token, type: type as EmailOtpType };
}

export function safeNext(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return '/';
  return value;
}
