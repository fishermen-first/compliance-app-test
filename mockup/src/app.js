const company = {
  name: "Arctic Storm Management Group",
  vessels: ["F/V Arctic Fjord", "F/V Arctic Storm", "F/V Sea Storm"],
  officeUsers: [
    { id: "sarah", name: "Sarah Nayani", role: "Director of Operations and Compliance", canUpdateStatus: true },
    { id: "emma", name: "Emma Scalisi", role: "", canUpdateStatus: false },
    { id: "meagan", name: "Meagan Anderson", role: "", canUpdateStatus: false },
  ],
};

const lifecycleStages = ["Draft", "Active", "Waiting on Vessel", "Office Review", "Complete"];

const eventTypes = [
  { id: "audit", label: "Audit", color: "teal" },
  { id: "inspection", label: "Inspection", color: "amber" },
  { id: "report", label: "Report Due", color: "blue" },
  { id: "permit", label: "Permit", color: "violet" },
  { id: "training", label: "Training", color: "rose" },
];

const seedEvents = [
  {
    id: 1,
    title: "USCG Safety Inspection",
    type: "inspection",
    dueDate: "2026-05-06",
    vessel: "F/V Arctic Fjord",
    owner: "Emma Scalisi",
    status: "Needs prep",
    lifecycle: "Waiting on Vessel",
    referenceLink: "https://arcticstorm.example/sharepoint/uscg-safety-inspection",
    recurrence: { type: "annually", interval: 1, end: { type: "never" } },
    priority: "High",
    reminders: [30, 14, 7, 1],
    recipients: ["Sarah Nayani", "Emma Scalisi"],
    notes: "Confirm fire suppression tags, EPIRB registration, and drill logs before boarding.",
    lastEmail: "Reminder queued for Apr 22",
    documents: ["Safety checklist", "Last inspection report"],
  },
  {
    id: 2,
    title: "NOAA Monthly Landing Report",
    type: "report",
    dueDate: "2026-05-10",
    vessel: "F/V Arctic Storm",
    owner: "Sarah Nayani",
    status: "Draft started",
    lifecycle: "Office Review",
    referenceLink: "https://arcticstorm.example/sharepoint/noaa-landing-report",
    recurrence: { type: "monthly-date", interval: 1, monthDay: 10, end: { type: "after", count: 12 } },
    priority: "Medium",
    reminders: [14, 7, 2],
    recipients: ["Sarah Nayani", "Meagan Anderson"],
    notes: "Use final April landing totals from plant system once reconciled.",
    lastEmail: "Sent Apr 26 to Sarah Nayani",
    documents: ["Landing export", "Submission receipt"],
  },
  {
    id: 3,
    title: "MSC Chain of Custody Audit",
    type: "audit",
    dueDate: "2026-05-18",
    vessel: "F/V Arctic Storm",
    owner: "Meagan Anderson",
    status: "Scheduled",
    lifecycle: "Active",
    referenceLink: "https://arcticstorm.example/sharepoint/msc-chain-of-custody",
    recurrence: { type: "monthly-weekday", interval: 3, ordinal: 3, weekday: 1, end: { type: "by", date: "2027-12-31" } },
    priority: "High",
    reminders: [30, 14, 7],
    recipients: ["Meagan Anderson", "Sarah Nayani"],
    notes: "Auditor will review purchase records, product segregation, and staff training log.",
    lastEmail: "Sent Apr 18 to Meagan Anderson",
    documents: ["Auditor agenda", "Traceability samples"],
  },
  {
    id: 4,
    title: "Observer Program Registration Renewal",
    type: "permit",
    dueDate: "2026-05-22",
    vessel: "F/V Arctic Storm",
    owner: "Sarah Nayani",
    status: "Not started",
    lifecycle: "Draft",
    referenceLink: "https://arcticstorm.example/sharepoint/observer-registration",
    recurrence: { type: "annually", interval: 1, end: { type: "never" } },
    priority: "Medium",
    reminders: [30, 14, 3],
    recipients: ["Sarah Nayani", "Emma Scalisi"],
    notes: "Renew permit and confirm captain contact information.",
    lastEmail: "Next email Apr 22",
    documents: ["Renewal form"],
  },
  {
    id: 5,
    title: "Crew HACCP Refresher",
    type: "training",
    dueDate: "2026-06-02",
    vessel: "F/V Arctic Storm",
    owner: "Meagan Anderson",
    status: "Planned",
    lifecycle: "Active",
    referenceLink: "https://arcticstorm.example/sharepoint/haccp-refresher",
    recurrence: { type: "monthly-weekday", interval: 6, ordinal: 1, weekday: 2, end: { type: "never" } },
    priority: "Low",
    reminders: [21, 7, 1],
    recipients: ["Meagan Anderson"],
    notes: "Short refresher for receiving, chilling, and corrective action records.",
    lastEmail: "No emails sent yet",
    documents: ["Training roster"],
  },
  {
    id: 6,
    title: "VMS Unit Certification",
    type: "inspection",
    dueDate: "2026-06-08",
    vessel: "F/V Sea Storm",
    owner: "Emma Scalisi",
    status: "Vendor contacted",
    lifecycle: "Waiting on Vessel",
    referenceLink: "https://arcticstorm.example/sharepoint/vms-certification",
    recurrence: { type: "custom", interval: 90, anchorDate: "2026-06-08", end: { type: "never" } },
    priority: "Medium",
    reminders: [30, 14, 7, 1],
    recipients: ["Emma Scalisi"],
    notes: "Technician needs dock access and vessel power available.",
    lastEmail: "No emails sent yet",
    documents: ["Vendor quote", "Device serial list"],
  },
  {
    id: 7,
    title: "State Processor License Renewal",
    type: "permit",
    dueDate: "2026-06-15",
    vessel: "F/V Arctic Storm",
    owner: "Sarah Nayani",
    status: "Waiting on fee",
    lifecycle: "Active",
    referenceLink: "https://arcticstorm.example/sharepoint/processor-license",
    recurrence: { type: "annually", interval: 1, end: { type: "never" } },
    priority: "High",
    reminders: [45, 30, 14, 7],
    recipients: ["Sarah Nayani", "Meagan Anderson"],
    notes: "Need owner signature and payment confirmation before filing.",
    lastEmail: "No emails sent yet",
    documents: ["License packet", "Fee schedule"],
  },
  {
    id: 8,
    title: "Gear Marking Compliance Review",
    type: "audit",
    dueDate: "2026-06-20",
    vessel: "F/V Arctic Fjord",
    owner: "Meagan Anderson",
    status: "Needs prep",
    lifecycle: "Draft",
    referenceLink: "https://arcticstorm.example/sharepoint/gear-marking-review",
    recurrence: { type: "weekly", interval: 2, weekdays: [1, 4], end: { type: "after", count: 10 } },
    priority: "Low",
    reminders: [30, 10],
    recipients: ["Meagan Anderson", "Emma Scalisi"],
    notes: "Review buoy markings and log any replacement tags needed.",
    lastEmail: "No emails sent yet",
    documents: ["Gear inventory"],
  },
];

const state = {
  events: [...seedEvents],
  selectedDate: new Date("2026-05-01T12:00:00"),
  selectedEventId: null,
  currentUserId: "sarah",
  view: "setup-company",
  setup: {
    companyName: "Arctic Storm Management Group",
    legalName: "Arctic Storm Management Group LLC",
    primaryContact: "Sarah Nayani",
    contactEmail: "sarah@arcticstorm.example",
    timezone: "America/Anchorage",
    homePort: "Seattle, WA",
    vessels: [
      { name: "F/V Arctic Fjord", type: "Catcher processor", primaryContact: "Emma Scalisi", email: "fjord@arcticstorm.example", port: "Seattle, WA" },
      { name: "F/V Arctic Storm", type: "Factory trawler", primaryContact: "Sarah Nayani", email: "storm@arcticstorm.example", port: "Dutch Harbor, AK" },
      { name: "F/V Sea Storm", type: "Support vessel", primaryContact: "Meagan Anderson", email: "sea-storm@arcticstorm.example", port: "Kodiak, AK" },
    ],
    people: [
      { name: "Sarah Nayani", email: "sarah@arcticstorm.example", role: "Admin", scope: "Office", canConfirm: true },
      { name: "Emma Scalisi", email: "emma@arcticstorm.example", role: "Office User", scope: "Office", canConfirm: false },
      { name: "Meagan Anderson", email: "meagan@arcticstorm.example", role: "Office User", scope: "Office", canConfirm: false },
      { name: "F/V Arctic Fjord Wheelhouse", email: "fjord@arcticstorm.example", role: "Vessel User", scope: "F/V Arctic Fjord", canConfirm: false },
    ],
    reminderRules: {
      defaultCadence: "30, 14, 7, 1",
      escalationAfterDays: "3",
      sendTime: "08:00",
      requireVesselResponse: true,
      categoryDefaults: [
        { label: "Audits", days: "30, 14, 7" },
        { label: "Inspections", days: "45, 30, 14, 7, 1" },
        { label: "Reports", days: "14, 7, 2" },
        { label: "Permits", days: "60, 30, 14, 7" },
      ],
    },
    firstEvent: {
      title: "USCG Safety Inspection",
      type: "inspection",
      vessel: "F/V Arctic Fjord",
      owner: "Sarah Nayani",
      dueDate: "2026-05-06",
      priority: "High",
      reminders: "30, 14, 7, 1",
      referenceLink: "https://arcticstorm.example/sharepoint/uscg-safety-inspection",
      notes: "Confirm fire suppression tags, EPIRB registration, and drill logs before boarding.",
    },
  },
  filters: {
    type: "all",
    vessel: "all",
    status: "open",
    search: "",
  },
};

