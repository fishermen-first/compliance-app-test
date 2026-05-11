import Link from 'next/link';
import { Eye } from 'lucide-react';
import { type CustomerDetail } from '@/lib/customer-detail';
import { HandoffButton } from './handoff-button';

export function StatusBar({ customer }: { customer: CustomerDetail }) {
  const done = customer.gates.filter((gate) => gate.done).length;
  const blocking = customer.gates.find((gate) => gate.current);
  const workbookReady = customer.gates.find((gate) => gate.id === 'workbook')?.done ?? false;
  const codesReady = customer.gates.find((gate) => gate.id === 'codes')?.done ?? false;
  const usersReady = customer.gates.find((gate) => gate.id === 'users')?.done ?? false;
  const verified = customer.gates.find((gate) => gate.id === 'verify')?.done ?? false;
  const inviteReady = workbookReady && codesReady && usersReady;
  const inviteDisabled = !inviteReady || verified || customer.pendingInvitationCount === 0;
  const inviteLabel = verified ? 'Handoff verified' : customer.pendingInvitationCount > 0 ? 'Send pending invites' : 'Awaiting invite';
  const inviteTitle = verified
    ? 'A customer login has been verified.'
    : inviteReady
      ? 'Send login links to pending customer invitations.'
      : `Disabled until ${blocking?.label ?? 'setup gates'} passes`;

  return (
    <div className="cd-status">
      <div className="stage-line">
        <span className="label">Handoff readiness</span>
        <div className="gates" aria-label={`${done} of ${customer.gates.length} gates passed`}>
          {customer.gates.map((gate) => (
            <span
              className={`dot ${gate.done ? 'done' : gate.current ? 'current' : ''}`}
              key={gate.id}
              title={`${gate.label} - ${gate.detail}`}
            />
          ))}
        </div>
        <span className="gate-count"><strong>{done}</strong>/{customer.gates.length} gates passed</span>
        {blocking ? <span className="blocking">· Blocking: <strong>{blocking.label}</strong></span> : null}
      </div>
      <div className="actions">
        <Link className="ghost-btn" href={`/admin/customers/${customer.id}/diagnostics#queue-visibility`}>
          <Eye aria-hidden="true" /> Queue diagnostics
        </Link>
        <HandoffButton customerId={customer.id} disabled={inviteDisabled} label={inviteLabel} title={inviteTitle} />
      </div>
    </div>
  );
}
