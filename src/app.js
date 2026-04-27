const company = {
  name: "Arctic Storm Management Group",
  vessels: ["F/V Arctic Fjord", "F/V Arctic Storm", "F/V Sea Storm"],
  officeUsers: [
    { id: "sarah", name: "Sarah Nayani", role: "Director of Operations and Compliance", canUpdateStatus: true },
    { id: "emma", name: "Emma Scalisi", role: "", canUpdateStatus: false },
    { id: "meagan", name: "Meagan Anderson", role: "", canUpdateStatus: false },
  ],
};

const statusOptions = ["Not started", "Needs prep", "Draft started", "Scheduled", "In progress", "Submitted", "Waiting on fee", "Vendor contacted", "Planned", "Completed"];

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
    status: "Not started",
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
  view: "dashboard",
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

function pageTitle() {
  if (state.view === "dashboard") return "Compliance dashboard";
  if (state.view === "calendar") return "Compliance calendar";
  return "Compliance event list";
}

function viewMeta() {
  if (state.view === "dashboard") {
    return { title: "Dashboard", summary: "Operations summary and next actions" };
  }

  if (state.view === "calendar") {
    return { title: "Calendar", summary: "Month view with due-date blocks" };
  }

  return { title: "Event List", summary: `${filteredEvents().length} filtered compliance items` };
}

