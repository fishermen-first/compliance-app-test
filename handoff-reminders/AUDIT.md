# AUDIT — Reminder Schedule acceptance criteria

Audited June 16, 2026 against the shipped code. **All items pass.**

| # | Acceptance item | Verdict | Evidence |
|---|---|---|---|
| 1 | Stacked 14/7/3 lead times each schedule their own send | ✅ | Migration full-reconcile inserts one `days_before_expiration` row per offset; scheduler matches per row (`expiration_date - coalesce(days_before,0) = run_date`) and logs one row per rule |
| 2 | Removing a lead-time chip deletes only that rule | ✅ | `delete … where trigger_type='days_before_expiration'` then re-insert current set — removed value isn't re-added |
| 3 | One-off can be added/removed and fires on its date | ✅ | Inserted with `send_on`; scheduler branch `trigger_type='on_specific_date' and rule.send_on = run_date` |
| 4 | Stacked lead times DO carry forward on roll-forward | ✅ | `complete_compliance_item` copies rules `where trigger_type <> 'on_specific_date'` (keeps all `days_before_expiration`) |
| 5 | One-offs do NOT carry forward | ✅ | Same `<> 'on_specific_date'` filter excludes them from the copy |
| 6 | Recurring nudges stop once status = `submitted` | ✅ | `repeat_after_start` scheduler branch has `and item.status not in ('submitted')`; client `nextExpectedReminder` mirrors it |
| 7 | Right-rail card summarizes lead-time set + next send | ✅ | `joinLeadTimes` → "14, 7 & 3 days before"; one-off line present; `nextExpectedReminder` flatMaps all four trigger types incl. `on_specific_date` |
| 8 | Old `save_compliance_item_reminders` signature fully replaced, no stale grants | ✅ | `drop function …(…,integer,…,integer,jsonb)` + `revoke/grant execute` on the new `integer[]…date[]` signature |
| 9 | Migration applies cleanly + idempotent | ✅ | `add column if not exists`, `drop/create index if [not] exists`, `drop constraint if exists`+re-add, `create or replace` throughout |

## Specifically de-risked

**Runtime path is correct (guards #3 and #5).** The app calls `schedule_due_reminders`
(`app/actions/reminders.ts`), not `_for_company` directly. `schedule_due_reminders(uuid,
date)` is a permission wrapper that delegates to `schedule_due_reminders_for_company`,
which the June 16 migration redefined with the one-off branch + submitted-stop. So the new
logic fires on the real cron path.

**Index design is sound (guards #9).** `_item_trigger_days_idx` is partial
(`where trigger_type <> 'on_specific_date'`) with a separate `_item_oneoff_idx` on
`send_on`. The upsert's `ON CONFLICT (item_id, trigger_type, (coalesce(days_before,-1)))
WHERE trigger_type <> 'on_specific_date'` matches that partial index exactly.

## Not re-tested here
Live end-to-end email send (`lib/reminder-sender.ts`) and a real `npm run
typecheck/lint/build` on your machine — those need the running app/DB. The static code
audit above is complete.
