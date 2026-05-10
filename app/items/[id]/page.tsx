import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { completeComplianceItem, updateComplianceItemStatus } from '@/app/actions/items';
import {
  type ComplianceItem,
  displayState,
  formatDate,
  proposedNextDates,
  stateClassName,
  todayIso
} from '@/lib/compliance';
import { createClient } from '@/lib/supabase/server';

type ItemDetailPageProps = { params: { id: string } };

function mapComplianceItem(row: any): ComplianceItem {
  return {
    id: row.id,
    company_id: row.company_id,
    vessel_id: row.vessel_id,
    vessel_name: row.vessels?.name ?? null,
    owner_raw: row.owner_raw,
    owner_current: row.owner_current,
    item_name: row.item_name,
    item_number: row.item_number,
    agency_type: row.agency_type,
    compliance_area: row.compliance_area,
    frequency_label: row.frequency_label,
    recurrence_unit: row.recurrence_unit,
    recurrence_interval: row.recurrence_interval,
    start_working_on: row.start_working_on,
    expiration_date: row.expiration_date,
    status: row.status,
    status_notes: row.status_notes,
    instructions: row.instructions,
    sharepoint_url: row.sharepoint_url,
    completed_at: row.completed_at,
    discontinued_at: row.discontinued_at,
    source_row_number: row.source_row_number,
    previous_item_id: row.previous_item_id
  };
}

function statusOptionLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect('/');

  const [{ data: rawItem }, { data: history }, { data: reminderRules }, { data: recipients }] = await Promise.all([
    supabase
      .from('compliance_items')
      .select('*, vessels(name)')
      .eq('company_id', membership.company_id)
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('compliance_item_status_history')
      .select('from_status, to_status, notes, changed_at')
      .eq('item_id', params.id)
      .order('changed_at', { ascending: false }),
    supabase
      .from('compliance_item_reminder_rules')
      .select('label, trigger_type, days_before, repeat_every_days, active')
      .eq('item_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('compliance_item_notification_recipients')
      .select('recipient_name, recipient_email, recipient_type')
      .eq('item_id', params.id)
      .order('created_at', { ascending: true })
  ]);

  if (!rawItem) notFound();

  const item = mapComplianceItem(rawItem);
  const state = displayState(item);
  const nextDates = proposedNextDates(item);
  const canCreateNext = Boolean(nextDates.nextExpirationDate);

  return (
    <main className="form-page item-detail-page">
      <section className="form-panel detail-panel">
        <div className="detail-header">
          <div>
            <Link className="secondary-link" href="/items">Back to all items</Link>
            <p className="eyebrow">{item.vessel_name ?? 'Company-wide'} · {item.owner_raw ?? 'Unassigned'}</p>
            <h1>{item.item_name}</h1>
          </div>
          <span className={`status-chip state-${stateClassName(state)}`}>{state}</span>
        </div>

        <section className="detail-grid">
          <article>
            <span>Start working on</span>
            <strong>{formatDate(item.start_working_on)}</strong>
          </article>
          <article>
            <span>Expiration date</span>
            <strong>{formatDate(item.expiration_date)}</strong>
          </article>
          <article>
            <span>Frequency</span>
            <strong>{item.frequency_label ?? 'None'}</strong>
          </article>
          <article>
            <span>Agency / Area</span>
            <strong>{item.agency_type ?? 'None'} · {item.compliance_area ?? 'Other'}</strong>
          </article>
        </section>

        <section className="detail-two-col">
          <div className="panel detail-card">
            <p className="eyebrow">Current notes</p>
            <p>{item.status_notes || 'No status notes yet.'}</p>
            <p className="eyebrow">Instructions</p>
            <p>{item.instructions || 'No instructions saved.'}</p>
            {item.sharepoint_url ? <p><a href={item.sharepoint_url}>Open SharePoint link</a></p> : null}
          </div>

          <div className="panel detail-card">
            <p className="eyebrow">Reminder settings</p>
            {(reminderRules ?? []).length === 0 ? <p>No reminder rules yet.</p> : null}
            <ul>
              {(reminderRules ?? []).map((rule: any) => (
                <li key={`${rule.label}-${rule.trigger_type}`}>{rule.label}</li>
              ))}
            </ul>
            <p className="eyebrow">Additional recipients</p>
            {(recipients ?? []).length === 0 ? <p>No additional recipients yet.</p> : null}
            <ul>
              {(recipients ?? []).map((recipient: any) => (
                <li key={recipient.recipient_email}>{recipient.recipient_name ? `${recipient.recipient_name} · ` : ''}{recipient.recipient_email}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="detail-two-col">
          <form action={updateComplianceItemStatus} className="panel detail-card status-form">
            <input type="hidden" name="itemId" value={item.id} />
            <p className="eyebrow">Update status</p>
            <label>
              Status
              <select name="status" defaultValue={item.status}>
                {['not_started', 'in_progress', 'submitted', 'discontinued'].map((status) => <option value={status} key={status}>{statusOptionLabel(status)}</option>)}
              </select>
            </label>
            <label>
              Status notes
              <textarea name="notes" rows={4} placeholder="Add progress notes, submission details, or reason discontinued." />
            </label>
            <button type="submit">Save status</button>
          </form>

          <form action={completeComplianceItem} className="panel detail-card status-form">
            <input type="hidden" name="itemId" value={item.id} />
            <p className="eyebrow">Complete and roll forward</p>
            <label>
              Completion date
              <input name="completionDate" type="date" defaultValue={todayIso()} required />
            </label>
            <label>
              Final notes
              <textarea name="finalNotes" rows={3} placeholder="Final confirmation, certificate filed, or document location." />
            </label>
            <label className="checkbox-row">
              <input name="createNext" type="checkbox" defaultChecked={canCreateNext} disabled={!canCreateNext} />
              Create next item from recurrence
            </label>
            <label>
              Next start working on
              <input name="nextStartWorkingOn" type="date" defaultValue={nextDates.nextStartWorkingOn ?? ''} disabled={!canCreateNext} />
            </label>
            <label>
              Next expiration date
              <input name="nextExpirationDate" type="date" defaultValue={nextDates.nextExpirationDate ?? ''} disabled={!canCreateNext} />
            </label>
            <button type="submit">Mark complete</button>
          </form>
        </section>

        <section className="panel detail-card">
          <p className="eyebrow">Status history</p>
          {(history ?? []).length === 0 ? <p>No status changes recorded yet.</p> : null}
          <ul className="history-list">
            {(history ?? []).map((entry: any) => (
              <li key={`${entry.changed_at}-${entry.to_status}`}>
                <strong>{statusOptionLabel(entry.from_status ?? 'new')} → {statusOptionLabel(entry.to_status)}</strong>
                <span>{new Date(entry.changed_at).toLocaleString()}</span>
                {entry.notes ? <p>{entry.notes}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
