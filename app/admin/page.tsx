// app/admin/page.tsx
// Admin Customers index. Server component: fetches portfolio data, computes
// the adaptive status header (single-line at 1 customer, 4-cell KPI grid at
// many), and hands the rows to the <CustomersList> client component.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, Building2, Database, LogOut, Plus, Ship, Users } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { createCompany } from '@/app/actions/companies';
import { getAppAdminClassification } from '@/lib/app-admins';
import { createClient } from '@/lib/supabase/server';
import { CustomersList } from '@/components/admin/customers-list';
import {
  singleCustomerStatus,
  type CompanyIndexRow,
} from '@/lib/admin/customer-readiness';

type AdminPageProps = {
  searchParams?: { message?: string };
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function profileEmail(row: any) {
  return relation(row.profiles)?.email ?? 'Profile pending';
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const classification = await getAppAdminClassification();
  const viewerEmail = userData.user.email?.trim().toLowerCase();

  if (classification.status === 'unverified' || !viewerEmail || !classification.appAdminEmails.has(viewerEmail)) {
    redirect('/');
  }

  const [
    { data: companies },
    { data: memberships },
    { data: invitations },
    { data: vessels },
    { data: items },
    { data: ownerCodes }
  ] = await Promise.all([
    supabase.from('companies').select('id, name, timezone, created_at').order('name', { ascending: true }),
    supabase
      .from('company_memberships')
      .select('company_id, user_id, role, created_at, profiles(email, full_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at, company_id')
      .order('created_at', { ascending: false }),
    supabase.from('vessels').select('id, company_id, active'),
    supabase.from('compliance_items').select('id, company_id'),
    supabase.from('company_owner_codes').select('id, company_id, user_id, pending_email')
  ]);

  const companyRows = companies ?? [];
  const customerMembershipRows = (memberships ?? []).filter(
    (membership) => !classification.appAdminEmails.has(profileEmail(membership).toLowerCase())
  );
  const pendingInvites = (invitations ?? []).filter(
    (invite) => !invite.accepted_at && !classification.appAdminEmails.has((invite.email ?? '').toLowerCase())
  );

  const customerRows: CompanyIndexRow[] = companyRows.map((company) => {
    const companyOwnerCodes = (ownerCodes ?? []).filter((owner) => owner.company_id === company.id);
    return {
      id: company.id,
      name: company.name,
      timezone: company.timezone,
      createdAt: company.created_at,
      vessels: (vessels ?? []).filter((vessel) => vessel.company_id === company.id && vessel.active).length,
      users: customerMembershipRows.filter((membership) => membership.company_id === company.id).length,
      totalItems: (items ?? []).filter((item) => item.company_id === company.id).length,
      ownerCodes: companyOwnerCodes.length,
      mappedOwnerCodes: companyOwnerCodes.filter((owner) => owner.user_id || owner.pending_email).length,
      pendingInvites: pendingInvites.filter((invite) => invite.company_id === company.id).length,
    };
  });

  const totalItems = customerRows.reduce((sum, c) => sum + c.totalItems, 0);
  const totalUsers = customerRows.reduce((sum, c) => sum + c.users, 0);
  const totalPending = customerRows.reduce((sum, c) => sum + c.pendingInvites, 0);
  const totalVessels = customerRows.reduce((sum, c) => sum + c.vessels, 0);
  // "needs handoff" = anything that isn't fully ready. Simple version: any
  // customer with no users yet OR unmapped owner codes OR no workbook.
  const needsHandoff = customerRows.filter((c) => (
    c.totalItems === 0 ||
    (c.ownerCodes > 0 && c.mappedOwnerCodes < c.ownerCodes) ||
    (c.users === 0 && c.pendingInvites === 0)
  )).length;

  const hasCustomers = customerRows.length > 0;
  const singleStatus = singleCustomerStatus(customerRows);
  const drawerMode = customerRows.length > 2;

  return (
    <main className="admin-console admin-index-console">
      <aside className="admin-rail">
        <div className="admin-mark">FF</div>
        <nav className="admin-rail-nav" aria-label="Admin sections">
          <a href="#customers"><Building2 aria-hidden="true" /><span>Customers</span></a>
        </nav>
        <div className="admin-rail-footer">
          <span>Signed in</span>
          <strong>{userData.user.email}</strong>
          <form action={signOut}>
            <button className="admin-logout" type="submit"><LogOut aria-hidden="true" /> Log out</button>
          </form>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Private FF workspace</p>
            <h1>Customers</h1>
          </div>
          <span className="admin-subtle-pill">
            {customerRows.length} customer{customerRows.length === 1 ? '' : 's'}
          </span>
        </header>

        {searchParams?.message ? <p className="form-message admin-message">{searchParams.message}</p> : null}

        {/* Adaptive status strip — one line at 1 customer, KPI grid at many */}
        {singleStatus ? (
          <section className={`single-status single-status-${singleStatus.tone}`} aria-label="Customer status">
            <div className="single-status-body">
              <strong>{singleStatus.primary}</strong>
              <span>{singleStatus.secondary}</span>
            </div>
            <span className="single-status-tag">{singleStatus.doneOf}</span>
          </section>
        ) : hasCustomers ? (
          <section className="admin-stat-grid" aria-label="Customer portfolio summary">
            <article>
              <Building2 aria-hidden="true" />
              <span>Customers</span>
              <strong>{customerRows.length}</strong>
              <p>{needsHandoff} need handoff work</p>
            </article>
            <article>
              <Database aria-hidden="true" />
              <span>Imported work</span>
              <strong>{totalItems}</strong>
              <p>Compliance items across workspaces</p>
            </article>
            <article>
              <Users aria-hidden="true" />
              <span>Customer users</span>
              <strong>{totalUsers}</strong>
              <p>{totalPending} pending invite{totalPending === 1 ? '' : 's'}</p>
            </article>
            <article>
              <Ship aria-hidden="true" />
              <span>Active vessels</span>
              <strong>{totalVessels}</strong>
              <p>Across all customer workspaces</p>
            </article>
          </section>
        ) : null}

        <section className={`admin-index-grid ${drawerMode ? 'admin-index-grid-solo' : ''}`}>
          {hasCustomers ? (
            <CustomersList rows={customerRows} />
          ) : (
            <section className="panel admin-panel" id="customers">
              <div className="admin-panel-heading">
                <div>
                  <span>All customers</span>
                  <h2>No customers yet</h2>
                </div>
              </div>
              <div className="admin-empty-note">
                <p>Create the first customer workspace, then open it to import the workbook, map owner codes, and manage users.</p>
              </div>
            </section>
          )}

          {/* New workspace inline panel — only at ≤2 customers (or empty
              state). At 3+, the drawer is the add-customer affordance. */}
          {!drawerMode && (
            <section className="panel admin-panel" id="new-customer">
              <div className="admin-panel-heading">
                <div>
                  <span>Add customer</span>
                  <h2>New workspace</h2>
                </div>
              </div>
              <form action={createCompany} className="admin-create-form">
                <label>
                  Customer company name
                  <input name="companyName" placeholder="Arctic Storm Management Group" required />
                </label>
                <label>
                  Timezone
                  <select name="timezone" defaultValue="America/Los_Angeles">
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="America/Anchorage">Alaska Time</option>
                    <option value="America/New_York">Eastern Time</option>
                  </select>
                </label>
                <button type="submit">
                  Create customer
                  <ArrowUpRight aria-hidden="true" />
                </button>
              </form>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
