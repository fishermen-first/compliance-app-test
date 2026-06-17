# AS-BUILT — Reminder Schedule editor

Authoritative record of what shipped. Where this disagrees with `handoff-reminders/`,
**this document and the code win.**

---

## 1. What the feature does (shipped behaviour)

The cramped "Edit reminders" popover on the item detail page was replaced with a
right-side **Reminder schedule** drawer. The office can set *when and how often* automated
reminder emails go out, with a live list of the actual calendar send-dates.

- **Multiple before-deadline lead times.** An item can stack e.g. 14 **and** 7 **and** 3
  days before expiration; each is its own rule row and schedules its own send.
- **One-off dates.** Individual reminders on a specific calendar date. They do **not**
  carry forward when the item rolls to the next cycle.
- **Recurring nudge stops at `submitted`** (previously ran until `complete`).
- **Live "what will actually send" list** computed from current form state.
- Recipients managed as rows (owner default + vessel copies).

---

## 2. As-built structure vs. the original mockup

The drawer was **rebuilt in a different interaction model** than the mockup the old docs
referenced. This is why `FIX_NOTE.md` no longer applies.

| Old mockup / handoff docs assumed | What actually shipped |
|---|---|
| Collapsible `schedule-rule-block` + `schedule-rule-body`, body gated on the toggle | Three sections: a live **scheduled-dates list**, an **add panel** (segmented: Specific date / Days before deadline / Recurring nudge), and a **"Rules that create reminders"** list of `schedule-rule-row`s |
| Rule body hidden until toggled ON (`rblock` / `rcps` class names) | `schedule-rule-row` content (offset chips, cadence chips, sentence) renders **unconditionally** — no collapsible body exists |
| `.stbtns` Complete button needed `width:100%; justify-self:stretch` | Not needed — grid items stretch by default; the modal is `position:fixed` so it never consumes a grid cell |

**Component class names actually used:** `schedule-section`, `schedule-rule-list`,
`schedule-rule-row`, `schedule-chip-row`, `schedule-offset-chip`, `schedule-tag`,
`schedule-segmented`, `schedule-add-panel`, `schedule-recipient-list`,
`schedule-instructions`. (The old contract's `rblock` / `schedule-rule-block` /
`schedule-rule-body` / `rcps` names are **not** in the shipped code.)

---

## 3. Source-of-truth files

| Concern | File |
|---|---|
| Drawer UI + live preview + form-state islands | `components/reminder-schedule-drawer.tsx` |
| Right-rail Reminders card + `nextExpectedReminder` helper | `components/compliance-item-detail.tsx` |
| Complete / roll-forward modal (`.complete-trigger`) | `components/complete-item-modal.tsx` |
| Server action (parses repeated `expirationDaysBefore` / `oneOffDate` fields) | `app/actions/items.ts` › `saveComplianceItemReminders` |
| Schedule queue trigger (permission wrapper → `_for_company`) | `app/actions/reminders.ts` |
| Migration: multi lead-times + one-off + scheduler + roll-forward | `supabase/migrations/202606160001_reminder_schedule_multi_and_oneoff.sql` |
| Styles | `app/globals.css` (search `schedule-` and `.stbtns`) |

---

## 4. Runtime call path (important)

The app calls `schedule_due_reminders(uuid, date)` from `app/actions/reminders.ts`. That
function is a **permission wrapper** that delegates to
`schedule_due_reminders_for_company(...)`. The June 16 migration redefined
`_for_company` with the one-off branch and the `status not in ('submitted')` stop — so the
new behaviour is live on the real cron path, not stranded in an unused function.

---

## 5. Two FIX_NOTE bugs — resolved/obsolete

- **Bug A (Complete button width):** Not present. `.stbtns` is a 3-col grid; grid items
  (incl. the `<button class="complete-trigger">`) default to `justify-self: stretch`, so
  all three controls are equal width. The modal scrim/dialog are `position: fixed`, which
  do not occupy grid tracks, so opening the modal can't shift the columns.
- **Bug B (empty rule bodies):** Structurally impossible. There are no collapsible bodies
  in the shipped design; `schedule-rule-row` content always renders.
