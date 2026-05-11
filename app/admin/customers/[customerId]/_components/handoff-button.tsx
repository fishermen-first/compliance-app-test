'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { handoffCustomer } from '../users/actions';

export function HandoffButton({
  customerId,
  disabled,
  label,
  title
}: {
  customerId: string;
  disabled: boolean;
  label: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function send() {
    startTransition(async () => {
      const result = await handoffCustomer(customerId);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="cd-handoff-action">
      <button
        className="primary-btn"
        type="button"
        aria-disabled={disabled || pending}
        disabled={disabled || pending}
        title={title}
        onClick={send}
      >
        <Send aria-hidden="true" /> {pending ? 'Sending...' : label}
      </button>
      {message ? <span className="cd-handoff-message" role="status">{message}</span> : null}
    </div>
  );
}
