import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createComplianceItem } from '@/app/actions/items';
import { NewItemNotesDisclosure, NewItemSchedulePreview } from '@/components/new-item-form-client';
import { frequencyLabelOptions } from '@/lib/compliance';
import { canCreateComplianceItems } from '@/lib/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const complianceAreas = [
  'Vessel Compliance',
  'Food Safety',
  'Environmental',
  'Safety / Drills',
  'Permits & Licenses',
  'Fishing / Quota Reporting',
  'Audits & Certifications',
  'Company Administration',
  'Other'
];

const newItemFormId = 'new-item-form';

type Relation<T> = T | T[] | null | undefined;

type ProfileRelation = {
  full_name: string | null;
  email: string | null;
};

type OwnerCodeRow = {
  code: string;
  display_name: string | null;
  user_id: string | null;
  pending_email: string | null;
  profiles?: Relation<ProfileRelation>;
};

type MembershipRow = {
  user_id: string;
  profiles?: Relation<ProfileRelation>;
};

type InvitationRow = {
  email: string | null;
  display_name: string | null;
  accepted_at: string | null;
};

type OwnerSelectOption = {
  code: string;
  label: string;
};

function relation<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? '';
}

function ownerFallbackName(owner: OwnerCodeRow) {
  const profile = relation(owner.profiles);
  return owner.display_name ?? profile?.full_name ?? profile?.email ?? owner.pending_email;
}

function assignableOwnerCodes(ownerCodes: OwnerCodeRow[]) {
  return ownerCodes.filter((owner) => owner.code.trim());
}

