import { signOut } from '@/app/actions/auth';

export function NoAccessScreen({ email }: { email?: string | null }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">FF</div>
        <p className="eyebrow">Access pending</p>
        <h1>No workspace access yet.</h1>
        <p className="auth-copy">
          {email ? `${email} is signed in, but it has not been added to a compliance workspace.` : 'This account has not been added to a compliance workspace yet.'}
        </p>
        <p className="auth-copy">
          Ask an FF admin or company admin to add this email before demoing client data.
        </p>
        <form action={signOut} className="auth-form">
          <button type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
