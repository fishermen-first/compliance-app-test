# Arctic Storm Compliance Calendar Mockup

Static front-end prototype for a small fishing company compliance calendar. Open `index.html` in a browser to use it.

## What is mocked

- Calendar and list views for audits, inspections, permits, reports, and training
- Fake vessels/sites, office users, event owners, due dates, statuses, documents, and notes
- Reminder schedules such as 30, 14, 7, and 1 day before the due date
- Email queue preview
- Default reminder rules by event type
- New event form with in-memory mock save

## Backend questions this helps surface

- Should reminder rules live globally, by event type, or per event?
- Do reminders go to users, free-form emails, role groups, or all three?
- Do events need recurrence, attachments, approval status, and audit history?
- Should email delivery status be stored per recipient and per reminder?
- Who can create, edit, complete, or archive compliance events?
