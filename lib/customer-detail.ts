import 'server-only';

import { getAppAdminClassification } from '@/lib/app-admins';
import { type Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';

type Relation<T> = T | T[] | null | undefined;
type AppRole = Database['public']['Enums']['app_role'];

type ProfileRelation = {
  email: string | null;
  full_name: string | null;
};

type MembershipRow = {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profiles: Relation<ProfileRelation>;
};

type InvitationRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole;
  accepted_at: string | null;
  created_at: string;
  invited_by: string | null;
};

type OwnerCodeRow = {
  id: string;
  code: string;
  display_name: string | null;
  user_id: string | null;
  pending_email: string | null;
  handoff_exempt: boolean;
  handoff_exemption_reason: string | null;
  profiles?: Relation<ProfileRelation>;
};

type ItemOwnerRow = {
  id: string;
  owner_current: string | null;
};

export type CustomerRole = AppRole;

export type CustomerUserStatus = 'active' | 'pending' | 'expired' | 'needs-email';

export type Gate = {
  id: 'workbook' | 'codes' | 'users' | 'verify';
  label: string;
  done: boolean;
  detail: string;
  current: boolean;
};

export type CustomerOwnerCode = {
  code: string;
  displayName: string | null;
  records: number;
  handoffExempt?: boolean;
  handoffExemptionReason?: string | null;
};

export type CustomerDetail = {
  id: string;
  name: string;
  timezone: string;
  createdAt: Date;
  vesselCount: number;
  itemCount: number;
  ownerCodes: CustomerOwnerCode[];
  ownerCodeCount: number;
  userCount: number;
  pendingInvitationCount: number;
  gates: Gate[];
  lastEditAt: Date;
  lastEditBy: string | null;
};

export type CustomerUser = {
  id: string;
  kind: 'membership' | 'invitation';
  name: string | null;
  email: string | null;
  role: CustomerRole;
  codes: string[];
  status: CustomerUserStatus;
  lastLoginAt: Date | null;
  invitedBy: string | null;
  invitedAt: Date;
};

export function relation<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizedEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? '';
}

export function toCustomerRole(role: string): CustomerRole {
  if (role === 'owner' || role === 'office_admin' || role === 'office_user' || role === 'vessel_user') {
    return role;
  }

  return 'office_user';
}

export function toAppRole(role: CustomerRole): AppRole {
  return role;
}

function roleLabel(role: CustomerRole) {
  const labels: Record<CustomerRole, string> = {
    owner: 'Owner',
    office_admin: 'Customer Admin',
    office_user: 'Office User',
    vessel_user: 'Vessel User'
  };

  return labels[role];
}

function statusForInvitation(createdAt: string) {
  const fourteenDays = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(createdAt).getTime() <= fourteenDays ? 'pending' : 'expired';
}

function formatGateCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

async function authLastSignIns(userIds: string[]) {
  const admin = createAdminClient();
  const entries = await Promise.all(
    Array.from(new Set(userIds)).map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);

      if (error) return [userId, null] as const;

      return [userId, data.user?.last_sign_in_at ? new Date(data.user.last_sign_in_at) : null] as const;
    })
  );

  return new Map(entries);
}

function itemCountsByOwner(items: ItemOwnerRow[]) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    if (!item.owner_current) return;
    counts.set(item.owner_current, (counts.get(item.owner_current) ?? 0) + 1);
  });

  return counts;
}

