'use client';

import { Fragment, useMemo, useState } from 'react';
import { Check, Info, Merge, Plus, Ship, UsersRound, X } from 'lucide-react';
import {
  addAgency,
  addContact,
  addContactGroup,
  addContactGroupMember,
  addPastedContacts,
  addVessel,
  mergeAgencies,
  removeAgency,
  removeAgencyAlias,
  removeContact,
  removeContactGroup,
  removeContactGroupMember,
  removeVessel,
  updateAgency,
  updateContact,
  updateContactGroup,
  updateVessel
} from '@/app/actions/reference-lists';
import type { ReferenceAgency, ReferenceContact, ReferenceContactGroup, ReferenceListsData, ReferenceVessel } from '@/lib/reference-lists';

const agencyKinds = [
  ['agency', 'Agency'],
  ['coop', 'Co-op'],
  ['certification', 'Certification'],
  ['internal', 'Internal program']
] as const;

const contactRoles = [
  ['master', 'Master'],
  ['mate', 'Mate'],
  ['engineer', 'Engineer'],
  ['purser', 'Purser'],
  ['factory_manager', 'Factory manager'],
  ['office', 'Office'],
  ['other', 'Other']
] as const;

type ActiveTab = 'agencies' | 'vessels' | 'contacts';

type Modal =
  | { type: 'merge-agency'; agency: ReferenceAgency }
  | { type: 'remove-agency'; agency: ReferenceAgency }
  | { type: 'remove-vessel'; vessel: ReferenceVessel }
  | null;

type PastedContact = {
  key: string;
  name: string;
  email: string;
  role: string;
};

type ReferenceListsPanelProps = {
  data: ReferenceListsData;
  redirectTo: string;
  message?: string | null;
  ffAdminInspecting?: boolean;
};

function hiddenContext(companyId: string, redirectTo: string) {
  return (
    <>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
    </>
  );
}

function itemCountLabel(count: number) {
  return count === 0 ? '-' : `${count} item${count === 1 ? '' : 's'}`;
}

function parseContactLine(line: string) {
  const match = line.match(/^\s*(.*?)\s*<([^>\s]+@[^>\s]+)>\s*$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  }

  const email = line.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { name: '', email };
  }

  return null;
}

function TabButton({
  tab,
  label,
  count,
  activeTab,
  setActiveTab
}: {
  tab: ActiveTab;
  label: string;
  count: number;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}) {
  return (
    <button type="button" className={activeTab === tab ? 'on' : ''} onClick={() => setActiveTab(tab)}>
      {label}
      <span className="sc">{count}</span>
    </button>
  );
}

