import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { signInWithMagicLink } from '@/app/actions/auth';

export function AuthScreen({ message }: { message?: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-label="FF Compliance private access">
        <div className="auth-brand-row">
          <div className="brand-mark">FF</div>
          <span>Private Compliance Portal</span>
        </div>
        <h1>Controlled access for FF compliance operations.</h1>
        <p>Accounts are created by FF admins before a login link can be sent.</p>
        <div className="auth-assurance">
          <ShieldCheck aria-hidden="true" />
          <span>Admin-approved access only</span>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-panel-header">
          <span className="auth-lock-icon"><LockKeyhole aria-hidden="true" /></span>
          <p className="eyebrow">Secure login</p>
        </div>
        <h2 id="auth-heading">Log in with your approved email.</h2>
        <p className="auth-copy">Use the email that FF added for your workspace. We will send a one-time login link.</p>
        {message ? <p className="form-message">{message}</p> : null}
        <form action={signInWithMagicLink} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" placeholder="ops@company.com" required />
          <button type="submit">Send login link</button>
        </form>
      </section>
    </main>
  );
}
