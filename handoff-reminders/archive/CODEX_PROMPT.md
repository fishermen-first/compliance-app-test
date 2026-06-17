> ARCHIVED — superseded by reminder-feature-asbuilt/AS-BUILT.md. Feature shipped; do not implement from this.

# CODEX PROMPT — Reminder Schedule editor (email cadence)

Replace the cramped "Edit reminders" popover on the item detail page with a **Reminder
schedule** drawer that lets the office set *when and how often* automated reminder emails
go out, with a live preview of the actual calendar send-dates.

**Visual + interaction reference:** `reminder-redesign/Reminder Schedule.html` (open in a
browser — it's a working React mockup with all states; the date math in its
`buildSchedule()` is the spec for the live preview). Styles in
`reminder-redesign/reminder-editor.css` use the existing redesign tokens.

> ⚠️ Unlike the v1 redesign prompt, this feature **requires a Supabase migration** — the
> current schema physically cannot store stacked lead times or one-off dates. Re-read
> `AGENTS.md` first. The migration is additive (no destructive column drops, no RLS
> loosening). Do it as ONE new timestamped migration file.

---

## What's changing, in plain terms

1. **"Before expiration" becomes multiple lead times.** Today it's a single `days_before`
   (e.g. 14). The office wants to stack several — e.g. 14 **and** 7 **and** 3 days before —
   so reminders escalate as the deadline nears.
2. **One-off dates.** A way to add an individual reminder on a specific calendar date that
   no rule covers (surveyor visit, board meeting). One-offs do **not** carry forward when
   the item rolls to the next cycle.
3. **The recurring nudge stops at `submitted`** (today it runs until `complete`).
4. **Plain-language UI + a live "what will actually send" preview**, replacing the popover.
5. **Copy/labels** align to the customer's vocabulary (no "Repeat after start" jargon).

---

## 1. Migration (the enabling change)

File: `supabase/migrations/<new-timestamp>_reminder_schedule_multi_and_oneoff.sql`.
The authoritative current definitions live in
`202605140001_harden_item_permissions_reminder_cron.sql` — copy those function bodies and
modify; don't fork an older copy.

### 1a. Allow multiple `days_before_expiration` rows per item
The unique index `compliance_item_reminder_rules_item_trigger_idx` on
`(item_id, trigger_type)` is what blocks stacking. Replace it:

```sql
drop index if exists public.compliance_item_reminder_rules_item_trigger_idx;
-- one row per (item, type, lead-time). days_before is null for start/repeat rows.
create unique index compliance_item_reminder_rules_item_trigger_days_idx
  on public.compliance_item_reminder_rules(item_id, trigger_type, coalesce(days_before, -1));
```

### 1b. Add the one-off trigger type + absolute date
```sql
alter table public.compliance_item_reminder_rules
  add column if not exists send_on date;

alter table public.compliance_item_reminder_rules
  drop constraint if exists compliance_item_reminder_rules_trigger_type_check;
alter table public.compliance_item_reminder_rules
  add constraint compliance_item_reminder_rules_trigger_type_check
  check (trigger_type in ('on_start_date','days_before_expiration','repeat_after_start','on_specific_date'));
-- one-off rows are identified by their date:
create unique index if not exists compliance_item_reminder_rules_item_oneoff_idx
  on public.compliance_item_reminder_rules(item_id, send_on)
  where trigger_type = 'on_specific_date';
```

### 1c. Rewrite `save_compliance_item_reminders`
New signature — `expiration_days_before integer` becomes `expiration_days_before integer[]`,
and add `one_off_dates date[]`:

```
save_compliance_item_reminders(
  target_item_id uuid,
  item_instructions text,
  start_rule_active boolean,
  expiration_rule_active boolean,
  expiration_days_before integer[],   -- was integer
  repeat_rule_active boolean,
  repeat_every_days integer,
  one_off_dates date[],               -- new
  additional_recipients jsonb
)
```

Logic (keep it a full reconcile, not an upsert-3-rows):
- Upsert the single `on_start_date` row (active = `start_rule_active`).
- Upsert the single `repeat_after_start` row (active = `repeat_rule_active`, `repeat_every_days`).
- For `days_before_expiration`: **delete all existing rows of this type for the item, then
  insert one active row per value** in `expiration_days_before` (dedupe, drop values < 0).
  If `expiration_rule_active` is false, insert none.
- For `on_specific_date`: **delete all existing one-off rows for the item, then insert one
  active row per date** in `one_off_dates` (label e.g. `'One-off ' || to_char(d,'Mon DD')`,
  `send_on = d`, `days_before = null`). Past dates may be dropped server-side.
- Keep the existing instructions + `additional_recipients` handling unchanged.
- Update the `revoke/grant execute` statements to the new signature.

### 1d. Scheduler: handle one-offs + stop recurring at `submitted`
In `schedule_due_reminders` (and any sibling still in use), in the `due_rules` CTE:
- Add a branch: `or (rule.trigger_type = 'on_specific_date' and rule.send_on = run_date)`.
- Change the recurring branch so it does **not** fire once work is submitted. Simplest:
  add `and item.status not in ('submitted')` to the `repeat_after_start` branch only
  (start/expiration/one-off reminders should still fire when submitted). Leave the
  outer `item.status not in ('complete','discontinued')` filter as-is.

