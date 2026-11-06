# Claude adversarial review of Emma workflow changes

Date: 2026-11-05. Status: original review complete; all five findings subsequently fixed locally and verified. Uncommitted.

The findings below preserve the original review evidence. See [post-review verification](workflow-verification-2026-11-05.md) for current fixes, passing full-schema/authenticated tests, and separate existing importer findings. Claude has not re-reviewed the fixes.

Claude conversation: https://claude.ai/chat/c5c08524-0e36-49c6-a670-ec62757afa28

Claude Code could not authenticate because its OAuth session had expired. The review was completed through the signed-in Claude desktop app instead. A source-only package was supplied, followed by exact supplemental migration/helper code to resolve missing-context hypotheses. Secrets, environment files, customer workbooks, and the private Word document were not included. Claude stated that it did not run tools or access live systems.

## Verified actionable findings

All five findings are P2. Four were reproduced against the isolated Postgres fixture/date helpers. The fifth was reproduced with the actual Supabase client and a mocked capped API response. These original reproduction tests demonstrated the defects at review time; the resolution and regression evidence is in the linked verification report.

### 1. Snoozing a record changes future workbook update behavior

Locations: `supabase/migrations/20261105234246_compliance_workflow_controls.sql:57`, its queue-action history insert, and `supabase/migrations/20260513000100_import_data_model_v2_phase1.sql:331`.

Snooze and unsnooze set `last_non_import_activity_at` and create a status-history row. Either makes `compliance_item_has_customer_activity` true. The existing three-argument import apply function in `20260703000100_quarter_period_labels.sql:698` then takes the source-only update branch rather than updating operational dates/status/owners/instructions.

Reproduction: a clean imported-style record returns false for the actual activity helper. Snooze it, then unsnooze it. Its snooze fields are clear, but the actual helper remains true. The branch consequence was traced in the real import function; a complete workbook import was not executed.

Suggested fix: separate queue-only audit events from operational customer activity. Do not set the operational activity marker merely for snooze/unsnooze, and exclude those event types from the import activity predicate. Preserve archive and genuine customer-edit protection. Add a snooze/unsnooze followed by workbook-update regression test.

### 2. Completed proof disappears from the default archive and CSV when archived

Location: `app/completed/page.tsx:62`, through `lib/customer-data.ts:117`.

Archive is offered for completed records, but the Completed page uses the default fetch that excludes archived rows. Its completion trail and proof remain in the database but disappear from the normal Completed view and CSV export.

Reproduction: complete a fixture record; the Completed query returns it. Archive it; the same query returns zero rows, while the stored status remains complete.

Suggested fix: include archived completed records in the proof archive and export, visibly label their archive state, and keep the default operational queues archived-excluded. Alternatively, explicitly prohibit archiving completed records, if that is the desired product rule.

### 3. Restore does not recover an already queued future reminder

Location: `supabase/migrations/20261105234246_compliance_workflow_controls.sql:115` and `:119`, interacting with scheduler deduplication.

Archive changes pending/queued/failed log rows to skipped. Restore only clears the record's archive fields. A skipped log still occupies `(reminder_rule_id, recipient_email, scheduled_for)`, so rerunning the scheduler cannot recreate it because it uses `on conflict do nothing`.

Reproduction: queue a future one-off reminder, archive and restore the record, then schedule that date again. The only delivery row remains skipped.

Suggested fix: on restore, selectively recover unsent future deliveries skipped specifically because the record was archived, rechecking current rules and recipients. Avoid replaying past reminders or reactivating messages skipped for another reason. Keep the claim/send archive checks.

### 4. Snooze return timing differs between pages for non-Los-Angeles workspaces

Locations: `app/vessels/page.tsx:73` and `:99`, `lib/compliance.ts:155` and `:168`.

The dashboard/work queue pass the workspace-local date to the queue predicate. The vessels page calls it without that date, causing the Los Angeles default to apply. Existing due/overdue helpers also use UTC, creating an additional pre-existing inconsistency.

Reproduction: at `2026-11-06T08:30:00Z`, Anchorage is still Nov 5 but Los Angeles is Nov 6. A snooze through Nov 6 remains hidden using the dashboard's Anchorage date and becomes actionable using the vessels page's default.

Suggested fix: thread the same workspace-local date into all work, date, and overdue calculations. Pick and document one fallback timezone throughout the app and SQL. Test both sides of local midnight.

### 5. The full queue is incomplete once the API's configured row cap is reached

Locations: `lib/customer-data.ts:108`, `lib/workspace-work.ts:16`, and `components/combined-dashboard.tsx:108`.

Compliance and task data are each fetched in one un-ranged request. Search, view selection, owner filtering for compliance, counts, and UI pagination then run over only the returned rows. A row omitted by the API cannot appear on a later UI page. Existing retrieval already had this limitation; the new full-queue feature inherits it.

Reproduction: run the actual `getCustomerItems` helper with the actual Supabase client and a mocked API holding 1,001 records but returning a capped 1,000-row response. The helper makes one request and returns 1,000 records without indicating the omitted row. No production workspace size or API cap was queried.

Supabase documents its default row limit and recommends range pagination: https://supabase.com/docs/reference/python/select

Suggested fix: implement server-side scoped filtering/counting/pagination, or explicitly fetch all API pages in stable order before in-memory processing. Cover both compliance records and tasks, and test a dataset beyond the configured cap.

## Other review outcomes

- Claude withdrew the proposed import-trigger failure: the actual inner import sets the flag transaction-locally and does not reset it, so its wrapper's agency post-step does not hit the new archived edit guard in that way.
- Claude withdrew the broad archived-content overwrite finding: the real customer-activity branch protects operational fields. The existing agency post-step is a narrower pre-existing exception to inspect separately.
- Claude withdrew the old-RPC compatibility hypothesis and role-helper regression after checking their actual prior definitions.
- An explicit Mine scope with no owner codes intentionally does not display everyone's compliance work as personal work. Mapping guidance could improve the empty state.
- Migration-first deployment is an existing documented release requirement, not a new confirmed implementation bug.
- FF Admin queue controls follow existing explicit platform-admin authorization; this is a product policy decision, not evidence that an admin was assigned a customer owner role.
- Re-importing an archived source row should not automatically resurrect it. Claude's suggestion to create a fresh active duplicate is not accepted without an explicit product decision.
- Lower-priority observations include inconsistent sidebar count labels, Clear filters dropping the Archived view, unbounded server-side reason text, redundant unsnooze history, and raw date formatting.
- No P0/P1 defect remained confirmed in Claude's corrected report. This is not a security certification.

## Evidence and limits

Local evidence:

- `tmp/claude-desktop-review-ax.txt` — first review transcript
- `tmp/claude-desktop-review-corrected-ax.txt` — corrected review transcript
- `tmp/verify-claude-findings.mjs` and `tmp/claude-findings-reproduction-results.txt` — four reproduced findings plus the existing fixture checks, 16 passing observations
- `tmp/verify-review-row-limit.mjs` and `tmp/claude-row-limit-reproduction.txt` — capped-response reproduction
- `tmp/claude-review-completed.png` — completed Claude review screenshot

The isolated fixture still does not include the full deployed Supabase schema, complete trigger chain, or full RLS policies. No authenticated browser-to-hosted-database flow, production import, email delivery, or migration was run. The initial source bundle omitted several overloaded/helper definitions; supplemental code resolved multiple false positives. No implementation fixes were made during this review. No staging, commit, push, or deployment occurred.

Recommended next work: fix the five verified findings, expand regression tests using the real trigger/import chain, and rerun the corrected review before deployment. User authorization to stop before committing remains in force.
