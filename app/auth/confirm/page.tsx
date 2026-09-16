import type { Metadata } from 'next';
import { AuthSubmitButton } from '@/components/auth-submit-button';
import { parseConfirmation, safeNext } from '@/lib/auth-confirm';
import { confirmSignIn } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Continue signing in | FF Compliance', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default function ConfirmPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const confirmation = parseConfirmation(searchParams.token_hash, searchParams.type);
  const failed = Boolean(searchParams.error) || !confirmation;
  const workspaceError = searchParams.error === 'workspace';
  return <main className="login-shell">
    <header className="login-topbar">
      <div className="login-brand"><div className="brand-mark">FF</div><div className="login-brand-name">FF Compliance<span>Fishermen First</span></div></div>
      <a className="login-help" href="mailto:support@fishermenfirst.org">Need help?</a>
    </header>
    <section className="login-card" aria-labelledby="confirm-heading">
      <h1 id="confirm-heading">{workspaceError ? 'We couldn’t open your workspace' : failed ? 'Let’s get you a new link' : 'Ready to sign in?'}</h1>
      <p className="login-copy">{failed
        ? workspaceError ? 'You’re signed in, but we couldn’t complete your workspace access. Please contact support.' : searchParams.error === 'unavailable' ? 'We couldn’t complete sign-in right now. Please request a new link and try again.' : 'This link is incomplete, expired, or has already been replaced or used. Request a new link and open the newest email.'
        : 'Continue to open your FF Compliance workspace.'}</p>
      {workspaceError ? <a href="mailto:support@fishermenfirst.org">Contact support</a> : failed ? <a className="btn btn-primary" href="/login">Request a new login link</a>
        : <form action={confirmSignIn} className="login-form">
          <input type="hidden" name="token_hash" value={confirmation!.token_hash} />
          <input type="hidden" name="type" value={confirmation!.type} />
          <input type="hidden" name="next" value={safeNext(searchParams.next)} />
          <AuthSubmitButton pendingText="Signing in…">Continue signing in</AuthSubmitButton>
        </form>}
      <p className="login-fineprint">{failed ? 'If this keeps happening, contact support@fishermenfirst.org.' : 'Only continue if you requested this login link. This link can be used once.'}</p>
    </section>
  </main>;
}
