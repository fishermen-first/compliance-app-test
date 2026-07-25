'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';

type AppRole = Database['public']['Enums']['app_role'];
type SettingsAccessRow = Database['public']['Functions']['settings_get_access_rows']['Returns'][number];

const roleValues = new Set<AppRole>(['owner', 'office_user']);

function requiredString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();

  if (!value) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

function requiredRole(formData: FormData, name: string) {
  const value = requiredString(formData, name);

  if (!roleValues.has(value as AppRole)) {
    throw new Error('Choose a valid workspace role.');
  }

  return value as AppRole;
}

function normalizeOwnerCode(value: string) {
  const code = value.trim();

  if (!code) return null;

  if (code.length > 48) {
    throw new Error('Owner codes must be 48 characters or fewer.');
  }

  if (/[\r\n\t]/.test(code)) {
    throw new Error('Owner codes cannot include tabs or line breaks.');
  }

  return code;
}

function ownerCodes(formData: FormData) {
  return Array.from(new Set(
    formData
      .getAll('ownerCodes')
      .map((value) => normalizeOwnerCode(String(value ?? '')))
      .filter((code): code is string => Boolean(code))
  ));
}

function targetKind(formData: FormData) {
  const value = requiredString(formData, 'targetKind');

  if (value !== 'membership' && value !== 'invitation') {
    throw new Error('Choose a valid access row.');
  }

  return value;
}

function settingsRedirect(message: string) {
  const params = new URLSearchParams();
  params.set('message', message);
  redirect(`/settings?${params.toString()}`);
}

function rpcMessage(error: { message?: string } | null) {
  const message = error?.message ?? 'Settings update failed.';

  if (message.includes('MULTI_COMPANY_CONTEXT_BLOCKED')) {
    return 'This account is tied to more than one workspace. Ask FF Admin to review access.';
  }

  if (message.includes('FF admins must use')) {
    return 'FF Admins manage customer access from the admin console.';
  }

  return message;
}

function ownerCodeMutationMessage(error: { message?: string } | null) {
  const message = error?.message ?? 'Owner-code update failed.';

  if (message.includes('row-level security')) {
    return 'Only workspace owners can add owner codes.';
  }

  if (message.includes('company_owner_codes_code_trimmed_check')) {
    return 'Owner codes cannot include leading or trailing spaces.';
  }

  return message;
}

async function callSettingsRpc<TArgs extends Record<string, unknown>>(name: string, args: TArgs) {
  const supabase = createClient();
  const { error } = await supabase.rpc(name as never, args as never);

  if (error) {
    settingsRedirect(rpcMessage(error));
  }

  revalidatePath('/settings');
}

async function ensureOwnerCodesExist(targetCompanyId: string, codes: string[]) {
  if (codes.length === 0) return;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('company_owner_codes')
    .select('code')
    .eq('company_id', targetCompanyId)
    .in('code', codes);

  if (error) {
    settingsRedirect(ownerCodeMutationMessage(error));
  }

  const existingCodes = new Set((data ?? []).map((row) => row.code));
  const missingCodes = codes.filter((code) => !existingCodes.has(code));

  if (missingCodes.length === 0) return;

  const { error: insertError } = await supabase
    .from('company_owner_codes')
    .upsert(
      missingCodes.map((code) => ({
        company_id: targetCompanyId,
        code,
        updated_at: new Date().toISOString()
      })),
      { onConflict: 'company_id,code' }
    );

  if (insertError) {
    settingsRedirect(ownerCodeMutationMessage(insertError));
  }
}

export async function createOwnerCode(formData: FormData) {
  const targetCompanyId = requiredString(formData, 'companyId');
  const code = normalizeOwnerCode(requiredString(formData, 'ownerCode'));

  if (!code) {
    throw new Error('Owner code is required.');
  }

  await ensureOwnerCodesExist(targetCompanyId, [code]);
  revalidatePath('/settings');
  settingsRedirect(`Owner code ${code} added.`);
}

export async function updateMemberRole(formData: FormData) {
  await callSettingsRpc('settings_update_member_access', {
    target_company_id: requiredString(formData, 'companyId'),
    target_membership_id: requiredString(formData, 'targetId'),
    next_role: requiredRole(formData, 'role')
  });

  settingsRedirect('Member role updated.');
}

