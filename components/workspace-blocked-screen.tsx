import { signOut } from '@/app/actions/auth';

export function WorkspaceBlockedScreen({ email }: { email?: string | null }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">FF</div>
        <p className="eyebrow">Workspace review needed</p>
        <h1>Access is tied to more than one workspace.</h1>
        <p className="auth-copy">
          {email ? `${email} has customer access in more than one workspace.` : 'This account has customer access in more than one workspace.'}
        </p>
        <p className="auth-copy">Ask FF Admin to review access before using the customer workspace.</p>
        <form action={signOut} className="auth-form">
          <button type="submit">Sign out</button>
        </form>
      </section>
    </main>
  );
}
