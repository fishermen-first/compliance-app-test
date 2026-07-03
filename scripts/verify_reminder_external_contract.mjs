import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function loadReminderEmailModule() {
  const ts = require('typescript');
  const source = read('lib/reminder-email.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(compiled, {
    exports: module.exports,
    Intl,
    module,
    require
  });

  return module.exports;
}

const reminder = {
  item_id: '00000000-0000-4000-8000-000000000001',
  item_name: 'External Drill Log',
  expiration_date: '2026-08-05',
  instructions: 'Send the signed drill log to the office.',
  vessel_name: 'Arctic Storm'
};

const appBaseUrl = 'https://compliance.fishermenfirst.org';

test('external reminder email is no-login while owner copy links back to the app', () => {
  const { buildReminderEmail } = loadReminderEmailModule();

  const external = buildReminderEmail(reminder, {
    recipientKind: 'external',
    ownerName: 'Emma Scalisi',
    ownerEmail: 'emma@example.com',
    appBaseUrl
  });

  assert.match(external.body, /No login or reply is needed/);
  assert.match(external.html, /No login or reply is needed/);
  assert.doesNotMatch(external.body, /Open in FF Compliance/);
  assert.doesNotMatch(external.html, /\/items\/00000000-0000-4000-8000-000000000001/);

  const ownerCopy = buildReminderEmail(reminder, {
    recipientKind: 'office',
    ownerName: 'Emma Scalisi',
    ownerEmail: 'emma@example.com',
    appBaseUrl
  });

  assert.match(ownerCopy.body, /Open in FF Compliance/);
  assert.match(ownerCopy.body, /\/items\/00000000-0000-4000-8000-000000000001/);
  assert.match(ownerCopy.html, /\/items\/00000000-0000-4000-8000-000000000001/);
  assert.doesNotMatch(ownerCopy.body, /No login or reply is needed/);
});

test('database reminder contract queues owner copy, external recipient, and send-log rows', () => {
  const meetingMigration = read('supabase/migrations/20260702000100_arctic_storm_meeting_fixes.sql');
  const initialReminderSchema = read('supabase/migrations/20260509233047_access_roles_and_invites.sql');
  const sender = read('lib/reminder-sender.ts');

  assert.match(meetingMigration, /rule\.audience/);
  assert.match(meetingMigration, /where due_rules\.audience in \('owner', 'external'\)/);
  assert.match(meetingMigration, /where due_rules\.audience = 'external'/);
  assert.match(meetingMigration, /insert into public\.reminder_send_log/);
  assert.match(meetingMigration, /reminder_rule_id,\s*recipient_email,\s*'Reminder: ' \|\| item_name/s);
  assert.match(meetingMigration, /on conflict do nothing/);

  assert.match(initialReminderSchema, /unique\(reminder_rule_id, recipient_email, scheduled_for\)/);

  assert.match(sender, /compliance_item_notification_recipients/);
  assert.match(sender, /recipient_type/);
  assert.match(sender, /recipientKind: \['additional', 'external'\]\.includes/);
  assert.match(sender, /reminder_send_log'\)\s*[\s\S]*\.update\(\{\s*status: 'sent'/);
});
