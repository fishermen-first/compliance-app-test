'use client';
// components/admin/add-customer-drawer.tsx
// Slide-in drawer that wraps a <form> bound to the existing createCompany
// server action. Esc / scrim / ✕ close it. No state of its own beyond focus.

import { useEffect, useRef } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { createCompany } from '@/app/actions/companies';

type Props = { open: boolean; onClose: () => void };

export function AddCustomerDrawer({ open, onClose }: Props) {
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Focus the first field once the panel slid in.
    const t = setTimeout(() => firstInputRef.current?.focus(), 220);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, onClose]);

  return (
    <>
      <div
        className="drawer-scrim"
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="New workspace"
        className="add-customer-drawer"
        data-open={open}
      >
        <header className="drawer-head">
          <div>
            <span className="eyebrow">Add customer</span>
            <strong>New workspace</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="drawer-close"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <form action={createCompany} className="admin-create-form drawer-form">
          <label>
            Customer company name
            <input
              ref={firstInputRef}
              name="companyName"
              placeholder="Arctic Storm Management Group"
              required
            />
          </label>
          <label>
            Timezone
            <select name="timezone" defaultValue="America/Los_Angeles">
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="America/Anchorage">Alaska Time</option>
              <option value="America/New_York">Eastern Time</option>
            </select>
          </label>
          <div className="drawer-form-actions">
            <button type="submit" className="btn btn-primary">
              Create customer <ArrowUpRight aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