function ownerOptions(ownerCodes: OwnerCodeRow[], memberships: MembershipRow[], invitations: InvitationRow[]) {
  const codes = assignableOwnerCodes(ownerCodes);
  const usedCodes = new Set<string>();
  const options: OwnerSelectOption[] = [];

  const addOption = (owner: OwnerCodeRow, personLabel: string) => {
    if (usedCodes.has(owner.code)) return;
    usedCodes.add(owner.code);
    options.push({
      code: owner.code,
      label: `${personLabel} (${owner.code})`
    });
  };

  memberships.forEach((membership) => {
    const profile = relation(membership.profiles);
    const email = normalizedEmail(profile?.email);
    const personLabel = profile?.full_name ?? profile?.email;
    if (!personLabel) return;

    codes
      .filter((owner) => owner.user_id === membership.user_id || (email && normalizedEmail(owner.pending_email) === email))
      .forEach((owner) => addOption(owner, personLabel));
  });

  invitations
    .filter((invite) => !invite.accepted_at)
    .forEach((invite) => {
      const email = normalizedEmail(invite.email);
      const personLabel = invite.display_name ?? invite.email;
      if (!email || !personLabel) return;

      codes
        .filter((owner) => normalizedEmail(owner.pending_email) === email)
        .forEach((owner) => addOption(owner, personLabel));
    });

  codes.forEach((owner) => {
    if (usedCodes.has(owner.code)) return;

    const ownerName = ownerFallbackName(owner);
    options.push({
      code: owner.code,
      label: ownerName ? `${ownerName} (${owner.code})` : owner.code
    });
  });

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export default async function NewItemPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect('/');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || !canCreateComplianceItems(membership.role)) redirect('/');

  const admin = createAdminClient();
  const [{ data: vessels }, { data: agencies }, { data: ownerCodes }, { data: memberships }, { data: invitations }] = await Promise.all([
    supabase
      .from('vessels')
      .select('id, name')
      .eq('company_id', membership.company_id)
      .eq('active', true)
      .order('name'),
    (supabase as any)
      .from('agencies')
      .select('id, name')
      .eq('company_id', membership.company_id)
      .order('name'),
    admin
      .from('company_owner_codes')
      .select('code, display_name, user_id, pending_email, profiles!company_owner_codes_user_id_fkey(full_name, email)')
      .eq('company_id', membership.company_id)
      .order('code'),
    admin
      .from('company_memberships')
      .select('user_id, profiles(email, full_name)')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: true }),
    admin
      .from('company_invitations')
      .select('email, display_name, accepted_at')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: true })
  ]);

  const owners = ownerOptions(
    (ownerCodes ?? []) as OwnerCodeRow[],
    (memberships ?? []) as unknown as MembershipRow[],
    (invitations ?? []) as InvitationRow[]
  );

  return (
    <main className="form-page new-item-page">
      <section className="new-item-shell" aria-labelledby="new-item-heading">
        <nav className="new-item-breadcrumb" aria-label="Breadcrumb">
          <Link href="/items">Items</Link>
          <span aria-hidden="true">/</span>
          <span>New item</span>
        </nav>

        <header className="new-item-header">
          <div className="setup-brand-row"><span className="brand-mark">FF</span><span>FF Compliance</span></div>
          <p className="eyebrow">New item</p>
          <h1 id="new-item-heading">Add a compliance item</h1>
          <p>Create a renewal, report, permit, audit, inspection, or internal compliance reminder. Only the name is required.</p>
        </header>

        <form id={newItemFormId} data-new-item-form="true" action={createComplianceItem} className="new-item-form">
          <section className="new-item-card" aria-labelledby="new-item-identity">
            <div className="new-item-section-head">
              <span>1</span>
              <h2 id="new-item-identity">Identity</h2>
            </div>

            <div className="new-item-grid new-item-grid-three">
              <label className="new-item-field new-item-full new-item-name-field">
                <span className="new-item-label">Item name <span className="new-item-required" aria-hidden="true">*</span></span>
                <input className="new-item-name-input" name="itemName" placeholder="USCG Certificate of Documentation" required />
              </label>

              <div className="new-item-field">
                <span className="new-item-label" id="new-item-agency-label">Agency / Type</span>
                <select name="agencyId" defaultValue="" aria-labelledby="new-item-agency-label">
                  <option value="">No agency</option>
                  {((agencies ?? []) as Array<{ id: string; name: string }>).map((agency) => (
                    <option value={agency.id} key={agency.id}>{agency.name}</option>
                  ))}
                </select>
                <p className="form-note">Need a new agency? Add it in <Link href="/settings/lists">Reference lists</Link>, then choose it here.</p>
              </div>

              <label className="new-item-field">
                <span className="new-item-label">Item number</span>
                <input name="itemNumber" placeholder="Certificate or permit number" />
              </label>

              <label className="new-item-field">
                <span className="new-item-label">Compliance area</span>
                <select name="complianceArea" defaultValue="Vessel Compliance">
                  {complianceAreas.map((area) => <option value={area} key={area}>{area}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="new-item-card" aria-labelledby="new-item-assignment">
            <div className="new-item-section-head">
              <span>2</span>
              <h2 id="new-item-assignment">Assignment</h2>
            </div>

            <div className="new-item-grid new-item-grid-two">
              <label className="new-item-field">
                <span className="new-item-label">Vessel</span>
                <select name="vesselId" defaultValue="">
                  <option value="">Company-wide</option>
                  {(vessels ?? []).map((vessel) => <option value={vessel.id} key={vessel.id}>{vessel.name}</option>)}
                </select>
              </label>

              <label className="new-item-field">
                <span className="new-item-label">Assigned to</span>
                <select name="ownerCurrent" defaultValue="">
                  <option value="">Unassigned</option>
                  {owners.map((owner) => <option value={owner.code} key={owner.code}>{owner.label}</option>)}
                </select>
              </label>
            </div>

          </section>

          <section className="new-item-card new-item-schedule-card" aria-labelledby="new-item-schedule">
            <div className="new-item-section-head">
              <span>3</span>
              <h2 id="new-item-schedule">Schedule</h2>
            </div>

            <div className="new-item-grid new-item-grid-three">
              <label className="new-item-field">
                <span className="new-item-label">Frequency</span>
                <select name="frequencyLabel" defaultValue="Annually">
                  {frequencyLabelOptions.map((frequency) => <option value={frequency} key={frequency}>{frequency}</option>)}
                </select>
              </label>

              <label className="new-item-field">
                <span className="new-item-label">Start working on</span>
                <input name="startWorkingOn" type="date" />
              </label>

              <label className="new-item-field">
                <span className="new-item-label">Expiration / due date</span>
                <input name="expirationDate" type="date" />
              </label>
            </div>

            <NewItemSchedulePreview formId={newItemFormId} />
            <p className="new-item-schedule-note">Default cadence is <strong>14, 7, and 3 days before</strong> the due date. You can refine lead times, one-off dates, and recipients from the item&rsquo;s <span>Reminder schedule</span> after creating it.</p>
          </section>

          <NewItemNotesDisclosure>
            <label className="new-item-field">
              <span className="new-item-label">Status notes</span>
              <input name="statusNotes" placeholder="Waiting on check from accounting, submitted online, etc." />
            </label>

            <label className="new-item-field">
              <span className="new-item-label">Standing instructions <small>Carried forward each cycle</small></span>
              <textarea name="instructions" placeholder="What to do when this comes due: where to file, who to contact, portal steps..." rows={4} />
            </label>

            <label className="new-item-field">
              <span className="new-item-label">SharePoint link</span>
              <input name="sharepointUrl" type="url" placeholder="https://..." />
            </label>
          </NewItemNotesDisclosure>

          <div className="new-item-form-footer">
            <p>Only Item name is required. Reminder details can be refined after creating.</p>
            <div>
              <Link className="secondary-link" href="/items">Cancel</Link>
              <button type="submit">Create item</button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