The `days_before_expiration` branch already matches per-row, so stacked lead times schedule
automatically once 1a/1c land — no change needed there.

### 1e. Roll-forward copy must EXCLUDE one-offs
In the create-next / `complete_compliance_item` path, the
`insert into compliance_item_reminder_rules (...) select ... from compliance_item_reminder_rules`
block copies rules to the new item. Add `where trigger_type <> 'on_specific_date'` so
one-off dates stay attached to the cycle that owned them. Stacked `days_before_expiration`
rows DO copy (they're recurring policy).

---

## 2. Server action — `app/actions/items.ts` › `saveComplianceItemReminders`

- Parse **multiple** expiration lead times. The form posts repeated
  `expirationDaysBefore` fields (one per chip) — read them with
  `formData.getAll('expirationDaysBefore')`, map to ints, filter `>= 0`, dedupe.
- Parse **one-off dates** from repeated `oneOffDate` fields →
  `formData.getAll('oneOffDate')` (ISO `yyyy-mm-dd` strings).
- Validate: each lead time `>= 0`; `repeatEveryDays > 0` when `repeatRuleActive`.
- Pass `expiration_days_before: <int[]>` and `one_off_dates: <date[]>` to the RPC; keep
  the other args the same.

---

## 3. Component — `components/compliance-item-detail.tsx`

Replace the `canManageReminders` `<details className="filter-chip-menu">` popover (the
`reminder-editor-form`) with a right-side **drawer** reusing the existing
`.drawer` / `.drawer-head` / `.drawer-body` / `.drawer-foot` pattern (same as Edit
details). Title **"Reminder schedule"**, subtitle "When & how often the office gets emailed
about this item."

The `reminderRules` prop already contains all rows — note `expirationRule` must change from
"find one" to "**filter all** `days_before_expiration` rows", and read one-offs as the
`on_specific_date` rows. Build the drawer body from the mockup (`NewEditor`):

- **Live "What will actually send" panel** (top): a client component that computes the
  merged, sorted send dates from current form state — port `buildSchedule()` from the
  mockup verbatim (kickoff = start date; one row per lead time = `expiration − N`; recurring
  = `start + k·every` up to expiration; one-offs = their dates). Mark past / next / scheduled.
  One-off rows get an inline **×** to remove; rule-derived rows are read-only here.
- **"When the item becomes due"** — toggle for `on_start_date`. (Rename: this was
  "start-working reminder"; keep that exact phrase in the right-rail read view.)
- **"Before the deadline"** — toggle + multi-select lead-time chips (30/14/7/3/1 day) with a
  custom-add field. Each selected value renders a removable chip showing its landing date.
- **"Keep nudging until it's done"** — toggle for `repeat_after_start` + cadence presets
  (Weekly/Every 2 weeks/Monthly/Custom). Copy: "until you mark the item **submitted**."
- **"Also copy the vessel"** — the existing additional-recipients editor, restyled as chips.
- **"+ Add a one-off date"** — a `<input type="date" min={today}>` inside the preview panel
  that appends an `oneOffDate` hidden field + a timeline row.

The drawer's Save posts to the existing `saveComplianceItemReminders` action. Because the
form now has dynamic rows (chips, one-offs), manage them with local React state and emit the
final set as hidden inputs (repeated `expirationDaysBefore` / `oneOffDate`) on submit — this
is a client island; keep the surrounding server component intact.

### Right-rail read view (the always-visible Reminders card)
Update `reminder-card-list` so "Before-expiration reminder" shows the **set** (e.g.
"14, 7 & 3 days before") and add a line for one-off dates when present. "Next scheduled"
already uses `nextExpectedReminder` — extend that helper to include `on_specific_date`
(`send_on`) and emit one candidate per `days_before_expiration` row.

---

## 4. Copy / labels

- Kill "Repeat after start" / "Repeat every days" / "Days before" bare labels.
- Start rule → **"When the item becomes due"** (sub: "Fires on the start-working date").
- Deadline rule → **"Before the deadline"**, lead times as day-chips.
- Repeat rule → **"Keep nudging until it's done"**, cadence presets.
- One-offs → **"One-off"** (blue tag in the preview).

---

## Acceptance checklist

- [ ] An item can hold 14 **and** 7 **and** 3-day before-expiration reminders; all three
      appear in the preview and each schedules its own `reminder_send_log` row on its date.
- [ ] Removing a lead-time chip deletes only that rule row on save.
- [ ] A one-off date can be added and removed; it schedules on that date; it does **not**
      appear on the next record after roll-forward.
- [ ] Stacked lead times **do** carry forward on roll-forward.
- [ ] Recurring nudges stop once status = `submitted`.
- [ ] The old `filter-chip-menu` reminder popover is gone; editing happens in the drawer.
- [ ] Right-rail card summarizes the lead-time set and next send correctly.
- [ ] `save_compliance_item_reminders` old signature is fully replaced (no stale grants).
- [ ] `npm run typecheck && npm run lint && npm run build` pass; migration applies cleanly
      on a fresh DB and is idempotent on re-run where possible.

## Out of scope

Named one-offs (label in the email subject), per-recipient cadences, calendar-view changes,
the reminder email template (`lib/reminder-sender.ts`) — its body already renders whatever
rows the scheduler queues.
