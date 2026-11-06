import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compiled = ts.transpileModule(read('lib/compliance.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('exports', 'module', compiled)(mod.exports, mod);
const { daysUntil, matchesSearch, itemIsSnoozed, isWorkQueueItem, itemIsOverdue, displayState, workspaceToday } = mod.exports;
const item = { status: 'not_started', start_working_on: null, expiration_date: '2026-01-01' };

test('search requires every word, across fields, regardless of word order and spacing', () => {
  for (const q of ['Q3 record', 'record Q3', ' RECORD   q3 ', 'q3 vessel']) assert.equal(matchesSearch(q, ['Q3 record review', 'Example vessel']), true);
  assert.equal(matchesSearch('Q3 absent', ['Q3 record']), false);
  assert.equal(matchesSearch('', [null]), true);
});
test('snooze hides queue work without concealing overdue status and expires on return date', () => {
  const snoozed = { ...item, snoozed_until: '2026-11-10' };
  assert.equal(itemIsSnoozed(snoozed, '2026-11-09'), true);
  assert.equal(isWorkQueueItem(snoozed, '2026-11-09'), false);
  assert.equal(itemIsOverdue(snoozed), true);
  assert.equal(isWorkQueueItem(snoozed, '2026-11-10'), true);
  assert.equal(workspaceToday('America/Los_Angeles', new Date('2026-11-06T01:00:00Z')), '2026-11-05');
});
test('archived and undated follow-ups stay out of the attention queue', () => {
  assert.equal(isWorkQueueItem({ ...item, archived_at: '2026-11-05' }), false);
  assert.equal(itemIsOverdue({ ...item, archived_at: '2026-11-05' }), false);
  assert.equal(isWorkQueueItem({ ...item, expiration_date: null, awaiting_schedule: true }), false);
  assert.equal(displayState({ ...item, expiration_date: null, awaiting_schedule: true }), 'Awaiting schedule');
});

const ids = { company: '10000000-0000-0000-0000-000000000001', other: '10000000-0000-0000-0000-000000000002', owner: '20000000-0000-0000-0000-000000000001', user: '20000000-0000-0000-0000-000000000002', stranger: '20000000-0000-0000-0000-000000000003' };

test('migration and authorized workflow run against isolated Postgres', async (t) => {
  const db = new PGlite();
  await db.exec(read('scripts/fixtures/compliance-workflow.sql'));
  const permissions = read('supabase/migrations/20260702000100_arctic_storm_meeting_fixes.sql');
  await db.exec(permissions.slice(permissions.indexOf('create or replace function public.can_edit_compliance_item_core('), permissions.indexOf('create or replace function public.create_compliance_item(')));
  await db.exec(read('supabase/migrations/20261106004521_compliance_workflow_controls.sql'));
  await db.exec(`insert into companies values ('${ids.company}', 'America/Los_Angeles'), ('${ids.other}', 'America/Los_Angeles');
    insert into profiles values ('${ids.owner}','owner@example.test'),('${ids.user}','user@example.test'),('${ids.stranger}','stranger@example.test');
    insert into company_memberships values ('${ids.company}','${ids.owner}','owner'),('${ids.company}','${ids.user}','office_user'),('${ids.other}','${ids.stranger}','owner');
    insert into company_owner_codes values ('${ids.company}','ES','${ids.user}');`);
  const actor = async (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  const createItem = async (overrides = {}) => {
    const { rows } = await db.query(`insert into compliance_items(company_id,item_name,owner_current,recurrence_unit,recurrence_interval,expiration_date)
      values ($1,'Example inspection','ES',$2,$3,$4) returning id`, [ids.company, overrides.unit ?? 'manual', overrides.interval ?? null, overrides.expiration ?? null]);
    return rows[0].id;
  };
  const row = async (id) => (await db.query('select * from compliance_items where id=$1', [id])).rows[0];
  const queue = async (id, action, date = null, reason = null) => db.query('select set_compliance_item_queue_state($1,$2,$3,$4)', [id, action, date, reason]);
  const complete = async (id, mode, date = null, start = null) => (await db.query('select complete_compliance_item_v2($1,current_date,null,true,$2,$3,$4) as id', [id, start, date, mode])).rows[0].id;
  const future = (await db.query("select (current_date + 10)::text as day")).rows[0].day;
  await t.test('anonymous callers cannot execute either new RPC', async () => {
    const grants = (await db.query(`select has_function_privilege('anon','public.set_compliance_item_queue_state(uuid,text,date,text)','execute') as queue,
      has_function_privilege('anon','public.complete_compliance_item_v2(uuid,date,text,boolean,date,date,text)','execute') as complete,
      has_function_privilege('authenticated','public.set_compliance_item_queue_state(uuid,text,date,text)','execute') as customer`)).rows[0];
    assert.deepEqual(grants, {queue:false,complete:false,customer:true});
  });
  await t.test('outsiders and unmapped users cannot alter another company record', async () => {
    const id = await createItem(); await actor(ids.stranger);
    await assert.rejects(queue(id,'archive',null,'Duplicate'), /permission/);
    await assert.rejects(complete(id,'undated'), /permission/);
    await db.exec(`delete from company_owner_codes where user_id='${ids.user}'`); await actor(ids.user);
    await assert.rejects(queue(id,'snooze',future), /permission/);
    await db.exec(`insert into company_owner_codes values ('${ids.company}','ES','${ids.user}')`);
  });
  await t.test('authenticated role can call the RPC with its real actor identity', async () => {
    const id = await createItem(); await actor(ids.user);
    await db.exec('set role authenticated');
    try { await queue(id, 'snooze', future); } finally { await db.exec('reset role'); }
    assert.ok((await row(id)).snoozed_until);
  });
  await t.test('mapped users can snooze and unsnooze with dates and activity preserved', async () => {
    await actor(ids.user); const id = await createItem();
    await assert.rejects(queue(id,'snooze','2000-01-01'), /after today/);
    await queue(id,'snooze',future,'Waiting for renewal window');
    const saved = await row(id); assert.ok(saved.snoozed_until); assert.equal(saved.snooze_reason,'Waiting for renewal window'); assert.equal(saved.last_non_import_activity_at, null);
    assert.equal((await db.query('select compliance_item_has_customer_activity($1) as active',[id])).rows[0].active, false);
    await queue(id,'unsnooze'); assert.equal((await row(id)).snoozed_until,null);
    assert.equal((await db.query('select compliance_item_has_customer_activity($1) as active',[id])).rows[0].active, false);
  });
  await t.test('manual undated work creates one linked follow-up with standing rules and owners', async () => {
    await actor(ids.user); const id = await createItem();
    await db.query("insert into compliance_item_owner_codes values ($1,'ES',true),($1,'Ops',false)",[id]);
    await db.query("insert into compliance_item_reminder_rules(item_id,company_id,label,trigger_type,send_on) values ($1,$2,'Recurring','on_start_date',null),($1,$2,'One-off','on_specific_date',current_date)",[id,ids.company]);
    await db.query("insert into compliance_item_notification_recipients(item_id,company_id,recipient_email) values ($1,$2,'external@example.test')",[id,ids.company]);
    const next = await complete(id,'undated'); assert.ok(next); const follow = await row(next);
    assert.equal(follow.awaiting_schedule,true);assert.equal(follow.expiration_date,null);assert.equal(follow.previous_item_id,id);assert.equal((await row(id)).status,'complete');
    assert.equal((await db.query('select * from compliance_item_owner_codes where item_id=$1',[next])).rows.length,2);
    assert.equal((await db.query('select * from compliance_item_reminder_rules where item_id=$1',[next])).rows.length,1);
    assert.equal((await db.query('select * from compliance_item_notification_recipients where item_id=$1',[next])).rows.length,1);
    await assert.rejects(complete(id,'undated'), /already complete/);
    await db.query('update compliance_items set start_working_on=current_date where id=$1',[next]);assert.equal((await row(next)).awaiting_schedule,false);
  });
  await t.test('completion choices support no follow-up, explicit dates and existing automatic cycles', async () => {
    const none=await createItem();assert.equal(await complete(none,'none'),null);
    const manual=await createItem();await assert.rejects(complete(manual,'dated'),/required/);const dated=await complete(manual,'dated',future);assert.equal((await row(dated)).awaiting_schedule,false);
    const annual=await createItem({unit:'years',interval:1,expiration:'2026-11-01'});const automatic=await complete(annual,'automatic');assert.equal((await row(automatic)).expiration_date.toISOString().slice(0,10),'2027-11-01');
  });
  await t.test('archive cancels queued reminders, blocks completion and survives import updates', async () => {
    await actor(ids.owner);const id=await createItem();
    await db.query("insert into reminder_send_log(company_id,item_id,status,scheduled_for) values ($1,$2,'queued',now())",[ids.company,id]);
    await queue(id,'archive',null,'Duplicate record');assert.ok((await row(id)).archived_at);
    assert.equal((await db.query('select status from reminder_send_log where item_id=$1',[id])).rows[0].status,'skipped');
    await assert.rejects(complete(id,'undated'),/Restore/);
    await assert.rejects(db.query("update compliance_items set status='in_progress' where id=$1",[id]), /Restore/);
    assert.equal((await db.query("select event_type from compliance_item_status_history where item_id=$1",[id])).rows[0].event_type,'archive');
    await db.exec("select set_config('app.import_v2_apply','on',false)");
    await db.query("update compliance_items set archived_at=null, archive_reason=null where id=$1",[id]);assert.ok((await row(id)).archived_at);
    await db.exec("select set_config('app.import_v2_apply','off',false)");
    await queue(id,'restore');assert.equal((await row(id)).archived_at,null);
  });
  await t.test('scheduler and claim exclude archived and awaiting records, but snooze keeps reminders', async () => {
    const open = await createItem(), archived = await createItem(), awaiting = await createItem();
    await queue(archived,'archive',null,'Obsolete');await queue(open,'snooze',future);
    await db.query('update compliance_items set awaiting_schedule=true where id=$1',[awaiting]);
    for(const id of [open,archived,awaiting]) await db.query("insert into compliance_item_reminder_rules(item_id,company_id,label,trigger_type,send_on) values ($1,$2,'Today','on_specific_date',current_date)",[id,ids.company]);
    await db.query('select schedule_due_reminders_for_company($1,current_date)',[ids.company]);
    assert.equal((await db.query('select * from reminder_send_log where item_id=$1',[open])).rows.length,1);
    assert.equal((await db.query('select * from reminder_send_log where item_id=$1',[awaiting])).rows.length,0);
    // Already-queued stale messages must also be blocked at claim time.
    for (const id of [archived,awaiting]) await db.query("insert into reminder_send_log(company_id,item_id,scheduled_for) values ($1,$2,now()-interval '1 hour')",[ids.company,id]);
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    await db.query("update reminder_send_log set scheduled_for=now()-interval '1 hour' where item_id=$1",[open]);
    const claims=await db.query('select * from claim_due_reminders($1,100)',[ids.company]);
    assert.equal(claims.rows.some(r=>r.item_id===open),true);assert.equal(claims.rows.some(r=>r.item_id===archived),false);assert.equal(claims.rows.some(r=>r.item_id===awaiting),false);
  });
  await db.close();
});

 test('company-local midnight controls all date states, including Anchorage before LA midnight', () => {
 const instant = new Date('2026-11-06T08:30:00Z');
 const today = workspaceToday('America/Anchorage', instant);
 assert.equal(today, '2026-11-05');
 const dated = {...item, start_working_on:'2026-11-06', expiration_date:'2026-11-05'};
 assert.equal(daysUntil(dated.start_working_on,today),1);
 assert.equal(displayState(dated,today),'Not due yet');
 assert.equal(itemIsOverdue(dated,today),false);
 assert.equal(isWorkQueueItem(dated,today),false);
 assert.equal(displayState(dated,'2026-11-06'),'Due');
 assert.equal(itemIsOverdue(dated,'2026-11-06'),true);
});

const pagesModule = { exports: {} };
new Function('exports', 'module', ts.transpileModule(read('lib/fetch-all-rows.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(pagesModule.exports, pagesModule);
const { fetchAllRows } = pagesModule.exports;
test('API pages below the requested size still return every record, without duplication', async () => {
  const records = Array.from({length:1105}, (_,id) => ({id}));
  const loaded = await fetchAllRows(async (from,to) => ({data:records.slice(from,Math.min(to+1,from+200)),error:null,count:records.length}));
  assert.deepEqual(loaded,records);
});
test('partial API failures cannot silently masquerade as a complete list', async () => {
  await assert.rejects(fetchAllRows(async(from) => from ? {data:null,error:{message:'Page unavailable'},count:null} : {data:[{id:1}],error:null,count:2}),/Page unavailable/);
  await assert.rejects(fetchAllRows(async(from) => ({data:from?[]:[{id:1}],error:null,count:2})),/Refresh/);
});
