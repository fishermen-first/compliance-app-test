// Full-schema integration. Explicit local Supabase status file only; never reads .env.local.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const statusFile = process.argv[2];
if (!statusFile) throw Error('Pass the status JSON from an isolated local Supabase project');
const config = JSON.parse(fs.readFileSync(statusFile,'utf8'));
assert.equal(config.API_URL, 'http://127.0.0.1:55421', 'Only the isolated workflow test port is permitted');
const options = {auth:{persistSession:false,autoRefreshToken:false}};
const admin = createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const anon = createClient(config.API_URL,config.ANON_KEY,options);
const ok = ({data,error}) => {if(error) throw Error(error.message);return data;};
const run = randomUUID().slice(0,8);
const company=ok(await admin.from('companies').insert({name:`Isolated workflow ${run}`,timezone:'America/Anchorage'}).select().single());
const other=ok(await admin.from('companies').insert({name:`Other isolated workspace ${run}`}).select().single());
const users = {};
// Follow controlled onboarding: workspace and explicit owner code exist before invitations.
ok(await admin.from('company_owner_codes').insert({company_id:company.id,code:'ES'}));
for (const role of ['owner','mapped','unmapped','outsider']) {
 const email = `${role}-${run}@example.test`, password=randomUUID()+randomUUID();
 ok(await admin.from('company_invitations').insert({company_id:role==='outsider'?other.id:company.id,email,role:role==='owner'||role==='outsider'?'owner':'office_user'}));
 const {user} = ok(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Local ${role}`}}));
 ok(await admin.from('profiles').upsert({id:user.id,email,full_name:`Local ${role}`}));
 const client=createClient(config.API_URL,config.ANON_KEY,options);
 ok(await client.auth.signInWithPassword({email,password})); users[role]={id:user.id,email,client};
}
for(const [role,user] of Object.entries(users)) ok(await admin.from('company_memberships').insert({company_id:role==='outsider'?other.id:company.id,user_id:user.id,role:role==='owner'||role==='outsider'?'owner':'office_user'}));
ok(await admin.from('company_owner_codes').update({user_id:users.mapped.id}).eq('company_id',company.id).eq('code','ES'));
const createItem=async(name,extra={})=>ok(await admin.from('compliance_items').insert({company_id:company.id,item_name:name,owner_current:'ES',recurrence_unit:'manual',...extra}).select().single());
const get=async(id)=>ok(await admin.from('compliance_items').select('*').eq('id',id).single());
const queue=(client,id,action,extra={})=>client.rpc('set_compliance_item_queue_state',{target_item_id:id,queue_action:action,...extra});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:company.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const future=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
const log = (name) => console.log(`PASS ${name}`);
const target=await get((await createItem('Q3 record review')).id);
for(const client of [anon,users.outsider.client]) {
 const read=await client.from('compliance_items').select('id').eq('id',target.id);
 assert.ok(read.error || read.data.length===0);
 assert.ok((await queue(client,target.id,'snooze',{return_on:future})).error);
 assert.ok((await client.rpc('complete_compliance_item_v2',{target_item_id:target.id,completion_date:today,next_record_mode:'undated'})).error);
}
assert.ok((await queue(users.unmapped.client,target.id,'archive',{reason:'Forbidden'})).error);
log('real anonymous/outsider RLS and RPC denial; unmapped user denied writes');
ok(await queue(users.mapped.client,target.id,'snooze',{return_on:future,reason:'Waiting for renewal'}));
assert.equal((await get(target.id)).last_non_import_activity_at,target.last_non_import_activity_at);
ok(await queue(users.mapped.client,target.id,'unsnooze'));
assert.equal((await get(target.id)).last_non_import_activity_at,target.last_non_import_activity_at);
log('real mapped-user snooze/unsnooze with operational-edit marker preserved');
// Exercise actual parser and all current import wrappers and triggers.
const source=fs.readFileSync('lib/workbook-import.ts','utf8');
const mod={exports:{}};
new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText)(require,mod,mod.exports);
const ExcelJS=require('exceljs');
const workbook = new ExcelJS.Workbook();
const sheet=workbook.addWorksheet('Due Dates');
sheet.addRow(['owner_code','vessel_or_scope','item_name','item_number','regulatory_party','compliance_domain','obligation_type','applicability_scope','frequency','start_working_on','due_or_expiration_date']);
sheet.addRow(['ES','Company','Imported review',null,null,'Other',null,null,'Manual',new Date('2026-11-01T00:00:00Z'),new Date('2026-12-01T00:00:00Z')]);
const parser=mod.exports.parseComplianceWorkbook;
assert.equal(typeof parser,'function');
async function importWorkbook() {
 const parsed=await parser(Buffer.from(await workbook.xlsx.writeBuffer()));
 const dry=ok(await admin.rpc('dry_run_compliance_workbook_import',{target_company_id:company.id,target_sheet:parsed.summary.sheet,workbook_name:'synthetic-test.xlsx',detected_format:parsed.summary.detectedFormat,parser_version:parsed.summary.parserVersion,records:parsed.records,parse_summary:parsed.summary,imported_by:users.owner.id}));
 const issues=ok(await admin.from('compliance_import_issues').select('id').eq('import_run_id',dry));
 ok(await admin.rpc('apply_compliance_workbook_import',{target_import_run_id:dry,approved_issue_ids:issues.map(r=>r.id),applied_by:users.owner.id,resolutions:issues.map(r=>({issue_id:r.id,action:'approve'}))}));
 return ok(await admin.from('compliance_items').select('*').eq('company_id',company.id).eq('source_sheet','Due Dates').eq('source_row_number',2).single());
}
let imported=await importWorkbook();
ok(await queue(users.mapped.client,imported.id,'snooze',{return_on:future}));
ok(await queue(users.mapped.client,imported.id,'unsnooze'));
// Keep identical reviewed source data: changed-row approval is a separate existing importer issue.
imported=await importWorkbook();
assert.equal(imported.expiration_date,'2026-12-01');
assert.equal(imported.last_import_action,'updated');
assert.equal(imported.last_non_import_activity_at,null);
log('full workbook parser → dry run → apply → re-import stays unprotected after snooze/unsnooze');
const manual=await createItem('Manual recurring review');
const nextId=ok(await users.mapped.client.rpc('complete_compliance_item_v2',{target_item_id:manual.id,completion_date:today,next_record_mode:'undated'}));
assert.equal((await get(manual.id)).status,'complete');assert.equal((await get(nextId)).awaiting_schedule,true);
assert.equal((await get(nextId)).previous_item_id,manual.id);
assert.equal(ok(await admin.from('compliance_item_owner_codes').select('*').eq('item_id',nextId))[0].owner_code,'ES');
log('authenticated completion and linked undated follow-up through real owner-code triggers');
// Future reminder cancellation/restoration with current recipients/rules checked.
const reminderItem=await createItem('Future reminder recovery');
const rule=ok(await admin.from('compliance_item_reminder_rules').insert({item_id:reminderItem.id,company_id:company.id,label:'Future',trigger_type:'on_specific_date',send_on:future,audience:'owner'}).select().single());
ok(await users.owner.client.rpc('schedule_due_reminders',{target_company_id:company.id,target_run_date:future}));
let reminders=ok(await admin.from('reminder_send_log').select('*').eq('item_id',reminderItem.id));
assert.equal(reminders.length,1);const reminderId=reminders[0].id;
ok(await queue(users.owner.client,reminderItem.id,'archive',{reason:'Temporary withdrawal'}));
assert.equal(ok(await admin.from('reminder_send_log').select('*').eq('id',reminderId).single()).status,'skipped');
ok(await queue(users.owner.client,reminderItem.id,'restore'));
assert.equal(ok(await admin.from('reminder_send_log').select('*').eq('id',reminderId).single()).status,'scheduled');
// Restore never revives deliveries for disabled rules, removed recipients, or past dates.
for(const condition of ['disabled','recipient','past','other reason']) {
 ok(await queue(users.owner.client,reminderItem.id,'archive',{reason:'Test selective recovery'}));
 if(condition==='disabled')ok(await admin.from('compliance_item_reminder_rules').update({active:false}).eq('id',rule.id));
 if(condition==='recipient')ok(await admin.from('company_owner_codes').update({user_id:null}).eq('company_id',company.id).eq('code','ES'));
 if(condition==='past')ok(await admin.from('reminder_send_log').update({scheduled_for:new Date(Date.now()-86400000).toISOString()}).eq('id',reminderId));
 if(condition==='other reason')ok(await admin.from('reminder_send_log').update({failure_reason:'Delivery suppressed'}).eq('id',reminderId));
 ok(await queue(users.owner.client,reminderItem.id,'restore'));
 assert.equal(ok(await admin.from('reminder_send_log').select('*').eq('id',reminderId).single()).status,'skipped');
 ok(await admin.from('compliance_item_reminder_rules').update({active:true}).eq('id',rule.id));
 ok(await admin.from('company_owner_codes').update({user_id:users.mapped.id}).eq('company_id',company.id).eq('code','ES'));
 ok(await admin.from('reminder_send_log').update({status:'scheduled',failure_reason:null,scheduled_for:reminders[0].scheduled_for}).eq('id',reminderId));
}
log('archive/restore recovers eligible future reminders and excludes disabled/removed/past/other skips');
// Archive completed proof remains readable, while operational lists omit it.
ok(await queue(users.owner.client,manual.id,'archive',{reason:'Retained proof record'}));
assert.equal(ok(await users.mapped.client.from('compliance_items').select('*').eq('id',manual.id).single()).status,'complete');
assert.equal(ok(await users.mapped.client.from('compliance_items').select('id').eq('id',manual.id).is('archived_at',null)).length,0);
log('archived completed proof remains readable with original completion history');
// > API limit dataset for the browser and actual loader test.
for(let offset=0;offset<1105;offset+=250) {
 const rows=Array.from({length:Math.min(250,1105-offset)},(_,i)=>({company_id:company.id,item_name:`Bulk review ${String(offset+i).padStart(4,'0')}`,owner_current:'ES',start_working_on:'2026-01-01',expiration_date:'2026-02-01'}));
 ok(await admin.from('compliance_items').insert(rows));
}
const bulkTaskRows=Array.from({length:1005},(_,i)=>({company_id:company.id,title:`Bulk task ${String(i).padStart(4,'0')}`,assigned_to:users.mapped.id,created_by:users.owner.id}));
for(let offset=0;offset<bulkTaskRows.length;offset+=250)ok(await users.owner.client.from('workspace_tasks').insert(bulkTaskRows.slice(offset,offset+250)));
// Load actual TypeScript server loaders with only the local authenticated client supplied.
function loadTs(path,dependencies) {const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id)=>{if(id in dependencies)return dependencies[id];throw Error('Unexpected module '+id);},m,m.exports);return m.exports;}
const compliance=loadTs('lib/compliance.ts',{});
const fetchAll=loadTs('lib/fetch-all-rows.ts',{});
const customer=loadTs('lib/customer-data.ts',{'@/lib/fetch-all-rows':fetchAll,'@/lib/supabase/server':{createClient:()=>users.mapped.client},'next/navigation':{redirect:()=>{throw Error('Unexpected redirect');}}});
const loader=loadTs('lib/workspace-work.ts',{'@/lib/fetch-all-rows':fetchAll,'@/lib/customer-data':customer,'@/lib/compliance':compliance,'@/lib/supabase/server':{createClient:()=>users.mapped.client}});
const loaded=await loader.getWorkspaceWork({companyId:company.id,userId:users.mapped.id,role:'office_user'});
assert.ok(loaded.complianceItems.length>1105);assert.ok(loaded.complianceItems.some(r=>r.item_name==='Bulk review 1104'));
assert.equal(loaded.tasks.length,1005);assert.ok(loaded.tasks.some(r=>r.title==='Bulk task 1004'));
assert.ok(!loaded.complianceItems.some(r=>r.id===manual.id));
assert.ok((await customer.getCustomerItems(company.id,{includeArchived:true})).some(r=>r.id===manual.id));
log('actual authenticated loaders retrieve every compliance record and task beyond the 1,000-row API cap');
const link=ok(await admin.auth.admin.generateLink({type:'magiclink',email:users.mapped.email}));
const output={companyId:company.id,manualId:manual.id,nextId,targetId:target.id,reminderItemId:reminderItem.id,userId:users.mapped.id,email:users.mapped.email,loginUrl:`http://127.0.0.1:3107/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=${link.properties.verification_type}`};
fs.writeFileSync('tmp/workflow-integration/browser-state.json',JSON.stringify(output),{mode:0o600});
console.log('PASS local browser fixture prepared; credentials are saved privately and were not printed');
