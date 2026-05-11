'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { type CustomerUser } from '@/lib/customer-detail';
import { bulkResendInvitations } from '../users/actions';

function keyId(userKey: string) {
  return userKey.split(':')[1] ?? userKey;
}

export function UserBulkBar({
  selectedUsers,
  onClear,
  onMessage
}: {
  selectedUsers: CustomerUser[];
  onClear: () => void;
  onMessage: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const invitationIds = selectedUsers.filter((user) => user.kind === 'invitation').map((user) => keyId(user.id));

  function resend() {
    if (invitationIds.length === 0) {
      onMessage('Select pending invitations to resend.');
      return;
    }

    startTransition(async () => {
      const result = await bulkResendInvitations(invitationIds);
      onMessage(result.message);
      onClear();
      router.refresh();
    });
  }

  return (
    <div className="cd-bulk" role="region" aria-label="Bulk actions">
      <span><strong>{selectedUsers.length}</strong> selected</span>
      <div className="bulk-actions">
        <button type="button" onClick={resend} disabled={pending}>
          <RefreshCw aria-hidden="true" /> Resend invite
        </button>
        <button type="button" onClick={() => onMessage('Coming soon.')}>Change role...</button>
        <button type="button" onClick={() => onMessage('Coming soon.')}>Assign owner codes...</button>
        <button type="button" onClick={() => onMessage('Coming soon.')}>Suspend</button>
      </div>
      <button className="clear" type="button" onClick={onClear}>Clear</button>
    </div>
  );
}
