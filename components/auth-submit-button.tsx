'use client';

import { useFormStatus } from 'react-dom';

export function AuthSubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-disabled={pending} aria-live="polite">
    {pending ? pendingText : children}
  </button>;
}