function dashboardStats() {
  const openEvents = state.events.filter((event) => event.status !== "Completed");
  const dueSoonEvents = openEvents.filter((event) => daysUntil(event.dueDate) >= 0 && daysUntil(event.dueDate) <= 30);
  const dueTwoWeeksEvents = openEvents.filter((event) => daysUntil(event.dueDate) >= 0 && daysUntil(event.dueDate) <= 14);
  const highOpenEvents = openEvents.filter((event) => event.priority === "High");

  return {
    dueSoon: dueSoonEvents.length,
    dueTwoWeeks: dueTwoWeeksEvents.length,
    highSoon: dueSoonEvents.filter((event) => event.priority === "High").length,
    highOpen: highOpenEvents.length,
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
      const matchesStatus = state.filters.status !== "open" || event.status !== "Completed";
      const search = state.filters.search.trim().toLowerCase();
      const matchesSearch =
        !search ||
        [event.title, event.vessel, event.owner, event.status, event.notes]
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
  app.innerHTML = `
    <div class="shell">
      ${renderSidebar()}
      <main class="workspace" id="main-workspace">
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

  return `${renderViewBanner()}${content}`;
}

function renderSidebar() {
  return `
    <aside class="sidebar compact-sidebar">
      <div class="brand-block">
        <div class="brand-mark">AS</div>
        <div>
          <p class="eyebrow">Compliance Calendar</p>
          <h1>${company.name}</h1>
        </div>
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
function renderTopbar() {
  const next = filteredEvents()[0];

  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Today is Apr 26, 2026</p>
        <h2>${pageTitle()}</h2>
      </div>
      <div class="topbar-actions">
        <div class="next-due">
          <span>Next due</span>
          <strong>${next ? `${next.title} in ${daysUntil(next.dueDate)} days` : "Nothing scheduled"}</strong>
        </div>
        <label class="user-switcher">
          <span>Signed in as</span>
          <select data-current-user>
            ${company.officeUsers
              .map((user) => `<option value="${user.id}" ${selected(state.currentUserId, user.id)}>${user.name}</option>`)
              .join("")}
          </select>
        </label>
        <button class="icon-button" type="button" title="Show email queue" data-action="mock-reminders">
          ${icon("mail")}
        </button>
        <button class="primary-button" type="button" data-action="new-event">
          ${icon("plus")}
          <span>New Event</span>
        </button>
      </div>
    </header>
  `;
}

function renderViewBanner() {
  const meta = viewMeta();
  return `
    <div class="view-banner" data-current-view="${state.view}">
      <div>
        <p class="section-label">Current view</p>
        <strong>${meta.title}</strong>
      </div>
      <span>${meta.summary}</span>
    </div>
  `;
}

function renderDashboard() {
  const stats = dashboardStats();
  const upcoming = filteredEvents().slice(0, 5);
  const needsAttention = filteredEvents()
    .filter((event) => event.priority === "High" || daysUntil(event.dueDate) <= 14)
    .slice(0, 5);

  return `
    <div class="dashboard-home">
      <div class="metric-grid">
        <div class="metric-card">
          <span>Due next 30 days</span>
          <strong>${stats.dueSoon}</strong>
          <small>${stats.highSoon} high priority</small>
        </div>
        <div class="metric-card">
          <span>Due in 14 days</span>
          <strong>${stats.dueTwoWeeks}</strong>
          <small>Needs immediate prep</small>
        </div>
        <div class="metric-card">
          <span>High priority</span>
          <strong>${stats.highOpen}</strong>
          <small>Open compliance items</small>
        </div>
        <div class="metric-card">
          <span>Overdue</span>
          <strong>${stats.overdue}</strong>
          <small>${stats.overdue === 0 ? "Nothing late" : "Needs review"}</small>
        </div>
      </div>

      <div class="dashboard-panels">
        <section class="dashboard-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Priority Queue</p>
              <h3>Upcoming deadlines</h3>
            </div>
            <button class="ghost-button" type="button" data-view="list">Review List</button>
          </div>
          <div class="work-list">
            ${upcoming
              .map((event) => {
                const due = daysUntil(event.dueDate);
                return `
                  <button class="work-row" type="button" data-select-event="${event.id}">
                    <span class="type-dot ${typeFor(event.type).color}"></span>
                    <span>
                      <strong>${event.title}</strong>
                      <small>${event.vessel} · ${event.owner}</small>
                    </span>
                    <em class="due-chip ${due <= 14 ? "urgent" : ""}">${due} days</em>
                  </button>
                `;
              })
              .join("")}
          </div>
        </section>

        <section class="dashboard-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Action Items</p>
              <h3>Needs attention</h3>
            </div>
            <button class="ghost-button" type="button" data-view="calendar">Open Calendar</button>
          </div>
          <div class="work-list">
            ${needsAttention
              .map((event) => {
                const due = daysUntil(event.dueDate);
                return `
                  <button class="work-row attention" type="button" data-select-event="${event.id}">
                    <span class="type-dot ${typeFor(event.type).color}"></span>
                    <span>
                      <strong>${event.title}</strong>
                      <small>${event.status} · ${event.priority} priority · ${event.owner}</small>
                    </span>
                    <em class="due-chip ${due <= 14 ? "urgent" : ""}">${due} days</em>
                  </button>
                `;
              })
              .join("")}
          </div>
        </section>
      </div>
    </div>
  `;
}
function renderControls() {
  return `
    <div class="controls">
      <div class="search-field">
        ${icon("search")}
        <input type="search" placeholder="Search events, vessels, owners" value="${escapeAttr(state.filters.search)}" data-filter="search" />
      </div>
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
      <div class="segmented" role="tablist" aria-label="View">
        <button class="${state.view === "calendar" ? "active" : ""}" type="button" data-view="calendar">${icon("calendar")}<span>Calendar</span></button>
        <button class="${state.view === "list" ? "active" : ""}" type="button" data-view="list">${icon("list")}<span>List</span></button>
      </div>
    </div>
  `;
}

function renderCalendar() {
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

  const monthName = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return `
    <div class="calendar-panel">
      <div class="panel-header">
        <div>
          <p class="section-label">Calendar</p>
          <h3>${monthName}</h3>
        </div>
        <div class="month-actions">
          <button class="icon-button" type="button" title="Previous month" data-month="-1">${icon("chevron-left")}</button>
          <button class="ghost-button" type="button" data-action="today">Today</button>
          <button class="icon-button" type="button" title="Next month" data-month="1">${icon("chevron-right")}</button>
        </div>
      </div>

      <div class="weekday-grid">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}
      </div>

      <div class="calendar-grid">
        ${cells
          .map((cell) => {
            const iso = cell.date.toISOString().slice(0, 10);
            const events = filteredEvents().filter((event) => event.dueDate === iso);
            const classes = ["day-cell", cell.muted ? "muted" : "", sameDay(cell.date, getToday()) ? "today" : ""].join(" ");
            return `
              <div class="${classes}">
                <div class="day-number">${cell.day}</div>
                <div class="day-events">
                  ${events
                    .slice(0, 3)
                    .map(
                      (event) => `
                        <button class="event-pill ${typeFor(event.type).color}" type="button" title="${escapeAttr(event.title)}" data-select-event="${event.id}">
                          <span>${event.title}</span>
                        </button>
                      `,
                    )
                    .join("")}
                  ${events.length > 3 ? `<small>+${events.length - 3} more</small>` : ""}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderEventTable() {
  const events = filteredEvents();

  return `
    <div class="table-panel">
      <div class="panel-header">
        <div>
          <p class="section-label">All Events</p>
          <h3>${events.length} compliance items</h3>
        </div>
        <button class="ghost-button" type="button" data-action="export">Export CSV</button>
      </div>
      <div class="event-list">
        ${events
          .map((event) => {
            const type = typeFor(event.type);
            const due = daysUntil(event.dueDate);
            return `
              <button class="event-row ${event.id === state.selectedEventId ? "selected" : ""}" type="button" data-select-event="${event.id}">
                <span class="type-dot ${type.color}"></span>
                <span>
                  <strong>${event.title}</strong>
                  <small>${event.vessel} · ${event.owner}</small>
                </span>
                <span class="status-chip">${event.status}</span>
                <span class="due-chip ${due <= 14 ? "urgent" : ""}">${due} days</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
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
          <span>Status</span>
          ${canUpdateStatus()
            ? `<select class="status-select" data-status-select>${statusOptions
                .map((status) => `<option value="${status}" ${selected(event.status, status)}>${status}</option>`)
                .join("")}</select>`
            : `<strong>${event.status}</strong><small>View only for ${currentUser().name}</small>`}
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
        <p class="section-label">Documents</p>
        <div class="document-list">
          ${event.documents.map((doc) => `<button type="button">${icon("file")}<span>${doc}</span></button>`).join("")}
        </div>
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
          <span>Due date</span>
          <input name="dueDate" type="date" required value="2026-06-28" />
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

  document.querySelectorAll("[data-status-select]").forEach((field) => {
    field.addEventListener("change", () => {
      const event = selectedEvent();
      if (!event || !canUpdateStatus()) return;
      event.status = field.value;
      showToast(`${event.title} status updated`);
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
      status: "Not started",
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
    event.status = event.status === "Completed" ? "Needs prep" : "Completed";
    showToast(`${event.title} marked ${event.status.toLowerCase()}`);
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