function buildOwnerCodeOptions(ownerCodes: OwnerCodeRow[], items: ItemOwnerRow[]) {
  const counts = itemCountsByOwner(items);
  const rows = new Map<string, CustomerOwnerCode>();

  Array.from(counts.keys()).forEach((code) => {
    rows.set(code, { code, displayName: null, records: counts.get(code) ?? 0 });
  });

  ownerCodes.forEach((owner) => {
    rows.set(owner.code, {
      code: owner.code,
      displayName: owner.display_name,
      records: counts.get(owner.code) ?? 0,
      handoffExempt: owner.handoff_exempt,
      handoffExemptionReason: owner.handoff_exemption_reason
    });
  });

  return Array.from(rows.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function isFfAdminEmail(email: string | null | undefined, appAdminEmails: Set<string>) {
  const normalized = normalizedEmail(email);
  return Boolean(normalized && appAdminEmails.has(normalized));
}

function ownerCodeMapped(owner: OwnerCodeRow, appAdminEmails: Set<string>) {
  const profile = relation(owner.profiles);
  const mappedEmail = profile?.email ?? owner.pending_email;

  if (isFfAdminEmail(mappedEmail, appAdminEmails)) return false;

  if (owner.handoff_exempt && owner.handoff_exemption_reason?.trim()) {
    return true;
  }

  return Boolean(owner.user_id || owner.pending_email);
}

function assignCurrentGate(gates: Omit<Gate, 'current'>[]): Gate[] {
  const currentIndex = gates.findIndex((gate) => !gate.done);

  return gates.map((gate, index) => ({
    ...gate,
    current: index === currentIndex
  }));
}

async function verifiedAppAdminEmails() {
  const classification = await getAppAdminClassification();

  if (classification.status === 'unverified') {
    throw new Error('FF-admin classification could not be verified.');
  }

  return classification.appAdminEmails;
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail> {
  const admin = createAdminClient();
  const appAdminEmails = await verifiedAppAdminEmails();

  const [
    companyResult,
    vesselsResult,
    itemsResult,
    ownerCodesResult,
    membershipsResult,
    invitationsResult,
    auditResult
  ] = await Promise.all([
    admin.from('companies').select('id, name, timezone, created_at, updated_at').eq('id', customerId).maybeSingle(),
    admin.from('vessels').select('id', { count: 'exact', head: true }).eq('company_id', customerId).eq('active', true),
    admin.from('compliance_items').select('id, owner_current').eq('company_id', customerId),
    admin
      .from('company_owner_codes')
      .select('id, code, display_name, user_id, pending_email, handoff_exempt, handoff_exemption_reason, profiles!company_owner_codes_user_id_fkey(email, full_name)')
      .eq('company_id', customerId)
      .order('code'),
    admin
      .from('company_memberships')
      .select('id, user_id, role, created_at, profiles(email, full_name)')
      .eq('company_id', customerId)
      .order('created_at', { ascending: true }),
    admin
      .from('company_invitations')
      .select('id, email, display_name, role, accepted_at, created_at, invited_by')
      .eq('company_id', customerId)
      .order('created_at', { ascending: false }),
    admin
      .from('audit_log')
      .select('created_at, actor_id')
      .eq('company_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (companyResult.error) throw new Error(companyResult.error.message);
  if (vesselsResult.error) throw new Error(vesselsResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (ownerCodesResult.error) throw new Error(ownerCodesResult.error.message);
  if (membershipsResult.error) throw new Error(membershipsResult.error.message);
  if (invitationsResult.error) throw new Error(invitationsResult.error.message);
  if (auditResult.error) throw new Error(auditResult.error.message);
  if (!companyResult.data) throw new Error('Customer workspace not found.');

  const company = companyResult.data;
  const items = (itemsResult.data ?? []) as ItemOwnerRow[];
  const ownerCodes = (ownerCodesResult.data ?? []) as unknown as OwnerCodeRow[];
  const memberships = (membershipsResult.data ?? []) as unknown as MembershipRow[];
  const pendingInvitations = ((invitationsResult.data ?? []) as InvitationRow[]).filter((invite) => !invite.accepted_at);
  const ownerCodeOptions = buildOwnerCodeOptions(ownerCodes, items);
  const customerMemberships = memberships.filter((membership) => {
    const profile = relation(membership.profiles);
    return !isFfAdminEmail(profile?.email, appAdminEmails);
  });
  const activeCustomerMemberships = customerMemberships.filter((membership) => {
    const profile = relation(membership.profiles);
    return Boolean(profile?.email);
  });
  const lastSignIns = await authLastSignIns(customerMemberships.map((membership) => membership.user_id));
  const firstLoginVerified = customerMemberships.some((membership) => Boolean(lastSignIns.get(membership.user_id)));
  const mappedOwnerCodes = ownerCodes.filter((owner) => ownerCodeMapped(owner, appAdminEmails)).length;
  const firstUnmappedOwner = ownerCodes.find((owner) => !ownerCodeMapped(owner, appAdminEmails));
  const stagedCustomerUsers = activeCustomerMemberships.length + pendingInvitations.length;

  let lastEditBy: string | null = null;
  const auditRow = auditResult.data;

  if (auditRow?.actor_id) {
    const { data: profile } = await admin.from('profiles').select('full_name, email').eq('id', auditRow.actor_id).maybeSingle();
    lastEditBy = profile?.full_name ?? profile?.email ?? null;
  }

  const gates = assignCurrentGate([
    {
      id: 'workbook',
      label: 'Workbook imported',
      done: items.length > 0,
      detail: `${formatGateCount(items.length, 'item')} · ${formatGateCount(vesselsResult.count ?? 0, 'vessel')}`
    },
    {
      id: 'codes',
      label: 'Owner codes mapped',
      done: ownerCodes.length > 0 && mappedOwnerCodes === ownerCodes.length,
      detail: firstUnmappedOwner ? `${firstUnmappedOwner.code} needs a customer email` : `${mappedOwnerCodes} of ${ownerCodes.length} mapped`
    },
    {
      id: 'users',
      label: 'Customer users added',
      done: stagedCustomerUsers > 0,
      detail: `${activeCustomerMemberships.length} active · ${pendingInvitations.length} pending`
    },
    {
      id: 'verify',
      label: 'First-login verified',
      done: firstLoginVerified,
      detail: firstLoginVerified ? 'At least one customer login found' : 'No customer login yet'
    }
  ]);

  return {
    id: company.id,
    name: company.name,
    timezone: company.timezone,
    createdAt: new Date(company.created_at),
    vesselCount: vesselsResult.count ?? 0,
    itemCount: items.length,
    ownerCodes: ownerCodeOptions,
    ownerCodeCount: ownerCodeOptions.length,
    userCount: activeCustomerMemberships.length + pendingInvitations.length,
    pendingInvitationCount: pendingInvitations.length,
    gates,
    lastEditAt: new Date(auditRow?.created_at ?? company.updated_at),
    lastEditBy
  };
}

export async function getCustomerUsers(customerId: string): Promise<CustomerUser[]> {
  const admin = createAdminClient();
  const appAdminEmails = await verifiedAppAdminEmails();

  const [membershipsResult, invitationsResult, ownerCodesResult] = await Promise.all([
    admin
      .from('company_memberships')
      .select('id, user_id, role, created_at, profiles(email, full_name)')
      .eq('company_id', customerId)
      .order('created_at', { ascending: true }),
    admin
      .from('company_invitations')
      .select('id, email, display_name, role, accepted_at, created_at, invited_by')
      .eq('company_id', customerId)
      .order('created_at', { ascending: false }),
    admin
      .from('company_owner_codes')
      .select('id, code, display_name, user_id, pending_email, handoff_exempt, handoff_exemption_reason')
      .eq('company_id', customerId)
      .order('code')
  ]);

  if (membershipsResult.error) throw new Error(membershipsResult.error.message);
  if (invitationsResult.error) throw new Error(invitationsResult.error.message);
  if (ownerCodesResult.error) throw new Error(ownerCodesResult.error.message);

  const memberships = (membershipsResult.data ?? []) as unknown as MembershipRow[];
  const invitations = (invitationsResult.data ?? []) as InvitationRow[];
  const ownerCodes = (ownerCodesResult.data ?? []) as OwnerCodeRow[];
  const inviterIds = Array.from(new Set(invitations.map((invite) => invite.invited_by).filter(Boolean) as string[]));
  const inviterProfiles = new Map<string, string>();

  if (inviterIds.length > 0) {
    const { data, error } = await admin.from('profiles').select('id, full_name, email').in('id', inviterIds);
    if (error) throw new Error(error.message);

    (data ?? []).forEach((profile) => {
      inviterProfiles.set(profile.id, profile.full_name ?? profile.email ?? 'Unknown user');
    });
  }

  const lastSignIns = await authLastSignIns(memberships.map((membership) => membership.user_id));
  const invitationsByEmail = new Map<string, InvitationRow>();
  invitations.forEach((invite) => {
    const email = normalizedEmail(invite.email);
    if (email && !invitationsByEmail.has(email)) {
      invitationsByEmail.set(email, invite);
    }
  });

  const membershipRows: CustomerUser[] = memberships.flatMap((membership) => {
    const profile = relation(membership.profiles);
    const email = normalizedEmail(profile?.email);

    if (email && appAdminEmails.has(email)) return [];

    const matchedInvitation = email ? invitationsByEmail.get(email) : null;
    const codes = ownerCodes
      .filter((owner) => owner.user_id === membership.user_id || (email && normalizedEmail(owner.pending_email) === email))
      .map((owner) => owner.code);

    return [
      {
        id: `membership:${membership.id}`,
        kind: 'membership',
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        role: toCustomerRole(membership.role),
        codes,
        status: profile?.email ? 'active' : 'needs-email',
        lastLoginAt: lastSignIns.get(membership.user_id) ?? null,
        invitedBy: matchedInvitation?.invited_by ? inviterProfiles.get(matchedInvitation.invited_by) ?? null : null,
        invitedAt: new Date(matchedInvitation?.created_at ?? membership.created_at)
      }
    ];
  });

  const activeMembershipEmails = new Set(
    membershipRows.map((membership) => normalizedEmail(membership.email)).filter(Boolean)
  );
  const invitationRows: CustomerUser[] = invitations
    .filter((invite) => !invite.accepted_at)
    .flatMap((invite) => {
      const email = normalizedEmail(invite.email);

      if (!email || appAdminEmails.has(email) || activeMembershipEmails.has(email)) return [];

      const codes = ownerCodes.filter((owner) => normalizedEmail(owner.pending_email) === email).map((owner) => owner.code);

      return [
        {
          id: `invitation:${invite.id}`,
          kind: 'invitation' as const,
          name: invite.display_name ?? null,
          email: invite.email,
          role: toCustomerRole(invite.role),
          codes,
          status: statusForInvitation(invite.created_at),
          lastLoginAt: null,
          invitedBy: invite.invited_by ? inviterProfiles.get(invite.invited_by) ?? null : null,
          invitedAt: new Date(invite.created_at)
        }
      ];
    });

  return [...membershipRows, ...invitationRows].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return a.invitedAt.getTime() - b.invitedAt.getTime();
  });
}

export const customerRoleLabel: Record<CustomerRole, string> = {
  owner: roleLabel('owner'),
  office_admin: roleLabel('office_admin'),
  office_user: roleLabel('office_user'),
  vessel_user: roleLabel('vessel_user')
};
