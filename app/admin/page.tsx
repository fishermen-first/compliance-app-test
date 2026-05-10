import { redirect } from 'next/navigation';
import { createInvitation } from '@/app/actions/invitations';
import { createClient } from '@/lib/supabase/server';

type AdminPageProps = {
  searchParams?: { message?: string };
};

function roleLabel(role: string) {
  return role.replaceAll('_', ' ');
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/');
  }

  const { data: isAppAdmin } = await supabase.rpc('is_app_admin');

  if (!isAppAdmin) {
    redirect('/');
  }

  const [{ data: companies }, { data: invitations }] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase
      .from('company_invitations')
      .select('email, role, accepted_at, created_at, companies(name)')
      .order('created_at', { ascending: false })
      .limit(12)
  ]);

  const companyList = companies ?? [];

  return (
    <main className="form-page">
      <section className="form-panel event-form-panel">
        <div className="setup-brand-row"><span className="brand-mark">FF</span><span>FF Compliance</span></div>
        <p className="eyebrow">Admin</p>
        <h1>Invite demo users.</h1>
        <p>Create access for company admins and office users. Invited users will join the right workspace automatically after magic-link sign-in.</p>
        {searchParams?.message ? <p className="form-message">{searchParams.message}</p> : null}

        <form action={createInvitation} className="event-form-grid">
          <label>
            Company
            <select name="companyId" required>
              <option value="">Select company</option>
              {companyList.map((company) => (
                <option value={company.id} key={company.id}>{company.name}</option>
              ))}
            </select>
          </label>

          <label>
            Email
            <input name="email" type="email" placeholder="client@company.com" required />
          </label>

          <label>
            Role
            <select name="role" defaultValue="office_user">
              <option value="owner">Company Admin</option>
              <option value="office_admin">Office Admin</option>
              <option value="office_user">Office User</option>
            </select>
          </label>

          <div className="form-actions wide-field">
            <a className="secondary-link" href="/">Back to dashboard</a>
            <button type="submit">Save invite</button>
          </div>
        </form>

        <div className="admin-list">
          <p className="eyebrow">Recent invitations</p>
          {(invitations ?? []).length === 0 ? <p>No invitations yet.</p> : null}
          {(invitations ?? []).map((invite) => (
            <article key={`${invite.email}-${invite.created_at}`}>
              <strong>{invite.email}</strong>
              <span>{roleLabel(invite.role)} · {invite.accepted_at ? 'Accepted' : 'Pending'}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
