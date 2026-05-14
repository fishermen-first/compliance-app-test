export const activeCustomerRoles = ['owner', 'office_user'] as const;

export type ActiveCustomerRole = (typeof activeCustomerRoles)[number];

export function isActiveCustomerRole(role: string): role is ActiveCustomerRole {
  return (activeCustomerRoles as readonly string[]).includes(role);
}

export function isCustomerOwnerRole(role: string | null | undefined) {
  return role === 'owner';
}

export function accessRoleLabel(role: string) {
  const labels: Record<string, string> = {
    app_admin: 'FF Admin',
    owner: 'Owner',
    office_admin: 'Legacy Admin',
    office_user: 'User',
    vessel_user: 'Legacy User'
  };

  return labels[role] ?? role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