function AgenciesTab({
  agencies,
  companyId,
  redirectTo,
  openModal
}: {
  agencies: ReferenceAgency[];
  companyId: string;
  redirectTo: string;
  openModal: (modal: Modal) => void;
}) {
  return (
    <section className="ref-list-body">
      <div className="ref-helper">
        <Info aria-hidden="true" />
        <span>Seeded from imported records. Duplicates are expected; merging remembers the old name so future imports resolve it automatically.</span>
      </div>
      <div className="rl-head rl-agency" aria-hidden="true">
        <span>Name</span><span>Kind</span><span>Used by</span><span>Actions</span>
      </div>
      <div role="list" aria-label="Agencies and groups">
        {agencies.map((agency) => (
          <Fragment key={agency.id}>
          <form action={updateAgency} className="rl-row rl-agency" role="listitem">
            {hiddenContext(companyId, redirectTo)}
            <input type="hidden" name="agencyId" value={agency.id} />
            <input type="hidden" name="expectedCount" value="0" />
            <div className="name-cell">
              <input name="name" defaultValue={agency.name} aria-label={`Agency name ${agency.name}`} />
              {agency.aliases.length ? (
                <div className="alias-chips">
                  <span className="al-label">also matches</span>
                  {agency.aliases.map((alias) => (
                    <span className="achip" key={alias.id}>
                      {alias.alias}
                      <button form={`remove-agency-alias-${alias.id}`} type="submit" title={`Forget alias ${alias.alias}`}>x</button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <select name="kind" defaultValue={agency.kind} aria-label={`Kind for ${agency.name}`}>
              {agencyKinds.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
            <span className="used"><b>{agency.itemCount || ''}</b>{agency.itemCount ? ` item${agency.itemCount === 1 ? '' : 's'}` : '-'}</span>
            <div className="rl-acts">
              <button className="save-mini" type="submit">Save</button>
              {agencies.length > 1 ? (
                <button className="merge-btn" type="button" onClick={() => openModal({ type: 'merge-agency', agency })}>
                  <Merge aria-hidden="true" /> Merge...
                </button>
              ) : null}
              {agency.itemCount > 0 ? (
                <button className="xbtn" type="button" title={`Remove ${agency.name}`} onClick={() => openModal({ type: 'remove-agency', agency })}>
                  <X aria-hidden="true" />
                </button>
              ) : (
                <button className="xbtn" formAction={removeAgency} type="submit" title={`Remove ${agency.name}`}>
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          </form>
          {agency.aliases.map((alias) => (
            <form action={removeAgencyAlias} id={`remove-agency-alias-${alias.id}`} key={alias.id} hidden>
              {hiddenContext(companyId, redirectTo)}
              <input type="hidden" name="aliasId" value={alias.id} />
            </form>
          ))}
          </Fragment>
        ))}
      </div>
      <form action={addAgency} className="addbar">
        {hiddenContext(companyId, redirectTo)}
        <div className="addbar-fields">
          <input name="name" placeholder="Agency or group name" aria-label="New agency or group" required />
          <select name="kind" defaultValue="agency" aria-label="New agency kind">
            {agencyKinds.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <button className="addbtn" type="submit"><Plus aria-hidden="true" /> Add agency or group</button>
        </div>
        <span className="an">Removing a name in use asks where to reassign its items first.</span>
      </form>
    </section>
  );
}

function VesselsTab({
  vessels,
  companyId,
  redirectTo,
  openModal
}: {
  vessels: ReferenceVessel[];
  companyId: string;
  redirectTo: string;
  openModal: (modal: Modal) => void;
}) {
  return (
    <section className="ref-list-body">
      <div className="ref-helper">
        <Ship aria-hidden="true" />
        <span>Seeded from the official import. Company-wide scopes like ASMG, ASHCO, and Office are filed as company-wide and never appear here.</span>
      </div>
      <div className="rl-head rl-vessel" aria-hidden="true">
        <span>Vessel name</span><span>Status</span><span>Items</span><span>Actions</span>
      </div>
      <div role="list" aria-label="Vessels">
        {vessels.map((vessel) => (
          <form action={updateVessel} className="rl-row rl-vessel" role="listitem" key={vessel.id}>
            {hiddenContext(companyId, redirectTo)}
            <input type="hidden" name="vesselId" value={vessel.id} />
            <input type="hidden" name="expectedCount" value="0" />
            <input name="name" defaultValue={vessel.name} aria-label={`Vessel name ${vessel.name}`} />
            <select name="active" defaultValue={vessel.active ? 'true' : 'false'} aria-label={`Status for ${vessel.name}`}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <span className="used">{itemCountLabel(vessel.itemCount)}</span>
            <div className="rl-acts">
              <button className="save-mini" type="submit">Save</button>
              {vessel.itemCount > 0 ? (
                <button className="xbtn" type="button" title={`Remove ${vessel.name}`} onClick={() => openModal({ type: 'remove-vessel', vessel })}>
                  <X aria-hidden="true" />
                </button>
              ) : (
                <button className="xbtn" formAction={removeVessel} type="submit" title={`Remove ${vessel.name}`}>
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          </form>
        ))}
      </div>
      <form action={addVessel} className="addbar">
        {hiddenContext(companyId, redirectTo)}
        <div className="addbar-fields">
          <input name="name" placeholder="F/V ..." aria-label="New vessel" required />
          <button className="addbtn" type="submit"><Plus aria-hidden="true" /> Add vessel</button>
        </div>
        <span className="an">Removing a boat in use asks where its items should go, including company-wide.</span>
      </form>
    </section>
  );
}

function ContactsEmptyState() {
  return (
    <div className="contacts-empty">
      <span className="empty-icon"><UsersRound aria-hidden="true" /></span>
      <h3>No external contacts yet</h3>
      <p>People and groups who receive reminders but never log in - captains, mates, engineers, pursers. Add someone once and they appear in every reminder recipient picker. <strong>No logins are ever created here.</strong></p>
    </div>
  );
}

function PasteBox({
  companyId,
  redirectTo,
  existingEmails
}: {
  companyId: string;
  redirectTo: string;
  existingEmails: Set<string>;
}) {
  const [text, setText] = useState('');
  const [staged, setStaged] = useState<PastedContact[] | null>(null);

  const stageRows = () => {
    const seen = new Set(existingEmails);
    const rows: PastedContact[] = [];

    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      const parsed = parseContactLine(line);
      if (!parsed || seen.has(parsed.email)) return;
      seen.add(parsed.email);
      rows.push({ ...parsed, role: 'office', key: parsed.email });
    });

    setStaged(rows);
  };

  const updateRow = (key: string, patch: Partial<PastedContact>) => {
    setStaged((current) => (current ?? []).map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const removeRow = (key: string) => {
    setStaged((current) => (current ?? []).filter((row) => row.key !== key));
  };

  return (
    <div className="pastebox">
      <h3>Paste a list</h3>
      <p>One per line - <code>Name &lt;email&gt;</code> or a bare email. Duplicates are skipped.</p>
      <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={"Capt. Rosa Ide <r.ide@arcticstorm.com>\nj.beck@arcticstorm.com"} aria-label="Paste contacts, one per line" />
      <div className="pb-acts">
        <span className="pb-note">Nothing is saved until you review the staged rows.</span>
        <button className="ref-btn" type="button" onClick={stageRows} disabled={!text.trim()}>Stage rows</button>
      </div>
      {staged !== null ? (
        staged.length === 0 ? (
          <div className="pb-note empty-stage">No new contacts found.</div>
        ) : (
          <form action={addPastedContacts} className="staged">
            {hiddenContext(companyId, redirectTo)}
            <div className="rl-head rl-contact" aria-hidden="true"><span>Name</span><span>Email</span><span>Role</span><span /></div>
            {staged.map((row) => (
              <div className="rl-row rl-contact" key={row.key}>
                <input name="pasteName" value={row.name} placeholder="Name optional" onChange={(event) => updateRow(row.key, { name: event.target.value })} aria-label={`Name for ${row.email}`} />
                <span className="val sub">{row.email}</span>
                <input type="hidden" name="pasteEmail" value={row.email} />
                <select name="pasteRole" value={row.role} onChange={(event) => updateRow(row.key, { role: event.target.value })} aria-label={`Role for ${row.email}`}>
                  {contactRoles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
                <button className="xbtn" type="button" onClick={() => removeRow(row.key)} title={`Do not add ${row.email}`}><X aria-hidden="true" /></button>
              </div>
            ))}
            <div className="staged-foot">
              <button className="ref-btn" type="button" onClick={() => setStaged(null)}>Cancel</button>
              <button className="ref-btn primary" type="submit">Add {staged.length} contact{staged.length === 1 ? '' : 's'}</button>
            </div>
          </form>
        )
      ) : null}
    </div>
  );
}

function ContactsTab({
  contacts,
  groups,
  companyId,
  redirectTo
}: {
  contacts: ReferenceContact[];
  groups: ReferenceContactGroup[];
  companyId: string;
  redirectTo: string;
}) {
  const [filter, setFilter] = useState<'all' | 'people' | 'groups'>('all');
  const showPeople = filter !== 'groups';
  const showGroups = filter !== 'people';
  const existingEmails = useMemo(() => new Set(contacts.map((contact) => contact.email.toLowerCase())), [contacts]);

  return (
    <section className="ref-list-body">
      <div className="ref-helper">
        <UsersRound aria-hidden="true" />
        <span><b>Reminder-only - no logins are ever created here.</b> Groups fan out at send time, so membership changes apply to future reminders.</span>
      </div>
      {contacts.length === 0 && groups.length === 0 ? <ContactsEmptyState /> : null}
      <div className="cfilter" role="group" aria-label="Filter contacts">
        {(['all', 'people', 'groups'] as const).map((value) => (
          <button type="button" className={filter === value ? 'on' : ''} onClick={() => setFilter(value)} key={value}>
            {value === 'all' ? 'All' : value === 'people' ? 'People' : 'Groups'}
          </button>
        ))}
      </div>
      {showPeople ? (
        <div>
          <div className="rl-head rl-contact" aria-hidden="true"><span>Name</span><span>Email</span><span>Role</span><span>Actions</span></div>
          {contacts.map((contact) => (
            <form action={updateContact} className="rl-row rl-contact" role="listitem" key={contact.id}>
              {hiddenContext(companyId, redirectTo)}
              <input type="hidden" name="contactId" value={contact.id} />
              <input name="name" defaultValue={contact.name ?? ''} placeholder="Full name" aria-label={`Name for ${contact.email}`} />
              <input name="email" type="email" defaultValue={contact.email} placeholder="person@company.com" aria-label={`Email for ${contact.email}`} />
              <select name="role" defaultValue={contact.role} aria-label={`Role for ${contact.email}`}>
                {contactRoles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <div className="rl-acts">
                <button className="save-mini" type="submit">Save</button>
                <button className="xbtn" formAction={removeContact} type="submit" title={`Remove ${contact.email}`}><X aria-hidden="true" /></button>
              </div>
            </form>
          ))}
          <form action={addContact} className="addbar compact">
            {hiddenContext(companyId, redirectTo)}
            <div className="addbar-fields">
              <input name="name" placeholder="Name" aria-label="New contact name" />
              <input name="email" type="email" placeholder="person@company.com" aria-label="New contact email" required />
              <select name="role" defaultValue="office" aria-label="New contact role">
                {contactRoles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <button className="addbtn" type="submit"><Plus aria-hidden="true" /> Add person</button>
            </div>
          </form>
        </div>
      ) : null}
      {showGroups ? (
        <div className="group-list" role="list" aria-label="Contact groups">
          {groups.map((group) => (
            <article className="grouprow" role="listitem" key={group.id}>
              <form action={updateContactGroup} className="gr-top">
                {hiddenContext(companyId, redirectTo)}
                <input type="hidden" name="groupId" value={group.id} />
                <div className="gr-name">
                  <span className="gicon"><UsersRound aria-hidden="true" /></span>
                  <div>
                    <input name="name" defaultValue={group.name} aria-label={`Group name ${group.name}`} />
                    <small>Group - reminders fan out to {group.members.length} member{group.members.length === 1 ? '' : 's'}</small>
                  </div>
                </div>
                <div className="rl-acts">
                  <button className="save-mini" type="submit">Save</button>
                  <button className="xbtn" formAction={removeContactGroup} type="submit" title={`Remove group ${group.name}`}><X aria-hidden="true" /></button>
                </div>
              </form>
              <div className="chips-edit">
                {group.members.map((member) => (
                  <form action={removeContactGroupMember} className="mchip" key={member.id}>
                    {hiddenContext(companyId, redirectTo)}
                    <input type="hidden" name="memberId" value={member.id} />
                    <span>{member.email}</span>
                    <button type="submit" title={`Remove ${member.email}`}>x</button>
                  </form>
                ))}
                <form action={addContactGroupMember} className="mchip addchip">
                  {hiddenContext(companyId, redirectTo)}
                  <input type="hidden" name="groupId" value={group.id} />
                  <input name="email" type="email" placeholder="add email + Enter" aria-label={`Add member to ${group.name}`} />
                </form>
              </div>
            </article>
          ))}
          <form action={addContactGroup} className="addbar compact">
            {hiddenContext(companyId, redirectTo)}
            <div className="addbar-fields">
              <input name="name" placeholder="Group name" aria-label="New group name" required />
              <button className="addbtn" type="submit"><Plus aria-hidden="true" /> Add group</button>
            </div>
            <span className="an">Past reminder sends keep their own copy of name and email.</span>
          </form>
        </div>
      ) : null}
      <PasteBox companyId={companyId} redirectTo={redirectTo} existingEmails={existingEmails} />
    </section>
  );
}

function MergeAgencyModal({
  agency,
  agencies,
  companyId,
  redirectTo,
  close
}: {
  agency: ReferenceAgency;
  agencies: ReferenceAgency[];
  companyId: string;
  redirectTo: string;
  close: () => void;
}) {
  const [target, setTarget] = useState('');
  const targetAgency = agencies.find((candidate) => candidate.id === target);

  return (
    <div className="ref-modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form action={mergeAgencies} className="ref-modal" role="dialog" aria-modal="true" aria-label={`Merge ${agency.name}`}>
        {hiddenContext(companyId, redirectTo)}
        <input type="hidden" name="fromAgencyId" value={agency.id} />
        <span className="mtag merge"><Merge aria-hidden="true" /> Merge duplicates</span>
        <h3>Merge &quot;{agency.name}&quot; into...</h3>
        <p>Pick the name that should survive. Everything on the duplicate moves over, then it disappears from the list.</p>
        <label htmlFor="merge-target">Surviving agency</label>
        <select id="merge-target" name="toAgencyId" value={target} onChange={(event) => setTarget(event.target.value)} required>
          <option value="" disabled>Choose an agency...</option>
          {agencies.filter((candidate) => candidate.id !== agency.id).map((candidate) => (
            <option value={candidate.id} key={candidate.id}>{candidate.name} - {candidate.itemCount} items</option>
          ))}
        </select>
        <ul className="consequences">
          <li><Check aria-hidden="true" /> <span>{agency.itemCount} item{agency.itemCount === 1 ? '' : 's'} reassigned to {targetAgency ? `"${targetAgency.name}"` : 'the survivor'}.</span></li>
          <li><Check aria-hidden="true" /> <span>&quot;{agency.name}&quot; is remembered as an alias - future imports auto-resolve it.</span></li>
        </ul>
        <div className="macts">
          <button className="ref-btn" type="button" onClick={close}>Cancel</button>
          <button className="ref-btn primary" type="submit" disabled={!target}>Merge agencies</button>
        </div>
      </form>
    </div>
  );
}

function RemoveAgencyModal({
  agency,
  agencies,
  companyId,
  redirectTo,
  close
}: {
  agency: ReferenceAgency;
  agencies: ReferenceAgency[];
  companyId: string;
  redirectTo: string;
  close: () => void;
}) {
  return (
    <div className="ref-modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form action={removeAgency} className="ref-modal" role="dialog" aria-modal="true" aria-label={`Remove ${agency.name}`}>
        {hiddenContext(companyId, redirectTo)}
        <input type="hidden" name="agencyId" value={agency.id} />
        <input type="hidden" name="expectedCount" value={agency.itemCount} />
        <span className="mtag danger">Remove - in use</span>
        <h3>Remove &quot;{agency.name}&quot;</h3>
        <p><b>{agency.itemCount} item{agency.itemCount === 1 ? '' : 's'}</b> currently use this agency. Choose where they go first - nothing is ever deleted with orphaned items.</p>
        <label htmlFor="remove-agency-target">Reassign its items to</label>
        <select id="remove-agency-target" name="reassignToAgencyId" defaultValue="__unset__">
          <option value="__unset__">Leave agency unset</option>
          {agencies.filter((candidate) => candidate.id !== agency.id).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
        </select>
        <ul className="consequences">
          <li><Check aria-hidden="true" /> <span>{agency.itemCount} items move before &quot;{agency.name}&quot; disappears.</span></li>
          <li><Check aria-hidden="true" /> <span>Item history stays intact.</span></li>
        </ul>
        <div className="macts">
          <button className="ref-btn" type="button" onClick={close}>Cancel</button>
          <button className="ref-btn danger" type="submit">Reassign &amp; remove</button>
        </div>
      </form>
    </div>
  );
}

function RemoveVesselModal({
  vessel,
  vessels,
  companyId,
  redirectTo,
  close
}: {
  vessel: ReferenceVessel;
  vessels: ReferenceVessel[];
  companyId: string;
  redirectTo: string;
  close: () => void;
}) {
  return (
    <div className="ref-modal-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form action={removeVessel} className="ref-modal" role="dialog" aria-modal="true" aria-label={`Remove ${vessel.name}`}>
        {hiddenContext(companyId, redirectTo)}
        <input type="hidden" name="vesselId" value={vessel.id} />
        <input type="hidden" name="expectedCount" value={vessel.itemCount} />
        <span className="mtag danger">Remove - in use</span>
        <h3>Remove &quot;{vessel.name}&quot;</h3>
        <p><b>{vessel.itemCount} item{vessel.itemCount === 1 ? '' : 's'}</b> currently use this vessel. Choose where they go first - nothing is ever deleted with orphaned items.</p>
        <label htmlFor="remove-vessel-target">Reassign its items to</label>
        <select id="remove-vessel-target" name="reassignToVesselId" defaultValue="__unset__">
          <option value="__unset__">Company-wide (no vessel)</option>
          {vessels.filter((candidate) => candidate.id !== vessel.id).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
        </select>
        <ul className="consequences">
          <li><Check aria-hidden="true" /> <span>{vessel.itemCount} items move before &quot;{vessel.name}&quot; disappears.</span></li>
          <li><Check aria-hidden="true" /> <span>Item history stays intact.</span></li>
        </ul>
        <div className="macts">
          <button className="ref-btn" type="button" onClick={close}>Cancel</button>
          <button className="ref-btn danger" type="submit">Reassign &amp; remove</button>
        </div>
      </form>
    </div>
  );
}

export function ReferenceListsPanel({ data, redirectTo, message, ffAdminInspecting = false }: ReferenceListsPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('agencies');
  const [modal, setModal] = useState<Modal>(null);
  const totalContacts = data.contacts.length + data.groups.length;

  return (
    <section className="stack-panel reference-lists-panel ref-page" aria-labelledby="reference-lists-heading">
      <div className="stack-panel-head reference-head">
        <div className="stack-panel-head-text">
          <span className="label">Master data</span>
          <h2 id="reference-lists-heading">Reference lists</h2>
          <p>The canonical names behind every dropdown in this workspace. Fix a name once here and it is fixed everywhere - imports propose new values, they never invent them.</p>
        </div>
      </div>
      {ffAdminInspecting ? (
        <div className="role-banner ref-inspector-banner">FF Admin inspecting workspace - changes still write to this customer.</div>
      ) : null}
      {message ? <div className="inline-message ok" role="status">{message}</div> : null}
      <div className="seg" role="tablist" aria-label="Reference list sections">
        <TabButton tab="agencies" label="Agencies & groups" count={data.agencies.length} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton tab="vessels" label="Vessels" count={data.vessels.length} activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton tab="contacts" label="External contacts" count={totalContacts} activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>
      {activeTab === 'agencies' ? <AgenciesTab agencies={data.agencies} companyId={data.companyId} redirectTo={redirectTo} openModal={setModal} /> : null}
      {activeTab === 'vessels' ? <VesselsTab vessels={data.vessels} companyId={data.companyId} redirectTo={redirectTo} openModal={setModal} /> : null}
      {activeTab === 'contacts' ? <ContactsTab contacts={data.contacts} groups={data.groups} companyId={data.companyId} redirectTo={redirectTo} /> : null}
      {modal?.type === 'merge-agency' ? (
        <MergeAgencyModal agency={modal.agency} agencies={data.agencies} companyId={data.companyId} redirectTo={redirectTo} close={() => setModal(null)} />
      ) : null}
      {modal?.type === 'remove-agency' ? (
        <RemoveAgencyModal agency={modal.agency} agencies={data.agencies} companyId={data.companyId} redirectTo={redirectTo} close={() => setModal(null)} />
      ) : null}
      {modal?.type === 'remove-vessel' ? (
        <RemoveVesselModal vessel={modal.vessel} vessels={data.vessels} companyId={data.companyId} redirectTo={redirectTo} close={() => setModal(null)} />
      ) : null}
    </section>
  );
}
