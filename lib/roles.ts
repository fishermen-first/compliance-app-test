export function accessRoleLabel(role: string) {
  const labels: Record<string, string> = {
    app_admin: 'FF Admin',
    owner: 'Customer Admin',
    office_admin: 'Office Admin',
    office_user: 'Office User',
    vessel_user: 'Vessel User'
  };

  return labels[role] ?? role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
