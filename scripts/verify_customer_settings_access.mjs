import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

function loadLocalEnv() {
  if (!existsSync('.env.local')) return;

  const text = readFileSync('.env.local', 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

loadLocalEnv();

const required = (name, value) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = required(
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
const readOnly = process.env.VERIFY_SETTINGS_READ_ONLY === 'true';
const allowProductionReadOnly = process.env.VERIFY_SETTINGS_ALLOW_PRODUCTION_READ_ONLY === 'true';
const appBaseUrl = process.env.APP_BASE_URL ?? '';
const looksProduction = appBaseUrl.includes('compliance.fishermenfirst.org') || process.env.VERCEL_ENV === 'production';

if (looksProduction && (!readOnly || !allowProductionReadOnly)) {
  throw new Error('Refusing production settings-access verification unless VERIFY_SETTINGS_READ_ONLY=true and VERIFY_SETTINGS_ALLOW_PRODUCTION_READ_ONLY=true.');
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function signInFixture(label) {
  const email = required(`VERIFY_SETTINGS_${label}_EMAIL`, process.env[`VERIFY_SETTINGS_${label}_EMAIL`]);
  const password = required(`VERIFY_SETTINGS_${label}_PASSWORD`, process.env[`VERIFY_SETTINGS_${label}_PASSWORD`]);
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${label} fixture sign-in failed: ${error.message}`);
  return { client, email };
}

async function readOnlyPreflight() {
  const [
    multiMemberships,
    pendingInvites,
    pendingOwnerCodes,
    customerAdmins,
    appAdminOwnerCodes,
    companies
  ] = await Promise.all([
    service
      .from('company_memberships')
      .select('user_id, company_id'),
    service
      .from('company_invitations')
      .select('email, company_id, accepted_at')
      .is('accepted_at', null),
    service
      .from('company_owner_codes')
      .select('company_id, code, pending_email')
      .not('pending_email', 'is', null),
    service
      .from('company_memberships')
      .select('company_id, role')
      .in('role', ['owner', 'office_admin']),
    service
      .from('company_owner_codes')
      .select('company_id, code, pending_email, profiles!company_owner_codes_user_id_fkey(email)'),
    service
      .from('companies')
      .select('id')
  ]);

  for (const result of [multiMemberships, pendingInvites, pendingOwnerCodes, customerAdmins, appAdminOwnerCodes, companies]) {
    if (result.error) throw new Error(result.error.message);
  }

  const companiesByUser = new Map();
  for (const row of multiMemberships.data ?? []) {
    const companies = companiesByUser.get(row.user_id) ?? new Set();
    companies.add(row.company_id);
    companiesByUser.set(row.user_id, companies);
  }
  const multiMembershipUsers = Array.from(companiesByUser.values()).filter((companies) => companies.size > 1).length;

  const inviteCompaniesByEmail = new Map();
  for (const row of pendingInvites.data ?? []) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!email) continue;
    const companies = inviteCompaniesByEmail.get(email) ?? new Set();
    companies.add(row.company_id);
    inviteCompaniesByEmail.set(email, companies);
  }
  const crossCompanyInviteEmails = Array.from(inviteCompaniesByEmail.values()).filter((companies) => companies.size > 1).length;

  const adminsByCompany = new Map();
  for (const row of customerAdmins.data ?? []) {
    adminsByCompany.set(row.company_id, (adminsByCompany.get(row.company_id) ?? 0) + 1);
  }
  const zeroAdminCompanies = (companies.data ?? []).filter((company) => (adminsByCompany.get(company.id) ?? 0) === 0).length;

  console.log(JSON.stringify({
    mode: 'read-only',
    multiMembershipUsers,
    crossCompanyInviteEmails,
    pendingInviteRows: pendingInvites.data?.length ?? 0,
    pendingEmailOwnerCodeRows: pendingOwnerCodes.data?.length ?? 0,
    customerAdminCompanies: adminsByCompany.size,
    companies: companies.data?.length ?? 0,
    zeroAdminCompanies
  }, null, 2));
}

async function expectRpcFailure(client, name, args, label) {
  const { error } = await client.rpc(name, args);
  if (!error) {
    throw new Error(`${label} unexpectedly succeeded.`);
  }
}

async function fixtureVerification() {
  if (readOnly) {
    await readOnlyPreflight();
    return;
  }

  const companyId = required('VERIFY_SETTINGS_COMPANY_ID', process.env.VERIFY_SETTINGS_COMPANY_ID);
  const owner = await signInFixture('OWNER');
  const officeAdmin = await signInFixture('OFFICE_ADMIN');
  const officeUser = await signInFixture('OFFICE_USER');
  const vesselUser = await signInFixture('VESSEL_USER');
  const nonMember = await signInFixture('NON_MEMBER');
  const ffAdmin = await signInFixture('FF_ADMIN');

  const ownerRows = await owner.client.rpc('settings_get_access_rows', { target_company_id: companyId });
  if (ownerRows.error) throw new Error(`owner settings_get_access_rows failed: ${ownerRows.error.message}`);

  const officeAdminRows = await officeAdmin.client.rpc('settings_get_access_rows', { target_company_id: companyId });
  if (officeAdminRows.error) throw new Error(`office_admin settings_get_access_rows failed: ${officeAdminRows.error.message}`);

  await expectRpcFailure(officeUser.client, 'settings_get_access_rows', { target_company_id: companyId }, 'office_user settings_get_access_rows');
  await expectRpcFailure(vesselUser.client, 'settings_get_access_rows', { target_company_id: companyId }, 'vessel_user settings_get_access_rows');
  await expectRpcFailure(nonMember.client, 'settings_get_access_rows', { target_company_id: companyId }, 'non_member settings_get_access_rows');
  await expectRpcFailure(ffAdmin.client, 'settings_get_access_rows', { target_company_id: companyId }, 'ff_admin settings_get_access_rows');

  const queueCodes = await officeUser.client.rpc('get_queue_owner_codes', { target_company_id: companyId });
  if (queueCodes.error) throw new Error(`office_user get_queue_owner_codes failed: ${queueCodes.error.message}`);
  if ((queueCodes.data ?? []).some((row) => Object.prototype.hasOwnProperty.call(row, 'pending_email'))) {
    throw new Error('get_queue_owner_codes exposed pending_email.');
  }

  console.log(JSON.stringify({
    mode: 'fixture',
    ownerRows: ownerRows.data?.length ?? 0,
    officeAdminRows: officeAdminRows.data?.length ?? 0,
    queueOwnerCodes: queueCodes.data?.length ?? 0
  }, null, 2));
}

fixtureVerification().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
