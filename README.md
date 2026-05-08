# FF Compliance

Production app for FF Compliance, a maritime compliance workflow system for fishing companies.

## Current state

This repo has been converted from the static prototype into a Next.js + TypeScript app. The original static mockup is preserved in `/mockup` for reference.

## Stack

- Next.js + TypeScript
- Supabase for auth, database, row-level security, and future storage
- Resend for reminder emails
- Vercel for hosting and scheduled jobs

## Local setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when Supabase and Resend keys are ready.

## MVP scope

- Companies and roles
- Vessels and vessel contacts
- Compliance events with lifecycle statuses
- Recurrence and reminder rules
- Email queue and audit trail
- SharePoint link tracking for documents

## Prototype

The static proof of concept remains available at `/mockup/index.html`.
