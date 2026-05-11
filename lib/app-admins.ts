import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

const OWNER_CODE_REJECTION_MESSAGE = 'This email cannot be used for customer owner-code mapping.';

export class OwnerCodeEmailRejectedError extends Error {
  code = 'OWNER_CODE_EMAIL_REJECTED' as const;

  constructor() {
    super(OWNER_CODE_REJECTION_MESSAGE);
    this.name = 'OwnerCodeEmailRejectedError';
  }
}

export function isOwnerCodeEmailRejectedError(error: unknown): boolean {
  return error instanceof OwnerCodeEmailRejectedError;
}

export async function getAppAdminClassification(): Promise<
  { status: 'verified'; appAdminEmails: Set<string> } | { status: 'unverified' }
> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('app_admins').select('email');

    if (error) {
      return { status: 'unverified' };
    }

    return {
      status: 'verified',
      appAdminEmails: new Set((data ?? []).map((row) => row.email.trim().toLowerCase()).filter(Boolean))
    };
  } catch {
    return { status: 'unverified' };
  }
}

export async function assertOwnerEmailMappable(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return;
  }

  // Fail closed when app-admin status cannot be verified.
  const classification = await getAppAdminClassification();

  if (classification.status === 'unverified' || classification.appAdminEmails.has(normalizedEmail)) {
    throw new OwnerCodeEmailRejectedError();
  }
}
