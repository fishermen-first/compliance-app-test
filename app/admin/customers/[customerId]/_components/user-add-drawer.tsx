'use client';

import { X } from 'lucide-react';
import { createInvitation } from '@/app/actions/invitations';
import { type CustomerOwnerCode } from '@/lib/customer-detail';

export function UserAddDrawer({
  customerId,
  ownerCodes,
  onClose
}: {
  customerId: string;
  ownerCodes: CustomerOwnerCode[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="cd-drawer-scrim" onClick={onClose} />
      <aside className="cd-drawer" role="dialog" aria-label="Add customer user">
        <header className="drawer-head">
          <div className="top">
            <div className="avatar" style={{ background: '#0f6e63' }}>+</div>
            <div>
              <h2>Add staged user</h2>
              <div className="sub">Stage customer access now; invite links are sent from handoff or resend controls.</div>
            </div>
          </div>
          <button className="close" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>

        <form action={createInvitation} className="drawer-form">
          <input type="hidden" name="companyId" value={customerId} />
          <input type="hidden" name="redirectTo" value={`/admin/customers/${customerId}/users`} />
          <div className="drawer-body">
            <div className="drawer-section">
              <div className="section-head">
                <h3>Identity</h3>
              </div>
              <div className="field">
                <label htmlFor="add-name">Full name</label>
                <input id="add-name" name="fullName" type="text" placeholder="Customer user name" />
                <span className="hint">Optional while staging, but saved for the pending invite if provided.</span>
              </div>
              <div className="field">
                <label htmlFor="add-email">Login email</label>
                <input id="add-email" name="email" type="email" placeholder="name@customer.com" required />
                <span className="hint">FF admin emails are rejected for customer access and owner-code mapping.</span>
              </div>
            </div>

            <div className="drawer-section">
              <div className="section-head">
                <h3>Role</h3>
              </div>
              <div className="field">
                <label htmlFor="add-role">Workspace role</label>
                <select id="add-role" name="role" defaultValue="office_user">
                  <option value="owner">owner - workspace owner</option>
                  <option value="office_admin">office_admin - customer admin</option>
                  <option value="office_user">office_user - edit assigned work</option>
                  <option value="vessel_user">vessel_user - view assigned work</option>
                </select>
              </div>
            </div>

            <div className="drawer-section">
              <div className="section-head">
                <h3>Owner codes this user can see</h3>
                <span className="meta">{ownerCodes.length} workbook code{ownerCodes.length === 1 ? '' : 's'}</span>
              </div>
              <div className="codes-grid">
                {ownerCodes.map((owner) => (
                  <label key={owner.code} className="code-check">
                    <input type="checkbox" name="ownerCodes" value={owner.code} />
                    <div>
                      <div className="label">{owner.code}</div>
                      <div className="count">{owner.displayName ?? 'Workbook owner code'} · {owner.records} records</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <footer className="drawer-foot">
            <span className="status-note">Creates access without sending an email.</span>
            <span />
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">Stage user</button>
          </footer>
        </form>
      </aside>
    </>
  );
}
