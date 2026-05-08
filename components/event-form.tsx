import Link from 'next/link';
import { createComplianceEvent } from '@/app/actions/events';

type VesselOption = {
  id: string;
  name: string;
};

export function EventForm({ vessels }: { vessels: VesselOption[] }) {
  return (
    <main className="form-page">
      <section className="form-panel event-form-panel">
        <div className="setup-brand-row"><span className="brand-mark">FF</span><span>FF Compliance</span></div>
        <p className="eyebrow">New event</p>
        <h1>Add a compliance deadline.</h1>
        <p>Start with the core tracking fields. Reminder rules, recurrence, and vessel responses come next.</p>

        <form action={createComplianceEvent} className="event-form-grid">
          <label className="wide-field">
            Event name
            <input name="title" placeholder="USCG Safety Inspection" required />
          </label>

          <label>
            Vessel
            <select name="vesselId" defaultValue="">
              <option value="">Company-wide</option>
              {vessels.map((vessel) => (
                <option value={vessel.id} key={vessel.id}>{vessel.name}</option>
              ))}
            </select>
          </label>

          <label>
            Due date
            <input name="dueDate" type="date" required />
          </label>

          <label>
            Category
            <select name="category" defaultValue="inspection">
              <option value="inspection">Inspection</option>
              <option value="report">Report</option>
              <option value="audit">Audit</option>
              <option value="permit">Permit</option>
              <option value="training">Training</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            Priority
            <select name="priority" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label>
            Status
            <select name="status" defaultValue="active">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="waiting_on_vessel">Waiting on Vessel</option>
              <option value="office_review">Office Review</option>
              <option value="complete">Complete</option>
            </select>
          </label>

          <label className="wide-field">
            SharePoint link
            <input name="sharepointUrl" type="url" placeholder="https://company.sharepoint.com/..." />
          </label>

          <label className="wide-field">
            Notes
            <textarea name="notes" placeholder="Internal prep notes, renewal context, or instructions." rows={4} />
          </label>

          <div className="form-actions wide-field">
            <Link className="secondary-link" href="/">Cancel</Link>
            <button type="submit">Create event</button>
          </div>
        </form>
      </section>
    </main>
  );
}
