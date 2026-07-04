import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type ReferenceAgency = {
  id: string;
  name: string;
  kind: 'agency' | 'coop' | 'certification' | 'internal';
  itemCount: number;
  aliases: Array<{ id: string; alias: string }>;
};

export type ReferenceVessel = {
  id: string;
  name: string;
  active: boolean;
  itemCount: number;
};

export type ReferenceContact = {
  id: string;
  name: string | null;
  email: string;
  role: 'master' | 'mate' | 'engineer' | 'purser' | 'factory_manager' | 'office' | 'other';
  active: boolean;
};

export type ReferenceContactGroup = {
  id: string;
  name: string;
  members: Array<{ id: string; email: string; name: string | null }>;
};

export type ReferenceListsData = {
  companyId: string;
  agencies: ReferenceAgency[];
  vessels: ReferenceVessel[];
  contacts: ReferenceContact[];
  groups: ReferenceContactGroup[];
};

function relationArray<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function countBy<T extends string | null>(values: T[]) {
  const counts = new Map<string, number>();

  values.forEach((value) => {
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return counts;
}

export async function getReferenceLists(companyId: string): Promise<ReferenceListsData> {
  const supabase = createClient();
  const db = supabase as any;

  const [
    agenciesResult,
    vesselsResult,
    contactsResult,
    groupsResult,
    groupMembersResult,
    agencyItemResult,
    vesselItemResult
  ] = await Promise.all([
    db
      .from('agencies')
      .select('id, name, kind, agency_aliases(id, alias)')
      .eq('company_id', companyId)
      .order('name'),
    db
      .from('vessels')
      .select('id, name, active')
      .eq('company_id', companyId)
      .order('name'),
    db
      .from('external_contacts')
      .select('id, name, email, role, active')
      .eq('company_id', companyId)
      .order('name', { ascending: true, nullsFirst: false })
      .order('email'),
    db
      .from('contact_groups')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name'),
    db
      .from('contact_group_members')
      .select('id, group_id, email, name')
      .eq('company_id', companyId)
      .order('email'),
    db
      .from('compliance_items')
      .select('agency_id')
      .eq('company_id', companyId),
    db
      .from('compliance_items')
      .select('vessel_id')
      .eq('company_id', companyId)
  ]);

  const firstError = [
    agenciesResult,
    vesselsResult,
    contactsResult,
    groupsResult,
    groupMembersResult,
    agencyItemResult,
    vesselItemResult
  ].find((result) => result.error)?.error;

  if (firstError) throw new Error(firstError.message);

  const agencyCounts = countBy((agencyItemResult.data ?? []).map((row: { agency_id: string | null }) => row.agency_id));
  const vesselCounts = countBy((vesselItemResult.data ?? []).map((row: { vessel_id: string | null }) => row.vessel_id));
  const membersByGroup = new Map<string, ReferenceContactGroup['members']>();

  (groupMembersResult.data ?? []).forEach((member: { id: string; group_id: string; email: string; name: string | null }) => {
    const members = membersByGroup.get(member.group_id) ?? [];
    members.push({ id: member.id, email: member.email, name: member.name });
    membersByGroup.set(member.group_id, members);
  });

  return {
    companyId,
    agencies: (agenciesResult.data ?? []).map((agency: any) => ({
      id: agency.id,
      name: agency.name,
      kind: agency.kind,
      itemCount: agencyCounts.get(agency.id) ?? 0,
      aliases: relationArray(agency.agency_aliases).sort((a: any, b: any) => a.alias.localeCompare(b.alias))
    })),
    vessels: (vesselsResult.data ?? []).map((vessel: any) => ({
      id: vessel.id,
      name: vessel.name,
      active: vessel.active,
      itemCount: vesselCounts.get(vessel.id) ?? 0
    })),
    contacts: (contactsResult.data ?? []) as ReferenceContact[],
    groups: (groupsResult.data ?? []).map((group: { id: string; name: string }) => ({
      id: group.id,
      name: group.name,
      members: membersByGroup.get(group.id) ?? []
    }))
  };
}