export async function removeMemberAccess(formData: FormData) {
  await callSettingsRpc('settings_remove_member_access', {
    target_company_id: requiredString(formData, 'companyId'),
    target_membership_id: requiredString(formData, 'targetId')
  });

  settingsRedirect('Member access removed.');
}

export async function updatePendingInviteRole(formData: FormData) {
  await callSettingsRpc('settings_update_pending_invite_access', {
    target_company_id: requiredString(formData, 'companyId'),
    target_invitation_id: requiredString(formData, 'targetId'),
    next_role: requiredRole(formData, 'role')
  });

  settingsRedirect('Pending invitation updated.');
}

export async function cancelPendingInvite(formData: FormData) {
  await callSettingsRpc('settings_cancel_pending_invite', {
    target_company_id: requiredString(formData, 'companyId'),
    target_invitation_id: requiredString(formData, 'targetId')
  });

  settingsRedirect('Pending invitation canceled.');
}

export async function updateOwnerCodeAssignment(formData: FormData) {
  const targetCompanyId = requiredString(formData, 'companyId');
  const codes = ownerCodes(formData);

  await ensureOwnerCodesExist(targetCompanyId, codes);
  await callSettingsRpc('settings_update_owner_code_assignment', {
    target_company_id: targetCompanyId,
    target_kind: requiredString(formData, 'targetKind'),
    target_id: requiredString(formData, 'targetId'),
    owner_codes: codes
  });

  settingsRedirect('Owner-code assignments updated.');
}

export async function mapOwnerCodeToAccessTarget(formData: FormData) {
  const targetCompanyId = requiredString(formData, 'companyId');
  const selectedTargetKind = targetKind(formData);
  const selectedTargetId = requiredString(formData, 'targetId');
  const code = normalizeOwnerCode(requiredString(formData, 'ownerCode'));

  if (!code) {
    throw new Error('Owner code is required.');
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('settings_get_access_rows', {
    target_company_id: targetCompanyId
  });

  if (error) {
    settingsRedirect(rpcMessage(error));
  }

  const selectedTarget = ((data ?? []) as SettingsAccessRow[]).find((row) => (
    row.target_kind === selectedTargetKind
    && row.target_id === selectedTargetId
  ));

  if (!selectedTarget) {
    return settingsRedirect('Access target not found.');
  }

  const codes = Array.from(new Set([...(selectedTarget.owner_codes ?? []), code]));

  await ensureOwnerCodesExist(targetCompanyId, codes);
  await callSettingsRpc('settings_update_owner_code_assignment', {
    target_company_id: targetCompanyId,
    target_kind: selectedTargetKind,
    target_id: selectedTargetId,
    owner_codes: codes
  });

  settingsRedirect(`Owner code ${code} mapped.`);
}

export async function updateAccessDrawerSettings(formData: FormData) {
  const target_company_id = requiredString(formData, 'companyId');
  const target_kind = targetKind(formData);
  const target_id = requiredString(formData, 'targetId');
  const shouldUpdateDisplayName = formData.get('updateDisplayName') === 'true';
  const shouldUpdateRole = formData.get('updateRole') === 'true';
  const shouldUpdateOwnerCodes = formData.get('updateOwnerCodes') === 'true';

  if (shouldUpdateDisplayName) {
    await callSettingsRpc('settings_update_own_profile', {
      target_company_id,
      next_full_name: requiredString(formData, 'displayName')
    });
  }

  if (shouldUpdateRole) {
    const next_role = requiredRole(formData, 'role');

    if (target_kind === 'membership') {
      await callSettingsRpc('settings_update_member_access', {
        target_company_id,
        target_membership_id: target_id,
        next_role
      });
    } else {
      await callSettingsRpc('settings_update_pending_invite_access', {
        target_company_id,
        target_invitation_id: target_id,
        next_role
      });
    }
  }

  if (shouldUpdateOwnerCodes) {
    const codes = ownerCodes(formData);

    await ensureOwnerCodesExist(target_company_id, codes);
    await callSettingsRpc('settings_update_owner_code_assignment', {
      target_company_id,
      target_kind,
      target_id,
      owner_codes: codes
    });
  }

  settingsRedirect('Access settings updated.');
}
