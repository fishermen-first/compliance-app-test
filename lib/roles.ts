export function accessRoleLabel(role: string) {
  const labels: Record<string, string> = {
    app_admin: 'FF Admin',
    owner: 'Customer Admin',
    office_admin: 'Customer Admin',
    office_user: 'User',
    vessel_user: 'User'
  };

  return labels[role] ?? role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
