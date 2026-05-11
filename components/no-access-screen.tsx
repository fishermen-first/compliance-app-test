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
          Ask FF Admin to review this email before opening customer workspace data.
        </p>
        <form action={signOut} className="auth-form">
          <button type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
