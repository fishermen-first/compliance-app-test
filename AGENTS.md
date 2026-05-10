# AGENTS.md

## Project Overview

This is the Fishermen First compliance app. It is a Next.js app backed by Supabase and deployed on Vercel at `https://compliance.fishermenfirst.org/`.

The app manages customer compliance workspaces, imported compliance due-date workbooks, owner-code mapping, controlled login, and customer work queues.

## Product Model

- Fishermen First is the platform operator.
- Vikram / Fishermen First is the FF Admin.
- Customer companies are separate workspaces.
- Arctic Storm Management Group is a customer, not the platform owner.
- FF Admins can inspect and configure customer workspaces, but must not be treated as customer owners.
- Customer users belong to company workspaces through `company_memberships`.
- Customer roles and owner-code mappings are related but separate:
  - Role controls permissions.
  - Owner code controls which imported work defaults into a user's queue.
- Owner codes such as `ES`, `MA`, `SN`, `Ops`, and `SN/BJ` come from the customer's workbook and must be preserved as customer data.

## Non-Negotiable Safety Rules

- Do not delete, reset, import, or mutate production customer data unless the user explicitly asks for that exact operation.
- Before any production data delete, import, invite, or migration, re-check current live state. Handoff notes and prior messages are not proof.
- Never print, expose, or commit `.env.local`, Supabase service-role keys, magic links, access tokens, or secrets.
- Do not bypass controlled login or re-enable open public signup.
- Do not create or invite customer users before the relevant workspace exists and owner-code mapping has been reviewed.
- Do not assume Arctic Storm is the only future customer. It is only the first customer.
- Do not infer owner-code mappings from user names. Use explicit `company_owner_codes`.
- Do not treat test data, mock companies, or old imports as safe to preserve or delete without verification.

## Customer Onboarding Workflow

The intended FF Admin workflow is:

1. Create customer workspace.
2. Import the customer compliance workbook.
3. Review imported vessels, compliance items, reminder rules, and owner codes.
4. Map owner codes to real customer emails.
5. Invite customer users after mapping is ready.
6. Confirm first-login behavior lands users in their expected queue.

The UI should reinforce this order. If adding admin functionality, prefer guided workflow surfaces over generic dashboards.

## Workbook Import Rules

- The main historical workbook is `Compliance Tracking.xlsx`.
- New customer insert workbooks may have different names, such as `asmg_insert.xlsx`.
- The app import path prefers a sheet named `Due Dates`, then falls back to a sheet with `Vessel` and `Item` headers.
- Expected column order is:
  1. Owner
  2. Vessel
  3. Item
  4. Item Number
  5. Agency/Type
  6. Frequency Due
  7. Current Expiration
  8. Start Working On
  9. Status
  10. Status Notes
  11. Information
- Preserve owner-code case and compound codes.
- Treat company-wide vessel labels such as `ASMG`, `ASHCO`, `Company`, and `Office` as company-wide, not vessel records.
- Re-imports should update by `(company_id, source_sheet, source_row_number)`.
- Import code must not silently invite users or map owners to guessed people.

## Supabase Rules

- Use migrations for schema, RLS, enum, function, and policy changes.
- Apply DDL through the Supabase migration tool when possible.
- Keep generated Supabase types in `lib/database.types.ts` aligned with schema/function changes.
- Prefer service-role server actions only where admin behavior truly requires it.
- Keep RLS restrictive. Customer data must not be visible without company membership or FF Admin authorization.
- For new RPCs, explicitly grant only the roles that need execution.
- Before destructive data operations, query exact IDs and row counts first, and pause if real activity exists.

## Development Commands

Run the relevant checks before committing or pushing:

```bash
npm run typecheck
npm run lint
npm run build
```

For workbook import generation checks:

```bash
PYTHONDONTWRITEBYTECODE=1 /Users/fishermen-first/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/import_due_dates.py --workbook 'Compliance Tracking.xlsx' --company 'Arctic Storm Management Group' --out tmp/due-dates-import.sql --warnings tmp/due-dates-import-warnings.json
```

Known audit note:

- `npm audit --omit=dev` currently reports Next/PostCSS advisories that require a breaking Next major upgrade. Do not mix that upgrade into unrelated feature work.

## UI And UX Guidelines

- FF Admin pages are for one person: the Fishermen First operator. Avoid generic enterprise dashboard clutter.
- Admin UX should be workflow-first:
  - create workspace
  - import workbook
  - map owners
  - add users
  - verify access
- Customer UX should default to "my work first" while allowing all-owner views where role allows.
- Avoid giant banners for logged-in admin/customer work surfaces.
- Keep operational UI dense, calm, and clear. Avoid marketing-style hero layouts inside the app.
- Make "Add users" visible as a workflow step, but gated until workspace/import/mapping prerequisites are met.
- Prevent text overflow and overlapping controls at desktop and mobile widths.

## Git And Deployment

- Main branch deploys to Vercel production.
- Do not push unless the user asks for implementation or deployment, or the current task clearly includes finishing and pushing.
- Do not force-push, amend, reset hard, or revert user changes unless explicitly requested.
- If the worktree has unrelated user changes, leave them alone.
- If `.git/index.lock` or git writes fail due to permissions, request escalation rather than retrying destructive workarounds.
- After pushing, verify Vercel deployment status when practical.

## Session Continuity

`/clear` or context compaction can remove conversation history. Use durable repo breadcrumbs for long or risky work.

Before ending a long task, create or update a handoff note when useful:

- `docs/agent-handoff.md` for durable project state that should survive across sessions.
- `tmp/agent-handoff.md` for scratch state that should not be committed.

A handoff should include:

- Current goal.
- Latest user decision.
- Files changed.
- Commands run and results.
- Supabase migrations applied.
- Production data touched, if any.
- Deploy, commit, and push status.
- Known blockers or unresolved risks.
- Exact next step.

After `/clear`, first read:

```bash
cat AGENTS.md
test -f docs/agent-handoff.md && cat docs/agent-handoff.md
git status --short --branch
git log --oneline -5
```

Then inspect relevant files before editing. Never rely only on handoff notes for live data state.

## Current Project Facts To Re-Verify When Needed

- The current repo path is `/Users/fishermen-first/Documents/Codex/2026-04-26/compliance-app`.
- The Vercel project is `compliance-app-test`.
- The production domain is `https://compliance.fishermenfirst.org/`.
- Arctic Storm data has previously been reset during development. Re-check the database before assuming any current Arctic Storm state.
- Local workbook files are private customer data and should not be committed unless explicitly requested.
