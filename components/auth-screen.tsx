import { signInWithMagicLink } from '@/app/actions/auth';

export function AuthScreen({ message }: { message?: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">FF</div>
        <p className="eyebrow">FF Compliance</p>
        <h1>Sign in to your compliance workspace.</h1>
        <p className="auth-copy">Use a magic link while we build the first production version. No password needed.</p>
        {message ? <p className="form-message">{message}</p> : null}
        <form action={signInWithMagicLink} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" placeholder="sarah@company.com" required />
          <button type="submit">Send sign-in link</button>
        </form>
      </section>
    </main>
  );
}
