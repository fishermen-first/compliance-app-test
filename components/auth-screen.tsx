import { Mail } from 'lucide-react';
import { signInWithMagicLink } from '@/app/actions/auth';

export function AuthScreen({ message }: { message?: string }) {
  return (
    <main className="login-shell">
      <header className="login-topbar">
        <div className="login-brand">
          <div className="brand-mark">FF</div>
          <div className="login-brand-name">
            FF Compliance
            <span>Fishermen First</span>
          </div>
        </div>
        <a className="login-help" href="mailto:support@fishermenfirst.org">Need help?</a>
      </header>

      <section className="login-card" aria-labelledby="login-heading">
        <h1 id="login-heading">Sign in to FF Compliance</h1>
        <p className="login-copy">
          Enter your work email and we&rsquo;ll send a one-time login link.
        </p>

        {message ? <p className="login-message">{message}</p> : null}

        <form action={signInWithMagicLink} className="login-form">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" required />
          <button type="submit">
            <Mail aria-hidden="true" />
            <span>Email me a login link</span>
          </button>
        </form>

        <p className="login-fineprint">
          Access is by invitation. If you don&rsquo;t have an account yet, contact your FF admin.
        </p>
      </section>

      <footer className="login-footer">
        <span>&copy; Fishermen First &middot; Compliance Portal</span>
        <span className="login-footer-links">
          <a href="https://fishermenfirst.org/privacy">Privacy</a>
          <a href="https://fishermenfirst.org/terms">Terms</a>
        </span>
      </footer>
    </main>
  );
}
