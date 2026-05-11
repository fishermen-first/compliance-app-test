import Link from 'next/link';
import { Eye, Send } from 'lucide-react';
import { type CustomerDetail } from '@/lib/customer-detail';
import { handoffCustomer } from '../users/actions';

export function StatusBar({ customer }: { customer: CustomerDetail }) {
  const done = customer.gates.filter((gate) => gate.done).length;
  const blocking = customer.gates.find((gate) => gate.current);
  const allDone = done === customer.gates.length;
  async function handoffAction() {
    'use server';
    await handoffCustomer(customer.id);
  }

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
        <Link className="ghost-btn" href={`/?as=${customer.id}`}>
          <Eye aria-hidden="true" /> View as customer
        </Link>
        <form action={handoffAction}>
          <button
            className="primary-btn"
            type="submit"
            aria-disabled={!allDone}
            disabled={!allDone}
            title={allDone ? 'Send invite and hand off' : `Disabled until ${blocking?.label ?? 'all gates'} passes`}
          >
            <Send aria-hidden="true" /> Send invite &amp; hand off
          </button>
        </form>
      </div>
    </div>
  );
}
