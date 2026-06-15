import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createComplianceItem } from '@/app/actions/items';
import { canCreateComplianceItems } from '@/lib/roles';
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

const frequencyLabels = ['Annually', 'Quarterly', 'Biennially', 'Triennially', 'Twice a year', 'Every 5 Years', 'Every 10 Years', 'Unannounced', 'New Permit', 'NA', 'Custom'];

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

  const { data: vessels } = await supabase
    .from('vessels')
    .select('id, name')
    .eq('company_id', membership.company_id)
    .eq('active', true)
    .order('name');

  return (
    <main className="form-page">
      <section className="form-panel event-form-panel">
        <div className="setup-brand-row"><span className="brand-mark">FF</span><span>FF Compliance</span></div>
        <p className="eyebrow">New item</p>
        <h1>Add a compliance item.</h1>
        <p>Create a renewal, report, permit, audit, inspection, or internal compliance reminder.</p>

        <form action={createComplianceItem} className="event-form-grid">
          <label className="wide-field">
            Item name
            <input name="itemName" placeholder="USCG Certificate of Documentation" required />
          </label>

          <label>
            Owner
            <input name="ownerRaw" placeholder="SN, ES, MA, SN-->ES" />
          </label>

          <label>
            Owner for filters
            <input name="ownerCurrent" placeholder="SN" />
          </label>

          <label>
            Vessel
            <select name="vesselId" defaultValue="">
              <option value="">Company-wide</option>
              {(vessels ?? []).map((vessel) => <option value={vessel.id} key={vessel.id}>{vessel.name}</option>)}
            </select>
          </label>

          <label>
            Item number
            <input name="itemNumber" placeholder="Certificate or permit number" />
          </label>

          <label>
            Agency / Type
            <input name="agencyType" placeholder="USCG, NOAA, EPA" />
          </label>

          <label>
            Compliance area
            <select name="complianceArea" defaultValue="Vessel Compliance">
              {complianceAreas.map((area) => <option value={area} key={area}>{area}</option>)}
            </select>
          </label>

          <label>
            Frequency
            <select name="frequencyLabel" defaultValue="Annually">
              {frequencyLabels.map((frequency) => <option value={frequency} key={frequency}>{frequency}</option>)}
            </select>
          </label>

          <label>
            Start working on
            <input name="startWorkingOn" type="date" />
          </label>

          <label>
            Expiration date
            <input name="expirationDate" type="date" />
          </label>

          <label className="wide-field">
            Status notes
            <input name="statusNotes" placeholder="Waiting on check from accounting, submitted online, etc." />
          </label>

          <label className="wide-field">
            Instructions
            <textarea name="instructions" placeholder="Standing reminder instructions to carry forward." rows={4} />
          </label>

          <label className="wide-field">
            SharePoint link
            <input name="sharepointUrl" type="url" placeholder="https://..." />
          </label>

          <div className="form-actions wide-field">
            <Link className="secondary-link" href="/items">Cancel</Link>
            <button type="submit">Create item</button>
          </div>
        </form>
      </section>
    </main>
  );
}
