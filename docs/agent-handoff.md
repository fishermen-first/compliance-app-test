# Emma workflow fixes — local review

Updated 2026-11-05.

## Goal and latest user decision

Implement Emma's five requests from the reviewed mockup. Stop before committing or pushing. No production migration or customer data operation is authorized by this local implementation task.

## Implemented

- Compliance snooze with a return date and optional reason. Removes records from attention queues, with automatic return on the workspace-local date. Expiration, overdue totals, and email reminders stay unchanged.
- `/work` shows the complete attention queue with pagination, search, Mine/Everyone scope, Snoozed, Awaiting schedule, and Archived views. Dashboard View all work links here rather than a page anchor.
- Search requires all typed words anywhere in the item/vessel/item-number text, regardless of order or case. Search preserves record filters.
- Completion supports complete only, existing automatic cycles, an undated follow-up, or manually supplied next dates. Undated follow-ups are Awaiting schedule until dates are set or work starts. Standing rules, recipients, and explicit owner codes carry forward; one-off reminders do not.
- Archive/restore replaces permanent deletion. Archive hides records from operational lists and cancels pending compliance reminders; recurring rules and history remain for restore. Scheduling, claiming, and the sender recheck record state. Already dispatched email cannot be recalled.
- Archive/restore count as customer activity for workbook import protection. Snooze/unsnooze remain separately audited and do not freeze imports. Import updates preserve workflow flags. Queue history uses event_type so archiving/restoring a completed item does not misattribute completion in the proof archive.
- Row actions return to their originating list and preserve filters. Task editing preserves an existing link when its compliance record is archived.

## Files

New files:

- app/work/page.tsx
- app/workflow.css
- components/item-queue-controls.tsx
- lib/workspace-work.ts
- scripts/verify_compliance_workflow.mjs
- scripts/fixtures/compliance-workflow.sql
- supabase/migrations/20261105234246_compliance_workflow_controls.sql

Related changes are in the dashboard, completion modal, record details/list, sidebar, customer data helpers, generated database types, reminder sender, task refresh/link behavior, schedule/completed/vessel pages, layout, and package files. The pinned PGlite development dependency runs isolated Postgres tests without external database access.

Pre-existing changes were preserved, not implemented as part of this task:

- app/actions/invitations.ts
- app/globals.css
- app/settings/page.tsx
- scripts/verify_import_v2_contract.mjs
- untracked private `compliance tracker questions 2026-07-09.docx`

Do not accidentally include that private document when staging.

## Verification

Final checks pass:

- npm run typecheck
- npm run lint
- npm run build (includes `/work`; temporary preview route absent)
- npm run verify:workflow — 15 tests pass, including actual migration execution in an isolated PGlite/Postgres fixture and authenticated actor permission checks
- npm run verify:import-v2 — 11 tests pass
- npm run verify:reminders — 2 tests pass
- git diff --check

`npm run verify:settings-access` stops before running because VERIFY_SETTINGS_COMPANY_ID is not configured. It was not run against customer data.

Browser verification used a temporary development-only route with fictional records. Confirmed six-row dashboard vs eight-record full queue, identical matches for both search orders, snooze/archive dialogs, completion mode switching, and mobile width without page overflow. The temporary route and localhost server were removed/stopped before the final build. Screenshot: tmp/completion-desktop.png. No production form was submitted.

## Database, Git, and deploy status

- The migration is prepared locally only. No hosted migrations were applied.
- Generated types were aligned manually with this migration, since it has not been applied to a hosted database.
- No production data touched, invitations created, emails sent, or login settings changed.
- Nothing staged, committed, pushed, or deployed. HEAD remains bba2ae5.
- Origin is https://github.com/fishermen-first/compliance-app-test.git. Main deploys production.

## Next step and limits

Review the local changes with the user. Do not commit or push without a new explicit instruction. Before a hosted migration/deployment, re-check the actual target schema, grants, policies, and customer state, then test the complete authenticated browser-to-database flow in an isolated environment. Current database verification uses a focused Postgres fixture, not the full deployed Supabase schema. Migration must precede release of code that queries the new columns/RPCs.

## Claude adversarial review — 2026-11-05

User requested Claude review. Completed through the signed-in desktop app after CLI OAuth failed. Source-only package; no secrets/customer documents. Full verified report is docs/claude-adversarial-review-2026-11-05.md. Claude corrected several missing-context hypotheses after a follow-up.

At original review time, five verified P2 findings remained: snooze/unsnooze causes source-only future workbook updates; archiving completed records hides them from Completed/CSV; restore cannot recover queued future reminders marked skipped; vessels page evaluates snooze using the wrong timezone; the full queue silently inherits the API row cap. Four were reproduced in an isolated Postgres/date fixture and one with a mocked capped API response. No code fixes were made in the review turn. Do not treat earlier passing tests as proof these cases work. Next: fix these findings and extend the regression suite when continuing implementation. No commits, pushes, migrations, emails, or customer data changes.


## Post-review implementation and full-schema verification

Latest user decision: "okay do that" authorized fixing the five verified findings and stronger local regression/authenticated integration testing. All five were fixed. Still stop before staging, committing or pushing.

Current evidence and limits: docs/workflow-verification-2026-11-05.md supersedes the earlier fixture-only limits and open review findings above. Typecheck, lint, build, 15 workflow checks, 11 import checks, 2 reminder checks, and diff whitespace validation pass. Additional full-schema local Supabase tests exercised real authentication/RLS, owner-code triggers, importer wrappers, completion, reminder recovery, and retrieval beyond the API cap. Browser used actual local login confirmation and server actions; no test bypass route.

New related files: lib/fetch-all-rows.ts, scripts/verify_workflow_local.mjs, docs/workflow-verification-2026-11-05.md. Updated date handling also touches app/actions/reminders.ts and the legacy dashboard callback signature. Production remains untouched; only the dedicated local project's migration was applied. No real invitation or email delivery.

Separate pre-existing import issues were observed: changed-source review/apply recreates an open row_changed issue, and the synthetic exact legacy header is rejected as an incomplete FF template. They were documented rather than silently folded into these fixes. The successful import regression verifies unchanged-source re-import uses the actual updated branch after snooze/unsnooze.

Local services at /private/tmp/ff-compliance-workflow-integration (API55421/app3107) were stopped; test storage is separate and synthetic. Raw ignored status/browser fixture files contain local credentials and must not be displayed or committed. No commit/push/deployment; HEAD bba2ae5. Exact next step: review the final local changes and the separate importer findings with the user. Do not deploy or commit without a new explicit instruction.


## Commit and push authorization — 2026-11-05

User explicitly requested committing and pushing Emma's changes. Push a `codex/emma-workflow-fixes` review branch to fishermen-first/compliance-app-test; do not release to production or apply a hosted migration. The separate workbook-import fixes are deferred. Exclude the pre-existing invitation/settings/global-style/import-test changes and private Word document. Validate the exact staged snapshot before committing. A preview build is not a functional hosted verification until the workflow migration exists in its isolated database.
