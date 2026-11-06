# Emma workflow fixes: verification after adversarial review

Updated 2026-11-05. Local implementation only; no commit or push.

## Resolved findings

1. Snooze/unsnooze no longer set the operational activity marker. The customer-activity helper ignores those two audit-event types. Archive/restore and real operational edits remain protected. Redundant unsnooze calls are no-ops.
2. Completed records and their CSV include archived completions, labelled with their archive state/reason. Completion attribution reads status-change events only. History retrieval is paged as well as record retrieval.
3. Restore recovers only unsent future reminder deliveries skipped specifically because of archive. It rechecks record state, active rule and matching trigger date, and current owner/direct/group recipient eligibility. Past deliveries and unrelated skip reasons stay skipped.
4. Live work surfaces use the company's local date for queue, status, overdue, relative-day, and snooze calculations. The fallback is America/Los_Angeles. Manual reminder scheduling delegates date selection to the company's database timezone.
5. Compliance and full-queue task loaders retrieve every API page in stable order, with an exact count and ID tie-breaker. Pagination/search operate over the complete scoped result. API failures and incomplete loading raise errors instead of displaying a silently partial list.

Browser testing also found that the archive dialog stayed open after a successful server action. It now closes on valid form submission; the corrected archive and restore flow was retested.

## Passing checks

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify:workflow`: 15 checks, including executing the migration against isolated Postgres, permissions, rollover, snooze/import activity, date boundaries, and capped/erroring API pages.
- `npm run verify:import-v2`: 11 checks.
- `npm run verify:reminders`: 2 checks.
- `git diff --check`

The total above is 28 node test results, including the parent Postgres test. Full-schema checks below are additional integration scenarios, not included in that count.

## Full-schema authenticated integration

A dedicated local Supabase project was created at `/private/tmp/ff-compliance-workflow-integration`, project ID `ff-emma-workflow-local`, API port 55421. All existing repository migrations were applied, followed by `20261106004521_compliance_workflow_controls.sql` through `supabase migration up --local`. No hosted project was linked or modified.

The executable harness is `scripts/verify_workflow_local.mjs`. It refuses any API URL except `http://127.0.0.1:55421`, never reads `.env.local`, and accepts an explicit local status JSON path:

```text
npm run verify:workflow-local -- tmp/workflow-integration/status.json
```

Regenerate that ignored status file from this isolated project before rerunning. It contains local credentials and must not be printed or committed. Each run creates new synthetic companies and users in this local project only. Workspace and owner-code setup precede local invitations; controlled signup was not disabled.

Passing scenario groups:

- Real anonymous and other-workspace clients cannot read or mutate target records; an unmapped office user cannot manage them.
- A real mapped office user can snooze/unsnooze, preserving the post-trigger activity marker.
- The real workbook parser, dry-run RPC, apply wrappers and owner-code/activity triggers support an unchanged-source re-import after snooze/unsnooze, taking `last_import_action = updated` rather than `source_only_update`.
- Real authenticated completion creates the linked Awaiting schedule follow-up and carries explicit owner-code rows through the actual triggers.
- Archive/restore recovers an eligible future reminder, and excludes disabled rules, removed recipients, past deliveries, and unrelated skip reasons.
- Archived complete records retain status and history and remain readable, while the operational query excludes them.
- Actual application loaders, using a real authenticated local Supabase client, retrieve all 1,105 bulk compliance records plus fixture records, and all 1,005 tasks. Last records are present and archived records follow the requested view.
- Local browser fixture setup completes without changing authentication settings or using production credentials.

Log: `tmp/workflow-integration/full-schema.log`.

## Authenticated browser checks

A sanitized source copy ran on port 3107 with only local Supabase credentials; no production environment file or email provider credentials were copied. The browser used the normal one-time-link confirmation and workspace-access acceptance flow. No test login bypass route was introduced. The email-request/provider leg was not exercised.

Confirmed in the UI:

- Dashboard View all work opens `/work`, showing the complete 2,113-record initial queue and 106 pages.
- Searching the queue finds Bulk review 1104 beyond the API cap.
- Snoozing removes that record from active work while retaining it in Snoozed, with reason, date, Unsnooze control, and overdue indicator.
- `Q3 record` and `record Q3` find the same record ID in Compliance records.
- Completing the undated record creates a linked follow-up, visibly Awaiting schedule.
- Archive and restore work through the actual server actions; archived records are read-only until restored.
- Completed records retain both archived synthetic completions with the original completion actor and final note. The actual rendered CSV data includes the completion, `Archived = Yes`, and archive reason.

Screenshots:

- `tmp/workflow-integration/snoozed-work.png`
- `tmp/workflow-integration/archived-proof.png`

## Separate existing importer findings

`lib/workbook-import.ts` and the historical import migrations were not modified by this work.

A synthetic changed-date re-import remained skipped: resolving a `row_changed` review through the current apply wrapper creates another open `row_changed` issue in `_import_v3_apply_source_row_matches`. The working regression therefore verifies unchanged-source re-import and the actual `updated` branch; it does not claim that changed-source review/apply works. Fix that importer-review behavior separately before relying on changed workbook updates.

An exact synthetic legacy Due Dates header was also classified as an incomplete FF template by `assertTemplateHeaderShape`. The full-schema regression used the valid FF template instead. This existing parser behavior needs a separate targeted fix and tests.

## Limits and release boundary

No production customer data, hosted migration, real invitation, or email delivery was touched. No staging, commit, push, or deployment occurred. These fixes were not sent back to Claude for a second review. Local full-schema integration is stronger evidence than the initial fixture, but is not verification of the current hosted schema or an email-provider end-to-end test.

The local test app and dedicated Supabase services were stopped after verification; synthetic database state remains isolated in that project's local storage. Before any future hosted migration or release, recheck target identity, live schema/grants/RLS, and customer state, then apply the migration before releasing code that needs its new columns/RPCs. The user's stop-before-commit instruction still applies.


## Exact commit-scope verification

Before the authorized commit/push, an isolated copy of the staged index was tested without the four unrelated pre-existing invitation/settings/style/import-test edits. Typecheck, lint, and all 27 applicable node test results passed (15 workflow, 10 baseline import, 2 reminders). This explains the one-test difference from the full-workspace count above. The staged production build also passed after allowing the standard Google Fonts download. The push targets a review branch, not main; no hosted migration or production release is included.