const app = document.querySelector("#app");

function currentUser() {
  return company.officeUsers.find((user) => user.id === state.currentUserId) || company.officeUsers[0];
}

function canUpdateStatus() {
  return Boolean(currentUser()?.canUpdateStatus);
}

function dashboardStats() {
  const openEvents = state.events.filter((event) => event.lifecycle !== "Complete");
  const dueSoonEvents = openEvents.filter((event) => daysUntil(event.dueDate) >= 0 && daysUntil(event.dueDate) <= 30);
  const dueTwoWeeksEvents = openEvents.filter((event) => daysUntil(event.dueDate) >= 0 && daysUntil(event.dueDate) <= 14);
  const highOpenEvents = openEvents.filter((event) => event.priority === "High");

  return {
    dueSoon: dueSoonEvents.length,
    dueTwoWeeks: dueTwoWeeksEvents.length,
    highSoon: dueSoonEvents.filter((event) => event.priority === "High").length,
    highOpen: highOpenEvents.length,
    waitingOnVessel: openEvents.filter((event) => event.lifecycle === "Waiting on Vessel").length,
    officeReview: openEvents.filter((event) => event.lifecycle === "Office Review").length,
    overdue: openEvents.filter((event) => daysUntil(event.dueDate) < 0).length,
    open: openEvents.length,
  };
}

function reminderQueueItems(limit = 8) {
  return state.events
    .flatMap((event) =>
      event.reminders.map((days) => {
        const send = new Date(toDate(event.dueDate));
        send.setDate(send.getDate() - days);
        return { event, days, send };
      }),
    )
    .filter((item) => item.send >= getToday())
    .sort((a, b) => a.send - b.send)
    .slice(0, limit);
}
function getToday() {
  return new Date("2026-04-26T12:00:00");
}

function toDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function daysUntil(dateString) {
  const ms = toDate(dateString) - getToday();
  return Math.ceil(ms / 86400000);
}

function formatDate(dateString, options = {}) {
  return toDate(dateString).toLocaleDateString("en-US", {
    month: options.short ? "short" : "long",
    day: "numeric",
    year: options.year ? "numeric" : undefined,
  });
}

function typeFor(id) {
  return eventTypes.find((type) => type.id === id) || eventTypes[0];
}

function selectedEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || null;
}

function filteredEvents() {
  return state.events
    .filter((event) => {
      const matchesType = state.filters.type === "all" || event.type === state.filters.type;
      const matchesVessel = state.filters.vessel === "all" || event.vessel === state.filters.vessel;
      const matchesStatus = state.filters.status !== "open" || event.lifecycle !== "Complete";
      const search = state.filters.search.trim().toLowerCase();
      const matchesSearch =
        !search ||
        [event.title, event.vessel, event.owner, event.lifecycle, event.notes]
          .join(" ")
          .toLowerCase()
          .includes(search);

      return matchesType && matchesVessel && matchesStatus && matchesSearch;
    })
    .sort((a, b) => toDate(a.dueDate) - toDate(b.dueDate));
}

function monthEvents() {
  const year = state.selectedDate.getFullYear();
  const month = state.selectedDate.getMonth();
  return filteredEvents().filter((event) => {
    const date = toDate(event.dueDate);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

function render() {
  if (state.view === "setup-company") {
    app.innerHTML = renderSetupCompany();
    bindEvents();
    return;
  }

  if (state.view === "setup-vessels") {
    app.innerHTML = renderSetupVessels();
    bindEvents();
    return;
  }

  if (state.view === "setup-people") {
    app.innerHTML = renderSetupPeople();
    bindEvents();
    return;
  }

  if (state.view === "setup-reminders") {
    app.innerHTML = renderSetupReminders();
    bindEvents();
    return;
  }

  if (state.view === "setup-first-event") {
    app.innerHTML = renderSetupFirstEvent();
    bindEvents();
    return;
  }

  if (state.view === "setup-review") {
    app.innerHTML = renderSetupReview();
    bindEvents();
    return;
  }

  app.innerHTML = `
    <div class="shell">
      ${renderSidebar()}
      <main class="workspace" id="main-workspace">
        ${renderUserCorner()}
        ${renderTopbar()}
        <section class="dashboard-grid ${state.view === "dashboard" || !state.selectedEventId ? "full-width" : ""}">
          <div class="primary-panel" id="current-view">
            ${renderMainView()}
          </div>
          ${state.view === "dashboard" || !state.selectedEventId ? "" : renderDetails()}
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function renderMainView() {
  const content =
    state.view === "dashboard"
      ? renderDashboard()
      : `${renderControls()}${state.view === "calendar" ? renderCalendar() : renderEventTable()}`;

  return content;
}

function renderSetupCompany() {
  const steps = ["Company", "Vessels", "People", "Reminder Rules", "First Event", "Review"];

  return `
    <main class="setup-shell">
      <section class="setup-header">
        <div class="brand-identity">
          <div class="brand-mark">FF</div>
          <div class="brand-copy">
            <p class="eyebrow">FF Compliance</p>
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <button class="ghost-button" type="button" data-view="dashboard">Preview dashboard</button>
      </section>

      <section class="setup-progress" aria-label="Setup progress">
        ${steps
          .map(
            (step, index) => `
              <div class="setup-step ${index === 0 ? "active" : ""}">
                <span>${index + 1}</span>
                <strong>${step}</strong>
              </div>
            `,
          )
          .join("")}
      </section>

      <section class="setup-card">
        <div class="setup-intro">
          <p class="section-label">Step 1 of 6</p>
          <h2>Company workspace</h2>
          <p>Start with the basic company details that will appear across calendars, reminders, and office workflows.</p>
        </div>

        <form class="setup-form" data-company-setup-form>
          <div class="form-grid">
            <label>
              <span>Workspace name</span>
              <input name="companyName" value="${escapeAttr(state.setup.companyName)}" required />
            </label>
            <label>
              <span>Legal company name</span>
              <input name="legalName" value="${escapeAttr(state.setup.legalName)}" />
            </label>
            <label>
              <span>Primary contact</span>
              <input name="primaryContact" value="${escapeAttr(state.setup.primaryContact)}" required />
            </label>
            <label>
              <span>Contact email</span>
              <input name="contactEmail" type="email" value="${escapeAttr(state.setup.contactEmail)}" required />
            </label>
            <label>
              <span>Timezone</span>
              <select name="timezone">
                <option value="America/Anchorage" ${selected(state.setup.timezone, "America/Anchorage")}>Alaska time</option>
                <option value="America/Los_Angeles" ${selected(state.setup.timezone, "America/Los_Angeles")}>Pacific time</option>
                <option value="America/Denver" ${selected(state.setup.timezone, "America/Denver")}>Mountain time</option>
                <option value="America/Chicago" ${selected(state.setup.timezone, "America/Chicago")}>Central time</option>
                <option value="America/New_York" ${selected(state.setup.timezone, "America/New_York")}>Eastern time</option>
              </select>
            </label>
            <label>
              <span>Primary port / office location</span>
              <input name="homePort" value="${escapeAttr(state.setup.homePort)}" placeholder="Seattle, WA" />
            </label>
          </div>

          <div class="setup-note">
            <strong>Why this matters</strong>
            <span>The timezone controls reminder timing. The workspace name appears in emails and internal screens.</span>
          </div>

          <div class="modal-actions setup-actions">
            <button class="ghost-button" type="button" data-view="dashboard">Skip to dashboard preview</button>
            <button class="primary-button" type="submit">${icon("chevron-right")}<span>Continue to vessels</span></button>
          </div>
        </form>
      </section>
    </main>
  `;
}
function renderSetupVessels() {
  const steps = ["Company", "Vessels", "People", "Reminder Rules", "First Event", "Review"];

  return `
    <main class="setup-shell">
      <section class="setup-header">
        <div class="brand-identity">
          <div class="brand-mark">FF</div>
          <div class="brand-copy">
            <p class="eyebrow">FF Compliance</p>
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <button class="ghost-button" type="button" data-view="dashboard">Preview dashboard</button>
      </section>

      <section class="setup-progress" aria-label="Setup progress">
        ${steps
          .map(
            (step, index) => `
              <div class="setup-step ${index === 1 ? "active" : index === 0 ? "complete" : ""}">
                <span>${index + 1}</span>
                <strong>${step}</strong>
              </div>
            `,
          )
          .join("")}
      </section>

      <section class="setup-card setup-card-wide">
        <div class="setup-intro">
          <p class="section-label">Step 2 of 6</p>
          <h2>Vessels</h2>
          <p>Add the vessels that will receive reminders or have compliance events tracked against them.</p>
        </div>

        <div class="vessel-setup-layout">
          <div class="setup-vessel-list">
            ${state.setup.vessels
              .map(
                (vessel) => `
                  <article class="setup-vessel-card">
                    <div>
                      <strong>${vessel.name}</strong>
                      <span>${vessel.type}</span>
                    </div>
                    <dl>
                      <div><dt>Contact</dt><dd>${vessel.primaryContact}</dd></div>
                      <div><dt>Email</dt><dd>${vessel.email}</dd></div>
                      <div><dt>Port</dt><dd>${vessel.port}</dd></div>
                    </dl>
                  </article>
                `,
              )
              .join("")}
          </div>

          <form class="setup-form setup-add-card" data-vessel-setup-form>
            <div>
              <p class="section-label">Add Vessel</p>
              <h3>New vessel</h3>
            </div>
            <label>
              <span>Vessel name</span>
              <input name="name" placeholder="F/V Example" required />
            </label>
            <label>
              <span>Vessel type</span>
              <select name="type">
                <option>Catcher processor</option>
                <option>Factory trawler</option>
                <option>Longliner</option>
                <option>Support vessel</option>
                <option>Tender</option>
              </select>
            </label>
            <label>
              <span>Primary vessel contact</span>
              <input name="primaryContact" placeholder="Name" />
            </label>
            <label>
              <span>Vessel email</span>
              <input name="email" type="email" placeholder="vessel@example.com" />
            </label>
            <label>
              <span>Home port</span>
              <input name="port" placeholder="Dutch Harbor, AK" />
            </label>
            <button class="ghost-button" type="submit">${icon("plus")}<span>Add vessel</span></button>
          </form>
        </div>

        <div class="setup-note">
          <strong>Why this matters</strong>
          <span>Every event can be tied to a vessel, and vessel contacts can receive reminders or respond when the office is waiting on them.</span>
        </div>

        <div class="modal-actions setup-actions">
          <button class="ghost-button" type="button" data-view="setup-company">Back to company</button>
          <button class="primary-button" type="button" data-action="confirm-vessels">${icon("chevron-right")}<span>Continue to people</span></button>
        </div>
      </section>
    </main>
  `;
}
function renderSetupPeople() {
  const steps = ["Company", "Vessels", "People", "Reminder Rules", "First Event", "Review"];

  return `
    <main class="setup-shell">
      <section class="setup-header">
        <div class="brand-identity">
          <div class="brand-mark">FF</div>
          <div class="brand-copy">
            <p class="eyebrow">FF Compliance</p>
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <button class="ghost-button" type="button" data-view="dashboard">Preview dashboard</button>
      </section>

      <section class="setup-progress" aria-label="Setup progress">
        ${steps
          .map(
            (step, index) => `
              <div class="setup-step ${index === 2 ? "active" : index < 2 ? "complete" : ""}">
                <span>${index + 1}</span>
                <strong>${step}</strong>
              </div>
            `,
          )
          .join("")}
      </section>

      <section class="setup-card setup-card-wide">
        <div class="setup-intro">
          <p class="section-label">Step 3 of 6</p>
          <h2>People and access</h2>
          <p>Invite office users and vessel contacts, then decide who can edit events or confirm completion.</p>
        </div>

        <div class="vessel-setup-layout people-setup-layout">
          <div class="setup-vessel-list">
            ${state.setup.people
              .map(
                (person) => `
                  <article class="setup-person-card">
                    <div class="setup-person-main">
                      <span class="avatar">${initials(person.name)}</span>
                      <div>
                        <strong>${person.name}</strong>
                        <span>${person.email}</span>
                      </div>
                    </div>
                    <dl>
                      <div><dt>Role</dt><dd>${person.role}</dd></div>
                      <div><dt>Scope</dt><dd>${person.scope}</dd></div>
                      <div><dt>Confirm</dt><dd>${person.canConfirm ? "Allowed" : "No"}</dd></div>
                    </dl>
                  </article>
                `,
              )
              .join("")}
          </div>

          <form class="setup-form setup-add-card" data-people-setup-form>
            <div>
              <p class="section-label">Add Person</p>
              <h3>New user</h3>
            </div>
            <label>
              <span>Name</span>
              <input name="name" placeholder="Full name" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="person@example.com" required />
            </label>
            <label>
              <span>Role</span>
              <select name="role">
                <option>Office User</option>
                <option>Admin</option>
                <option>Vessel User</option>
                <option>View Only</option>
              </select>
            </label>
            <label>
              <span>Access scope</span>
              <select name="scope">
                <option>Office</option>
                ${state.setup.vessels.map((vessel) => `<option>${vessel.name}</option>`).join("")}
              </select>
            </label>
            <label class="setup-check-row">
              <input name="canConfirm" type="checkbox" />
              <span>Can confirm completed items</span>
            </label>
            <button class="ghost-button" type="submit">${icon("plus")}<span>Add person</span></button>
          </form>
        </div>

        <div class="setup-note">
          <strong>Why this matters</strong>
          <span>Office users manage events and confirmations. Vessel users only need enough access to receive reminders and respond.</span>
        </div>

        <div class="modal-actions setup-actions">
          <button class="ghost-button" type="button" data-view="setup-vessels">Back to vessels</button>
          <button class="primary-button" type="button" data-action="confirm-people">${icon("chevron-right")}<span>Continue to reminder rules</span></button>
        </div>
      </section>
    </main>
  `;
}
function renderSetupReminders() {
  const steps = ["Company", "Vessels", "People", "Reminder Rules", "First Event", "Review"];

  return `
    <main class="setup-shell">
      <section class="setup-header">
        <div class="brand-identity">
          <div class="brand-mark">FF</div>
          <div class="brand-copy">
            <p class="eyebrow">FF Compliance</p>
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <button class="ghost-button" type="button" data-view="dashboard">Preview dashboard</button>
      </section>

      <section class="setup-progress" aria-label="Setup progress">
        ${steps
          .map(
            (step, index) => `
              <div class="setup-step ${index === 3 ? "active" : index < 3 ? "complete" : ""}">
                <span>${index + 1}</span>
                <strong>${step}</strong>
              </div>
            `,
          )
          .join("")}
      </section>

      <section class="setup-card setup-card-wide">
        <div class="setup-intro">
          <p class="section-label">Step 4 of 6</p>
          <h2>Reminder rules</h2>
          <p>Set the default reminder cadence the office can reuse when new compliance events are created.</p>
        </div>

        <form class="setup-form" data-reminder-setup-form>
          <div class="reminder-rules-layout">
            <section class="setup-add-card reminder-default-card">
              <p class="section-label">Company Defaults</p>
              <label>
                <span>Default reminder days</span>
                <input name="defaultCadence" value="${escapeAttr(state.setup.reminderRules.defaultCadence)}" />
              </label>
              <label>
                <span>Daily send time</span>
                <input name="sendTime" type="time" value="${escapeAttr(state.setup.reminderRules.sendTime)}" />
              </label>
              <label>
                <span>Escalate if no response after</span>
                <select name="escalationAfterDays">
                  <option value="1" ${selected(state.setup.reminderRules.escalationAfterDays, "1")}>1 day</option>
                  <option value="3" ${selected(state.setup.reminderRules.escalationAfterDays, "3")}>3 days</option>
                  <option value="5" ${selected(state.setup.reminderRules.escalationAfterDays, "5")}>5 days</option>
                  <option value="7" ${selected(state.setup.reminderRules.escalationAfterDays, "7")}>7 days</option>
                </select>
              </label>
              <label class="setup-check-row">
                <input name="requireVesselResponse" type="checkbox" ${state.setup.reminderRules.requireVesselResponse ? "checked" : ""} />
                <span>Ask vessels to respond in the app</span>
              </label>
            </section>

            <section class="reminder-category-grid">
              ${state.setup.reminderRules.categoryDefaults
                .map(
                  (rule, index) => `
                    <label class="reminder-rule-card">
                      <span>${rule.label}</span>
                      <input name="category-${index}" value="${escapeAttr(rule.days)}" />
                      <small>Days before due date</small>
                    </label>
                  `,
                )
                .join("")}
            </section>
          </div>

          <div class="setup-note">
            <strong>Why this matters</strong>
            <span>Defaults make event creation faster. Each event can still override its own reminders later.</span>
          </div>

          <div class="modal-actions setup-actions">
            <button class="ghost-button" type="button" data-view="setup-people">Back to people</button>
            <button class="primary-button" type="submit">${icon("chevron-right")}<span>Continue to first event</span></button>
          </div>
        </form>
      </section>
    </main>
  `;
}
function renderSetupFirstEvent() {
  const steps = ["Company", "Vessels", "People", "Reminder Rules", "First Event", "Review"];
  const ownerOptions = state.setup.people.filter((person) => person.role !== "Vessel User");

  return `
    <main class="setup-shell">
      <section class="setup-header">
        <div class="brand-identity">
          <div class="brand-mark">FF</div>
          <div class="brand-copy">
            <p class="eyebrow">FF Compliance</p>
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <button class="ghost-button" type="button" data-view="dashboard">Preview dashboard</button>
      </section>

      <section class="setup-progress" aria-label="Setup progress">
        ${steps
          .map(
            (step, index) => `
              <div class="setup-step ${index === 4 ? "active" : index < 4 ? "complete" : ""}">
                <span>${index + 1}</span>
                <strong>${step}</strong>
              </div>
            `,
          )
          .join("")}
      </section>

      <section class="setup-card setup-card-wide">
        <div class="setup-intro">
          <p class="section-label">Step 5 of 6</p>
          <h2>First event</h2>
          <p>Create one real compliance item so the dashboard is useful as soon as setup is complete.</p>
        </div>

        <form class="setup-form" data-first-event-setup-form>
          <div class="first-event-layout">
            <section class="setup-add-card first-event-form-card">
              <div class="form-grid">
                <label>
                  <span>Event title</span>
                  <input name="title" value="${escapeAttr(state.setup.firstEvent.title)}" required />
                </label>
                <label>
                  <span>Type</span>
                  <select name="type">
                    ${eventTypes.map((type) => `<option value="${type.id}" ${selected(state.setup.firstEvent.type, type.id)}>${type.label}</option>`).join("")}
                  </select>
                </label>
                <label>
                  <span>Vessel</span>
                  <select name="vessel">
                    ${state.setup.vessels.map((vessel) => `<option ${selected(state.setup.firstEvent.vessel, vessel.name)}>${vessel.name}</option>`).join("")}
                  </select>
                </label>
                <label>
                  <span>Office owner</span>
                  <select name="owner">
                    ${ownerOptions.map((person) => `<option ${selected(state.setup.firstEvent.owner, person.name)}>${person.name}</option>`).join("")}
                  </select>
                </label>
                <label>
                  <span>Due date</span>
                  <input name="dueDate" type="date" value="${escapeAttr(state.setup.firstEvent.dueDate)}" required />
                </label>
                <label>
                  <span>Priority</span>
                  <select name="priority">
                    <option ${selected(state.setup.firstEvent.priority, "High")}>High</option>
                    <option ${selected(state.setup.firstEvent.priority, "Medium")}>Medium</option>
                    <option ${selected(state.setup.firstEvent.priority, "Low")}>Low</option>
                  </select>
                </label>
                <label>
                  <span>Reminder days</span>
                  <input name="reminders" value="${escapeAttr(state.setup.firstEvent.reminders)}" />
                </label>
                <label>
                  <span>SharePoint / reference link</span>
                  <input name="referenceLink" value="${escapeAttr(state.setup.firstEvent.referenceLink)}" />
                </label>
              </div>
              <label>
                <span>Notes</span>
                <textarea name="notes">${state.setup.firstEvent.notes}</textarea>
              </label>
            </section>

            <aside class="setup-summary-card">
              <p class="section-label">Uses Your Defaults</p>
              <strong>${state.setup.reminderRules.defaultCadence}</strong>
              <span>Default reminder cadence</span>
              <hr />
              <small>Send time: ${state.setup.reminderRules.sendTime}</small>
              <small>Escalation: ${state.setup.reminderRules.escalationAfterDays} days after no response</small>
              <small>${state.setup.reminderRules.requireVesselResponse ? "Vessel response requested" : "No vessel response required"}</small>
            </aside>
          </div>

          <div class="setup-note">
            <strong>Why this matters</strong>
            <span>Adding the first event proves the vessel, owner, reminder, and lifecycle setup all work together.</span>
          </div>

          <div class="modal-actions setup-actions">
            <button class="ghost-button" type="button" data-view="setup-reminders">Back to reminder rules</button>
            <button class="primary-button" type="submit">${icon("chevron-right")}<span>Review setup</span></button>
          </div>
        </form>
      </section>
    </main>
  `;
}

function renderSetupReview() {
  const steps = ["Company", "Vessels", "People", "Reminder Rules", "First Event", "Review"];
  const officeUsers = state.setup.people.filter((person) => person.scope === "Office").length;
  const vesselUsers = state.setup.people.length - officeUsers;

  return `
    <main class="setup-shell">
      <section class="setup-header">
        <div class="brand-identity">
          <div class="brand-mark">FF</div>
          <div class="brand-copy">
            <p class="eyebrow">FF Compliance</p>
            <h1>Set up your workspace</h1>
          </div>
        </div>
        <button class="ghost-button" type="button" data-view="dashboard">Preview dashboard</button>
      </section>

      <section class="setup-progress" aria-label="Setup progress">
        ${steps
          .map(
            (step, index) => `
              <div class="setup-step ${index === 5 ? "active" : "complete"}">
                <span>${index + 1}</span>
                <strong>${step}</strong>
              </div>
            `,
          )
          .join("")}
      </section>

      <section class="setup-card setup-card-wide">
        <div class="setup-intro">
          <p class="section-label">Step 6 of 6</p>
          <h2>Review setup</h2>
          <p>Confirm the workspace is ready before opening the compliance dashboard.</p>
        </div>

        <div class="review-grid">
          <article class="review-card">
            <span>Company</span>
            <strong>${state.setup.companyName}</strong>
            <small>${state.setup.homePort} · ${state.setup.timezone}</small>
          </article>
          <article class="review-card">
            <span>Vessels</span>
            <strong>${state.setup.vessels.length}</strong>
            <small>${state.setup.vessels.map((vessel) => vessel.name).join(", ")}</small>
          </article>
          <article class="review-card">
            <span>People</span>
            <strong>${state.setup.people.length}</strong>
            <small>${officeUsers} office · ${vesselUsers} vessel contacts</small>
          </article>
          <article class="review-card">
            <span>Reminder Rules</span>
            <strong>${state.setup.reminderRules.defaultCadence}</strong>
            <small>${state.setup.reminderRules.sendTime} send time · ${state.setup.reminderRules.escalationAfterDays} day escalation</small>
          </article>
        </div>

        <section class="setup-review-event">
          <p class="section-label">First Event</p>
          <div>
            <strong>${state.setup.firstEvent.title}</strong>
            <span>${state.setup.firstEvent.vessel} · ${state.setup.firstEvent.owner} · Due ${formatDate(state.setup.firstEvent.dueDate, { short: true, year: true })}</span>
          </div>
          <em class="due-chip urgent">${state.setup.firstEvent.priority}</em>
        </section>

        <div class="setup-note">
          <strong>What happens next</strong>
          <span>The dashboard opens with your first event, reminder defaults, vessels, and users ready to build on.</span>
        </div>

        <div class="modal-actions setup-actions">
          <button class="ghost-button" type="button" data-view="setup-first-event">Back to first event</button>
          <button class="primary-button" type="button" data-action="finish-setup">${icon("check")}<span>Open dashboard</span></button>
        </div>
      </section>
    </main>
  `;
}
function renderSidebar() {
  return `
    <aside class="sidebar compact-sidebar">
      <div class="brand-block">
        <div class="brand-identity">
          <div class="brand-mark">AS</div>
          <div class="brand-copy">
            <p class="eyebrow">FF Compliance</p>
            <h1>${company.name}</h1>
          </div>
        </div>
        <select class="brand-user-switcher" data-current-user aria-label="Current office user">
          ${company.officeUsers
            .map((user) => `<option value="${user.id}" ${selected(state.currentUserId, user.id)}>${user.name}</option>`)
            .join("")}
        </select>
      </div>

      <nav class="side-nav" aria-label="Main navigation">
        <button class="nav-item ${state.view === "dashboard" ? "active" : ""}" type="button" data-view="dashboard">
          ${icon("activity")}
          <span>Dashboard</span>
        </button>
        <button class="nav-item ${state.view === "calendar" ? "active" : ""}" type="button" data-view="calendar">
          ${icon("calendar")}
          <span>Calendar</span>
        </button>
        <button class="nav-item ${state.view === "list" ? "active" : ""}" type="button" data-view="list">
          ${icon("list")}
          <span>Event List</span>
        </button>
        <button class="nav-item" type="button" data-action="mock-reminders">
          ${icon("mail")}
          <span>Email Queue</span>
        </button>
        <button class="nav-item" type="button" data-action="mock-settings">
          ${icon("settings")}
          <span>Rules</span>
        </button>
      </nav>
    </aside>
  `;
}
function renderUserCorner() {
  return `
    <div class="profile-pill workspace-user-corner">
      <span class="avatar small-avatar">${initials(currentUser().name)}</span>
      <select class="topbar-user-switcher" data-current-user aria-label="Current office user">
        ${company.officeUsers
          .map((user) => `<option value="${user.id}" ${selected(state.currentUserId, user.id)}>${user.name}</option>`)
          .join("")}
      </select>
    </div>
  `;
}
function renderTopbar() {
  const next = filteredEvents()[0];
  const nextDays = next ? daysUntil(next.dueDate) : null;
  const dueSoon = nextDays !== null && nextDays <= 14;

  return `
    <header class="topbar ops-topbar">
      <div class="topbar-actions">
        <div class="next-due ${dueSoon ? "is-urgent" : ""}">
          ${
            next
              ? `
                <div class="next-due-date">
                  <span>Next due</span>
                  <strong>${formatDate(next.dueDate, { short: true })}</strong>
                </div>
                <div class="next-due-detail">
                  <strong>${next.title}</strong>
                  <span>${next.vessel} · ${nextDays} days · ${next.owner}</span>
                </div>
                <div class="next-due-status">
                  <span>${dueSoon ? "Due soon" : "Scheduled"}</span>
                </div>
              `
              : `
                <div class="next-due-detail empty-next-due">
                  <strong>Nothing scheduled</strong>
                  <span>No open compliance dates</span>
                </div>
              `
          }
        </div>
        <button class="ghost-button email-queue-button" type="button" data-action="mock-reminders" aria-label="Open email queue">
          ${icon("mail")}
          <span>Email Queue</span>
        </button>
        <button class="primary-button" type="button" data-action="new-event">
          ${icon("plus")}
          <span>New Event</span>
        </button>
        <div class="profile-pill">
          <span class="avatar small-avatar">${initials(currentUser().name)}</span>
          <select class="topbar-user-switcher" data-current-user aria-label="Current office user">
            ${company.officeUsers
              .map((user) => `<option value="${user.id}" ${selected(state.currentUserId, user.id)}>${user.name}</option>`)
              .join("")}
          </select>
        </div>
      </div>
    </header>
  `;
}

function renderDashboard() {
  const stats = dashboardStats();
  const upcoming = filteredEvents().slice(0, 5);
  const vesselCounts = company.vessels.map((vessel) => ({
    vessel,
    count: state.events.filter((event) => event.vessel === vessel && event.lifecycle !== "Complete").length,
  }));
  const maxVesselCount = Math.max(...vesselCounts.map((item) => item.count), 1);
  const nextReminder = reminderQueueItems(1)[0];
  const weekItems = filteredEvents().filter((event) => daysUntil(event.dueDate) <= 14).length;
  const recentActivity = [
    "Emma Scalisi added a SharePoint link to inspection prep",
    "Sarah Nayani moved landing report to Office Review",
    "System queued 3 reminder emails for tomorrow",
  ];

  return `
    <div class="dashboard-home ops-dashboard">
      <div class="metric-grid compact-metrics">
        <button class="metric-card" type="button" data-view="list">
          <span>Next 30 days</span>
          <strong>${stats.dueSoon}</strong>
          <small><i class="metric-dot urgent-dot"></i>${stats.highSoon} high priority</small>
        </button>
        <button class="metric-card" type="button" data-view="list">
          <span>Waiting on vessel</span>
          <strong>${stats.waitingOnVessel}</strong>
          <small><i class="metric-dot amber-dot"></i>Response needed</small>
        </button>
        <button class="metric-card" type="button" data-view="list">
          <span>Office review</span>
          <strong>${stats.officeReview}</strong>
          <small>Ready to confirm</small>
        </button>
        <button class="metric-card" type="button" data-view="list">
          <span>High priority</span>
          <strong>${stats.highOpen}</strong>
          <small><i class="metric-dot urgent-dot"></i>Open items</small>
        </button>
      </div>

      <div class="ops-dashboard-grid">
        <section class="dashboard-panel priority-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Priority Queue</p>
              <h3>Upcoming deadlines</h3>
            </div>
            <div class="deadline-legend" aria-label="Deadline urgency legend">
              <span><i class="legend-dot urgent-dot"></i>≤7d</span>
              <span><i class="legend-dot amber-dot"></i>≤14d</span>
              <span><i class="legend-dot calm-dot"></i>≤30d</span>
            </div>
          </div>
          <div class="work-list priority-list">
            ${upcoming
              .map((event) => {
                const due = daysUntil(event.dueDate);
                return `
                  <button class="work-row priority-row" type="button" data-select-event="${event.id}">
                    <span class="type-dot ${typeFor(event.type).color}"></span>
                    <span class="priority-main">
                      <strong>${event.title}</strong>
                      <small><mark>${event.vessel}</mark>${event.owner}</small>
                    </span>
                    <span class="lifecycle-pill ${lifecycleClass(event.lifecycle)}">${event.lifecycle}</span>
                    <em class="due-chip ${due <= 14 ? "urgent" : ""}">${due} days</em>
                  </button>
                `;
              })
              .join("")}
          </div>
        </section>

        <aside class="dashboard-side-stack">
          <section class="dashboard-panel vessel-panel">
            <p class="section-label">By Vessel</p>
            <div class="vessel-load-list">
              ${vesselCounts
                .map(
                  (item, index) => `
                    <div class="vessel-load-row">
                      <div>
                        <strong>${item.vessel}</strong>
                        <span>${item.count}</span>
                      </div>
                      <progress max="${maxVesselCount}" value="${item.count}" class="vessel-progress progress-${index + 1}"></progress>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </section>

          <section class="dashboard-panel week-panel dark-panel">
            <p class="section-label">This Week</p>
            <strong>${weekItems} items</strong>
            <span>${stats.dueTwoWeeks} due within 14 days. Next reminder sends ${nextReminder ? nextReminder.send.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "after setup"} at 8:00 AKDT.</span>
            <button class="dark-panel-button" type="button" data-action="mock-reminders">View schedule ${icon("arrow-right")}</button>
          </section>

          <section class="dashboard-panel activity-panel">
            <p class="section-label">Recent Activity</p>
            <ul>
              ${recentActivity.map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  `;
}

function renderControls() {
  const isCalendar = state.view === "calendar";

  return `
    <div class="controls events-controls ${isCalendar ? "calendar-controls" : "list-controls"}">
      <div class="search-field">
        ${icon("search")}
        <input type="search" placeholder="Search events, vessels, owners" value="${escapeAttr(state.filters.search)}" data-filter="search" />
      </div>
      ${
        isCalendar
          ? ""
          : `
            <label>
              <span>Type</span>
              <select data-filter="type">
                <option value="all">All types</option>
                ${eventTypes.map((type) => `<option value="${type.id}" ${selected(state.filters.type, type.id)}>${type.label}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Vessel/site</span>
              <select data-filter="vessel">
                <option value="all">All vessels</option>
                ${company.vessels.map((vessel) => `<option value="${vessel}" ${selected(state.filters.vessel, vessel)}>${vessel}</option>`).join("")}
              </select>
            </label>
          `
      }
      <div class="segmented ${isCalendar ? "schedule-tabs" : ""}" role="tablist" aria-label="View">
        ${
          isCalendar
            ? `
              <button class="active" type="button" data-view="calendar"><span>Schedule</span></button>
              <button type="button" data-view="calendar"><span>Month</span></button>
              <button type="button" data-view="list"><span>List</span></button>
            `
            : `
              <button class="" type="button" data-view="calendar">${icon("calendar")}<span>Calendar</span></button>
              <button class="active" type="button" data-view="list">${icon("list")}<span>List</span></button>
            `
        }
      </div>
    </div>
  `;
}

function renderCalendar() {
  const events = filteredEvents();
  const scheduleStart = new Date("2026-05-04T12:00:00");
  const weeks = Array.from({ length: 6 }, (_, index) => {
    const start = new Date(scheduleStart);
    start.setDate(scheduleStart.getDate() + index * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const items = events.filter((event) => {
      const due = toDate(event.dueDate);
      return due >= start && due <= end;
    });
    return { start, end, items };
  });
  const ownerCount = new Set(events.map((event) => event.owner)).size;

  return `
    <div class="schedule-view-grid">
      <section class="calendar-panel schedule-panel">
        <div class="panel-header schedule-header">
          <div>
            <p class="section-label">Schedule</p>
            <h3>Next 6 weeks</h3>
          </div>
          <span>${events.length} events · ${ownerCount} owners</span>
        </div>
        <div class="schedule-sections">
          ${weeks
            .map((week, index) => renderScheduleWeek(week, index))
            .join("")}
        </div>
      </section>

      <aside class="schedule-side-stack">
        ${renderMiniMonth()}
        <section class="calendar-panel category-panel">
          <p class="section-label">Categories</p>
          <div class="category-list">
            ${eventTypes.map((type) => `<span><i class="type-square ${type.color}"></i>${type.label.replace(" Due", "")}</span>`).join("")}
          </div>
        </section>
      </aside>
    </div>
  `;
}

function renderScheduleWeek(week, index) {
  const label = index === 0 ? "This week" : index === 1 ? "Next week" : dateRangeLabel(week.start, week.end);
  const range = dateRangeLabel(week.start, week.end);
  const heading = index < 2 ? label + " · " + range : label;
  return `
    <section class="schedule-week">
      <div class="schedule-week-label">
        <span>${heading}</span>
        <small>${week.items.length} ${week.items.length === 1 ? "event" : "events"}</small>
      </div>
      ${
        week.items.length
          ? week.items.map((event) => renderScheduleItem(event)).join("")
          : `<div class="empty-week">No events scheduled.</div>`
      }
    </section>
  `;
}

function renderScheduleItem(event) {
  const due = daysUntil(event.dueDate);
  const date = toDate(event.dueDate);
  return `
    <button class="schedule-item" type="button" data-select-event="${event.id}">
      <time>
        <span>${date.toLocaleDateString("en-US", { weekday: "short" })}</span>
        <strong>${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong>
        <small>${event.type === "report" ? "Due" : "09:00"}</small>
      </time>
      <i class="schedule-type-bar ${typeFor(event.type).color}"></i>
      <span class="schedule-main">
        <strong>${event.title}</strong>
        <small><mark>${event.vessel}</mark>${event.owner} · ${event.lifecycle}</small>
      </span>
      <em class="due-chip ${due <= 14 ? "urgent" : ""}">${due} days</em>
    </button>
  `;
}

function renderMiniMonth() {
  const date = state.selectedDate;
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const firstDay = start.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousDays = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    cells.push({ day: previousDays - i, muted: true, date: new Date(year, month - 1, previousDays - i) });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, muted: false, date: new Date(year, month, day) });
  }

  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - firstDay - daysInMonth + 1;
    cells.push({ day: nextDay, muted: true, date: new Date(year, month + 1, nextDay) });
  }

  return `
    <section class="calendar-panel mini-month-panel">
      <div class="mini-month-head">
        <p class="section-label">${date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        <div class="month-actions">
          <button class="icon-button" type="button" title="Previous month" data-month="-1">${icon("chevron-left")}</button>
          <button class="icon-button" type="button" title="Next month" data-month="1">${icon("chevron-right")}</button>
        </div>
      </div>
      <div class="mini-weekdays">
        ${["S", "M", "T", "W", "T", "F", "S"].map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="mini-month-grid">
        ${cells
          .map((cell) => {
            const iso = cell.date.toISOString().slice(0, 10);
            const events = filteredEvents().filter((event) => event.dueDate === iso);
            return `
              <span class="mini-day ${cell.muted ? "muted" : ""} ${sameDay(cell.date, getToday()) ? "today" : ""}">
                ${cell.day}
                ${events.length ? `<i class="mini-dot ${typeFor(events[0].type).color}"></i>` : ""}
              </span>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function dateRangeLabel(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  const first = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const last = end.toLocaleDateString("en-US", { month: sameMonth ? undefined : "short", day: "numeric" });
  return `${first}-${last}`;
}

function renderEventTable() {
  const events = filteredEvents();
  const counts = ["Active", "Waiting on Vessel", "Office Review", "Draft"].map((stage) => ({
    stage,
    count: events.filter((event) => event.lifecycle === stage).length,
  }));

  return `
    <div class="events-list-view">
      <div class="lifecycle-summary-row">
        ${counts
          .map(
            (item) => `
              <button class="lifecycle-summary-card" type="button">
                <i class="summary-dot ${lifecycleClass(item.stage)}"></i>
                <strong>${item.count}</strong>
                <span>${item.stage}</span>
              </button>
            `,
          )
          .join("")}
      </div>

      <section class="table-panel events-table-panel">
        <div class="panel-header list-panel-header">
          <div>
            <p class="section-label">All Events</p>
            <h3>${events.length} compliance items</h3>
          </div>
          <button class="ghost-button" type="button" data-action="export">Export CSV</button>
        </div>
        <div class="event-list operational-event-list">
          ${events
            .map((event) => {
              const type = typeFor(event.type);
              const due = daysUntil(event.dueDate);
              return `
                <button class="event-row operational-event-row ${event.id === state.selectedEventId ? "selected" : ""}" type="button" data-select-event="${event.id}">
                  <span class="row-accent ${type.color}"></span>
                  <span class="event-main-copy">
                    <strong>${event.title}</strong>
                    <small><mark>${event.vessel}</mark>${event.owner}</small>
                  </span>
                  <span class="lifecycle-chip ${lifecycleClass(event.lifecycle)}">${event.lifecycle}</span>
                  <span class="due-chip ${due <= 14 ? "urgent" : ""}">${due} days</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </section>
    </div>
  `;
}

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayShortLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ordinalLabels = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", "-1": "last" };

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonthsClamped(date, months, day = date.getDate()) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function nthWeekdayOfMonth(year, month, weekday, ordinal) {
  if (ordinal === -1) {
    const last = new Date(year, month + 1, 0, 12);
    const diff = (last.getDay() - weekday + 7) % 7;
    last.setDate(last.getDate() - diff);
    return last;
  }
  const first = new Date(year, month, 1, 12);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (ordinal - 1) * 7, 12);
}

function recurrenceEndSummary(end = { type: "never" }) {
  if (end.type === "after") return "Ends after " + end.count + " occurrences";
  if (end.type === "by") return "Ends by " + formatDate(end.date, { year: true });
  return "Never ends";
}

function recurrenceSummary(event) {
  const rule = event.recurrence;
  if (!rule || rule.type === "none") return "Does not repeat";
  const intervalText = rule.interval > 1 ? "Every " + rule.interval : "Every";
  if (rule.type === "daily") return intervalText + " " + (rule.interval > 1 ? "days" : "day");
  if (rule.type === "weekly") return intervalText + " " + (rule.interval > 1 ? "weeks" : "week") + " on " + rule.weekdays.map((day) => weekdayShortLabels[day]).join(" and ");
  if (rule.type === "monthly-date") return intervalText + " " + (rule.interval > 1 ? "months" : "month") + " on day " + rule.monthDay;
  if (rule.type === "monthly-weekday") return intervalText + " " + (rule.interval > 1 ? "months" : "month") + " on the " + ordinalLabels[rule.ordinal] + " " + weekdayLabels[rule.weekday];
  if (rule.type === "annually") return intervalText + " " + (rule.interval > 1 ? "years" : "year") + " on " + formatDate(event.dueDate);
  if (rule.type === "custom") return "Every " + rule.interval + " days from " + formatDate(rule.anchorDate || event.dueDate, { year: true });
  return "Does not repeat";
}

function generateOccurrences(event, limit = 5) {
  const rule = event.recurrence;
  const start = toDate(rule?.anchorDate || event.dueDate);
  if (!rule || rule.type === "none") return [start];
  const max = rule.end?.type === "after" ? Math.min(limit, rule.end.count) : limit;
  const endDate = rule.end?.type === "by" ? toDate(rule.end.date) : null;
  const dates = [];
  let cursor = start;
  let attempts = 0;
  while (dates.length < max && attempts < 120) {
    attempts += 1;
    if (!endDate || cursor <= endDate) dates.push(new Date(cursor));
    if (endDate && cursor >= endDate) break;
    if (rule.type === "daily") cursor = addDays(cursor, rule.interval);
    else if (rule.type === "weekly") {
      const candidates = [];
      const weekStart = addDays(cursor, -cursor.getDay());
      for (let week = 0; week <= rule.interval; week += 1) rule.weekdays.forEach((day) => candidates.push(addDays(weekStart, week * 7 + day)));
      cursor = candidates.filter((date) => date > cursor).sort((a, b) => a - b)[0] || addDays(cursor, rule.interval * 7);
    } else if (rule.type === "monthly-date") cursor = addMonthsClamped(cursor, rule.interval, rule.monthDay);
    else if (rule.type === "monthly-weekday") {
      const base = addMonthsClamped(cursor, rule.interval, 1);
      cursor = nthWeekdayOfMonth(base.getFullYear(), base.getMonth(), rule.weekday, rule.ordinal);
    } else if (rule.type === "annually") cursor = addMonthsClamped(cursor, rule.interval * 12, start.getDate());
    else if (rule.type === "custom") cursor = addDays(cursor, rule.interval);
    else break;
  }
  return dates;
}

function renderRecurrenceSummary(event) {
  const dates = generateOccurrences(event, 5);
  return `
    <section class="detail-section recurrence-card">
      <div class="section-header">
        <p class="section-label">Recurrence</p>
        <span>${recurrenceEndSummary(event.recurrence?.end)}</span>
      </div>
      <strong>${recurrenceSummary(event)}</strong>
      <div class="occurrence-list">
        ${dates.map((date) => `<span>${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>`).join("")}
      </div>
    </section>
  `;
}

function readRecurrenceFromForm(form, dueDate) {
  const type = String(form.get("recurrenceType") || "none");
  const endType = String(form.get("recurrenceEnd") || "never");
  const end = endType === "after" ? { type: "after", count: Number(form.get("endAfter") || 12) } : endType === "by" ? { type: "by", date: String(form.get("endBy") || "2027-12-31") } : { type: "never" };
  const interval = Math.max(1, Number(form.get("recurrenceInterval") || 1));
  if (type === "none") return { type: "none", end };
  if (type === "daily") return { type, interval, end };
  if (type === "weekly") return { type, interval, weekdays: [1, 4], end };
  if (type === "monthly-date") return { type, interval, monthDay: Number(form.get("monthDay") || toDate(dueDate).getDate()), end };
  if (type === "monthly-weekday") return { type, interval, ordinal: Number(form.get("ordinal") || 2), weekday: Number(form.get("weekday") || 2), end };
  if (type === "annually") return { type, interval, end };
  if (type === "custom") return { type, interval: Math.max(1, Number(form.get("customDays") || 45)), anchorDate: dueDate, end };
  return { type: "none", end };
}
function lifecycleClass(stage) {
  return stage.toLowerCase().replace(/\s+/g, "-");
}

function renderLifecycleStepper(event) {
  const currentIndex = lifecycleStages.indexOf(event.lifecycle);

  return `
    <section class="lifecycle-tracker" aria-label="Lifecycle tracker">
      <div class="section-header">
        <p class="section-label">Lifecycle</p>
        <span class="lifecycle-owner">${event.lifecycle === "Waiting on Vessel" ? "Vessel owns next step" : event.lifecycle === "Office Review" ? "Office confirmation needed" : "Office managed"}</span>
      </div>
      <div class="lifecycle-steps">
        ${lifecycleStages
          .map((stage, index) => {
            const isDone = index < currentIndex || event.lifecycle === "Complete";
            const isCurrent = stage === event.lifecycle;
            return `
              <span class="lifecycle-step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}">
                <i>${index + 1}</i>
                <strong>${stage}</strong>
              </span>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}
function renderDetails() {
  const event = selectedEvent();
  if (!event) return "";

  const type = typeFor(event.type);
  const due = daysUntil(event.dueDate);

  return `
    <aside class="detail-panel">
      <div class="detail-head">
        <span class="type-badge ${type.color}">${type.label}</span>
        <div class="detail-actions">
          ${canUpdateStatus() ? `<button class="icon-button" type="button" title="Mark complete" data-action="complete">${icon("check")}</button>` : ""}
          <button class="icon-button" type="button" title="Close details" data-action="close-details">${icon("x")}</button>
        </div>
      </div>

      <h3>${event.title}</h3>
      <p class="detail-note">${event.notes}</p>

      <div class="due-box ${due <= 14 ? "urgent" : ""}">
        <span>Due ${formatDate(event.dueDate, { year: true })}</span>
        <strong>${due} days away</strong>
      </div>

      ${renderLifecycleStepper(event)}
      ${renderRecurrenceSummary(event)}

      <div class="detail-grid">
        <div>
          <span>Vessel/site</span>
          <strong>${event.vessel}</strong>
        </div>
        <div>
          <span>Owner</span>
          <strong>${event.owner}</strong>
        </div>
        <div class="status-field">
          <span>Lifecycle</span>
          ${canUpdateStatus()
            ? `<select class="status-select" data-lifecycle-select>${lifecycleStages
                .map((stage) => `<option value="${stage}" ${selected(event.lifecycle, stage)}>${stage}</option>`)
                .join("")}</select>`
            : `<strong>${event.lifecycle}</strong><small>View only for ${currentUser().name}</small>`}
        </div>
        <div>
          <span>Priority</span>
          <strong>${event.priority}</strong>
        </div>
      </div>

      <section class="detail-section">
        <div class="section-header">
          <p class="section-label">Reminder Schedule</p>
          <button class="text-button" type="button" data-action="edit-reminders">Edit</button>
        </div>
        <div class="reminder-stack">
          ${event.reminders
            .map((days) => {
              const reminderDate = new Date(toDate(event.dueDate));
              reminderDate.setDate(reminderDate.getDate() - days);
              return `
                <div class="reminder-row">
                  ${icon("mail")}
                  <span>
                    <strong>${days} days before</strong>
                    <small>${reminderDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
                  </span>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>

      <section class="detail-section">
        <p class="section-label">Recipients</p>
        <div class="recipient-list">
          ${event.recipients.map((name) => `<span>${initials(name)} ${name}</span>`).join("")}
        </div>
      </section>

      <section class="detail-section">
        <p class="section-label">Reference Link</p>
        <button class="reference-link" type="button" data-toast="SharePoint link previewed">
          ${icon("file")}
          <span>Open SharePoint folder</span>
          <small>${event.referenceLink}</small>
        </button>
      </section>

      <div class="email-status">
        ${icon("activity")}
        <span>${event.lastEmail}</span>
      </div>
    </aside>
  `;
}

function renderModal(kind) {
  const isEmail = kind === "email";
  const title = isEmail ? "Email reminder queue" : kind === "settings" ? "Default reminder rules" : "Add compliance event";

  const body = isEmail
    ? renderEmailQueue()
    : kind === "settings"
      ? renderRuleSettings()
      : renderNewEventForm();

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="modal-backdrop" data-close-modal>
        <section class="modal" role="dialog" aria-modal="true" aria-label="${title}" data-modal>
          <div class="modal-header">
            <h3>${title}</h3>
            <button class="icon-button" type="button" title="Close" data-close-modal>${icon("x")}</button>
          </div>
          ${body}
        </section>
      </div>
    `,
  );

  document.querySelector("[data-modal] input, [data-modal] select")?.focus();
}

function renderEmailQueue() {
  const queued = filteredEvents()
    .flatMap((event) =>
      event.reminders.map((days) => {
        const send = new Date(toDate(event.dueDate));
        send.setDate(send.getDate() - days);
        return { event, days, send };
      }),
    )
    .filter((item) => item.send >= getToday())
    .sort((a, b) => a.send - b.send)
    .slice(0, 8);

  return `
    <div class="queue-list">
      ${queued
        .map(
          (item) => `
            <div class="queue-row">
              <span class="type-dot ${typeFor(item.event.type).color}"></span>
              <span>
                <strong>${item.event.title}</strong>
                <small>${item.days} days before · ${item.event.recipients.join(", ")}</small>
              </span>
              <time>${item.send.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
            </div>
          `,
        )
        .join("")}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-close-modal>Close</button>
      <button class="primary-button" type="button" data-toast="Email queue previewed">${icon("send")}<span>Send Test</span></button>
    </div>
  `;
}

function renderRuleSettings() {
  return `
    <div class="rules-grid">
      ${eventTypes
        .map(
          (type) => `
            <label class="rule-card">
              <span class="type-badge ${type.color}">${type.label}</span>
              <strong>Default reminders</strong>
              <input type="text" value="${type.id === "permit" ? "45, 30, 14, 7" : type.id === "report" ? "14, 7, 2" : "30, 14, 7"}" />
              <small>Comma-separated days before the due date</small>
            </label>
          `,
        )
        .join("")}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-close-modal>Cancel</button>
      <button class="primary-button" type="button" data-toast="Default rules saved">${icon("check")}<span>Save Rules</span></button>
    </div>
  `;
}

function renderNewEventForm() {
  return `
    <form class="event-form" data-new-event-form>
      <label>
        <span>Event title</span>
        <input name="title" required value="Dockside sanitation inspection" />
      </label>
      <div class="form-grid">
        <label>
          <span>Type</span>
          <select name="type">
            ${eventTypes.map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>First due date</span>
          <input name="dueDate" type="date" required value="2026-06-28" data-recurrence-input />
        </label>
      </div>
      <div class="form-grid">
        <label>
          <span>Vessel/site</span>
          <select name="vessel">
            ${company.vessels.map((vessel) => `<option value="${vessel}">${vessel}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Owner</span>
          <select name="owner">
            ${company.officeUsers.map((user) => `<option value="${user.name}">${user.name}</option>`).join("")}
          </select>
        </label>
      </div>
      <section class="form-section recurrence-builder">
        <div class="section-header">
          <div>
            <p class="section-label">Recurrence</p>
            <strong>Repeat schedule</strong>
          </div>
          <span data-recurrence-preview>Annual event, never ends</span>
        </div>
        <div class="form-grid">
          <label>
            <span>Pattern</span>
            <select name="recurrenceType" data-recurrence-type>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly-date">Monthly by date</option>
              <option value="monthly-weekday">Monthly by weekday</option>
              <option value="annually" selected>Annually</option>
              <option value="custom">Custom interval</option>
            </select>
          </label>
          <label>
            <span>Every</span>
            <input name="recurrenceInterval" type="number" min="1" value="1" data-recurrence-input />
          </label>
        </div>
        <div class="recurrence-options">
          <label class="recurrence-option" data-panel="weekly"><span>Weekly days</span><select name="weeklyDays" data-recurrence-input><option>Monday and Thursday</option><option>Tuesday</option><option>Friday</option></select></label>
          <label class="recurrence-option" data-panel="monthly-date"><span>Day of month</span><input name="monthDay" type="number" min="1" max="31" value="15" data-recurrence-input /></label>
          <label class="recurrence-option" data-panel="monthly-weekday"><span>Weekday rule</span><select name="ordinal" data-recurrence-input><option value="1">1st</option><option value="2" selected>2nd</option><option value="3">3rd</option><option value="4">4th</option><option value="-1">Last</option></select></label>
          <label class="recurrence-option" data-panel="monthly-weekday"><span>Weekday</span><select name="weekday" data-recurrence-input>${weekdayLabels.map((day, index) => `<option value="${index}" ${index === 2 ? "selected" : ""}>${day}</option>`).join("")}</select></label>
          <label class="recurrence-option" data-panel="custom"><span>Custom days</span><input name="customDays" type="number" min="1" value="45" data-recurrence-input /></label>
        </div>
        <div class="form-grid recurrence-end">
          <label><span>Ends</span><select name="recurrenceEnd" data-recurrence-input><option value="never" selected>Never ends</option><option value="after">After N occurrences</option><option value="by">By date</option></select></label>
          <label class="recurrence-option" data-end-panel="after"><span>After</span><input name="endAfter" type="number" min="1" value="12" data-recurrence-input /></label>
          <label class="recurrence-option" data-end-panel="by"><span>End by</span><input name="endBy" type="date" value="2027-12-31" data-recurrence-input /></label>
        </div>
      </section>
      <label>
        <span>Reminder days</span>
        <input name="reminders" value="30, 14, 7, 1" />
      </label>
      <label>
        <span>Notes</span>
        <textarea name="notes">Check washdown records, chemical labels, and corrective action log.</textarea>
      </label>
      <div class="modal-actions">
        <button class="ghost-button" type="button" data-close-modal>Cancel</button>
        <button class="primary-button" type="submit">${icon("plus")}<span>Add Event</span></button>
      </div>
    </form>
  `;
}

function bindEvents() {
  document.querySelector("[data-first-event-setup-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.setup.firstEvent.title = String(form.get("title") || "");
    state.setup.firstEvent.type = String(form.get("type") || "inspection");
    state.setup.firstEvent.vessel = String(form.get("vessel") || "");
    state.setup.firstEvent.owner = String(form.get("owner") || "");
    state.setup.firstEvent.dueDate = String(form.get("dueDate") || "");
    state.setup.firstEvent.priority = String(form.get("priority") || "Medium");
    state.setup.firstEvent.reminders = String(form.get("reminders") || state.setup.reminderRules.defaultCadence);
    state.setup.firstEvent.referenceLink = String(form.get("referenceLink") || "");
    state.setup.firstEvent.notes = String(form.get("notes") || "");
    state.view = "setup-review";
    render();
    showToast("First event saved. Review setup.");
  });
  document.querySelector("[data-reminder-setup-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.setup.reminderRules.defaultCadence = String(form.get("defaultCadence") || "");
    state.setup.reminderRules.sendTime = String(form.get("sendTime") || "08:00");
    state.setup.reminderRules.escalationAfterDays = String(form.get("escalationAfterDays") || "3");
    state.setup.reminderRules.requireVesselResponse = form.get("requireVesselResponse") === "on";
    state.setup.reminderRules.categoryDefaults = state.setup.reminderRules.categoryDefaults.map((rule, index) => ({
      ...rule,
      days: String(form.get("category-" + index) || rule.days),
    }));
    state.setup.firstEvent.reminders = state.setup.reminderRules.defaultCadence;
    state.view = "setup-first-event";
    render();
    showToast("Reminder rules saved. Next step: first event.");
  });
  document.querySelector("[data-people-setup-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.setup.people.push({
      name: String(form.get("name") || "New user"),
      email: String(form.get("email") || "Not set"),
      role: String(form.get("role") || "Office User"),
      scope: String(form.get("scope") || "Office"),
      canConfirm: form.get("canConfirm") === "on",
    });
    render();
    showToast("Person added to setup");
  });

  document.querySelector("[data-vessel-setup-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.setup.vessels.push({
      name: String(form.get("name") || "New vessel"),
      type: String(form.get("type") || "Catcher processor"),
      primaryContact: String(form.get("primaryContact") || "Not assigned"),
      email: String(form.get("email") || "Not set"),
      port: String(form.get("port") || state.setup.homePort || "Not set"),
    });
    render();
    showToast("Vessel added to setup");
  });

  document.querySelector("[data-company-setup-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.setup.companyName = String(form.get("companyName") || "");
    state.setup.legalName = String(form.get("legalName") || "");
    state.setup.primaryContact = String(form.get("primaryContact") || "");
    state.setup.contactEmail = String(form.get("contactEmail") || "");
    state.setup.timezone = String(form.get("timezone") || "America/Anchorage");
    state.setup.homePort = String(form.get("homePort") || "");
    state.view = "setup-vessels";
    render();
    showToast("Company workspace saved. Next step: vessels.");
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.selectedEventId = null;
      render();
      focusCurrentView();
      showToast(viewLabel() + " view opened");
    });
  });

  document.querySelectorAll("[data-current-user]").forEach((field) => {
    field.addEventListener("change", () => {
      state.currentUserId = field.value;
      render();
      showToast(canUpdateStatus() ? "Status editing enabled" : "View-only access");
    });
  });

  document.querySelectorAll("[data-lifecycle-select]").forEach((field) => {
    field.addEventListener("change", () => {
      const event = selectedEvent();
      if (!event || !canUpdateStatus()) return;
      event.lifecycle = field.value;
      showToast(`${event.title} moved to ${event.lifecycle}`);
      render();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((field) => {
    const eventName = field.tagName === "SELECT" ? "change" : "input";
    field.addEventListener(eventName, () => {
      state.filters[field.dataset.filter] = field.value;
      render();
      if (field.dataset.filter === "search") {
        const search = document.querySelector('[data-filter="search"]');
        search?.focus();
        search?.setSelectionRange(search.value.length, search.value.length);
      }
    });
  });

  document.querySelectorAll("[data-month]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = new Date(
        state.selectedDate.getFullYear(),
        state.selectedDate.getMonth() + Number(button.dataset.month),
        1,
        12,
      );
      render();
    });
  });

  document.querySelectorAll("[data-select-event]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedEventId = Number(button.dataset.selectEvent);
      if (state.view === "dashboard") state.view = "list";
      render();
      if (state.view === "list") focusCurrentView();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
}

function viewLabel(view = state.view) {
  if (view === "dashboard") return "Dashboard";
  return view === "calendar" ? "Calendar" : "Event List";
}

function focusCurrentView() {
  window.setTimeout(() => {
    document.querySelector("#current-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 0);
}

function bindModalEvents() {
  const recurrenceForm = document.querySelector("[data-new-event-form]");
  const refreshRecurrencePreview = () => {
    if (!recurrenceForm) return;
    const form = new FormData(recurrenceForm);
    const fakeEvent = {
      dueDate: String(form.get("dueDate") || "2026-06-28"),
      recurrence: readRecurrenceFromForm(form, String(form.get("dueDate") || "2026-06-28")),
    };
    const preview = recurrenceForm.querySelector("[data-recurrence-preview]");
    if (preview) preview.textContent = `${recurrenceSummary(fakeEvent)} · ${recurrenceEndSummary(fakeEvent.recurrence.end)}`;
    recurrenceForm.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== fakeEvent.recurrence.type);
    });
    recurrenceForm.querySelectorAll("[data-end-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.endPanel !== fakeEvent.recurrence.end.type);
    });
  };

  document.querySelectorAll("[data-recurrence-input], [data-recurrence-type]").forEach((field) => {
    field.addEventListener("change", refreshRecurrencePreview);
    field.addEventListener("input", refreshRecurrencePreview);
  });
  refreshRecurrencePreview();
  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (element.classList.contains("modal-backdrop") && event.target !== element) return;
      document.querySelector(".modal-backdrop")?.remove();
    });
  });

  document.querySelectorAll("[data-toast]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(button.dataset.toast);
      document.querySelector(".modal-backdrop")?.remove();
    });
  });

  document.querySelector("[data-new-event-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reminders = String(form.get("reminders"))
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Boolean);

    const newEvent = {
      id: Date.now(),
      title: String(form.get("title")),
      type: String(form.get("type")),
      dueDate: String(form.get("dueDate")),
      vessel: String(form.get("vessel")),
      owner: String(form.get("owner")),
      status: "Needs prep",
      lifecycle: "Draft",
      referenceLink: "https://arcticstorm.example/sharepoint/new-event",
      recurrence: readRecurrenceFromForm(form, String(form.get("dueDate"))),
      priority: "Medium",
      reminders,
      recipients: [String(form.get("owner")), "Sarah Nayani"],
      notes: String(form.get("notes")),
      lastEmail: "No emails sent yet",
      documents: ["New event checklist"],
    };

    state.events.push(newEvent);
    state.selectedEventId = newEvent.id;
    state.selectedDate = toDate(newEvent.dueDate);
    document.querySelector(".modal-backdrop")?.remove();
    showToast("Event added to mock calendar");
    render();
  });
}

function handleAction(action) {
  if (action === "confirm-vessels") {
    state.view = "setup-people";
    render();
    showToast("Vessels saved. Next step: people.");
    return;
  }

  if (action === "confirm-people") {
    state.view = "setup-reminders";
    render();
    showToast("People saved. Next step: reminder rules.");
    return;
  }

  if (action === "finish-setup") {
    state.view = "dashboard";
    render();
    showToast("Setup complete. Dashboard opened.");
    return;
  }

  if (action === "new-event") {
    renderModal("new");
    bindModalEvents();
    return;
  }

  if (action === "mock-reminders") {
    renderModal("email");
    bindModalEvents();
    return;
  }

  if (action === "mock-settings") {
    renderModal("settings");
    bindModalEvents();
    return;
  }

  if (action === "today") {
    state.selectedDate = new Date("2026-05-01T12:00:00");
    render();
    return;
  }

  if (action === "close-details") {
    state.selectedEventId = null;
    render();
    focusCurrentView();
    return;
  }

  if (action === "complete") {
    const event = selectedEvent();
    if (!event) return;
    if (!canUpdateStatus()) {
      showToast("You do not have access to update status");
      return;
    }
    event.lifecycle = event.lifecycle === "Complete" ? "Active" : "Complete";
    showToast(`${event.title} moved to ${event.lifecycle}`);
    render();
    return;
  }

  if (action === "edit-reminders") {
    renderModal("settings");
    bindModalEvents();
    return;
  }

  if (action === "export") {
    showToast("CSV export mocked for prototype");
  }
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="toast">${message}</div>`);
  setTimeout(() => document.querySelector(".toast")?.remove(), 2400);
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function selected(current, value) {
  return current === value ? "selected" : "";
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function escapeAttr(value) {
  return String(value).replaceAll('"', "&quot;");
}

function icon(name) {
  const icons = {
    activity: '<path d="M4 12h4l2-7 4 14 2-7h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
  };

  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.calendar}</svg>`;
}

render();
