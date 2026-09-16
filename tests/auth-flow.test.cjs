const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { exports, require: id => id in mocks ? mocks[id] : require(id), console: { warn() {}, error() {} }, Set, FormData, URL });
  return exports;
}
const helpers = load('lib/auth-confirm.ts');
const token = 'a'.repeat(64);
test('redirects stay on this application', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/\nevil.test', null, ['//evil.test']]) assert.equal(helpers.safeNext(value), '/');
  assert.equal(helpers.safeNext('/settings?tab=work'), '/settings?tab=work');
});
test('confirmation requires a valid token shape and supported email type', () => {
  for (const type of ['magiclink', 'signup', 'invite', 'recovery', 'email']) assert.equal(helpers.parseConfirmation(token, type).type, type);
  for (const [t, type] of [[null,'magiclink'],['bad','magiclink'],[token,'sms'],[[token],'magiclink']]) assert.equal(helpers.parseConfirmation(t,type), null);
});
function action(client) {
  return load('app/auth/confirm/actions.ts', {
    'next/navigation': { redirect: url => { throw new Error('REDIRECT ' + url); } },
    '@/lib/supabase/server': { createClient: () => client },
    '@/lib/auth-confirm': helpers
  }).confirmSignIn;
}
function form(type='magiclink') {
  const f = new FormData(); f.set('token_hash',token); f.set('type',type); f.set('next','//evil.test'); return f;
}
test('invalid input never contacts authentication', async () => {
  await assert.rejects(action(null)(new FormData()), /REDIRECT \/auth\/confirm\?error=invalid/);
});
test('expired tokens do not accept invitations', async () => {
  let invites=0;
  const client={auth:{verifyOtp:async()=>({error:{code:'otp_expired',status:403}})},rpc:async()=>{invites++;}};
  await assert.rejects(action(client)(form()), /error=invalid/); assert.equal(invites,0);
});
test('successful confirmation uses supplied type and accepts access before redirect', async () => {
  let accepted=false;
  const client={auth:{verifyOtp:async args=>{assert.equal(args.type,'signup');assert.equal(args.token_hash,token);return {error:null};}},rpc:async name=>{assert.equal(name,'accept_company_invite');accepted=true;return {error:null};}};
  await assert.rejects(action(client)(form('signup')), /^Error: REDIRECT \/$/); assert.equal(accepted,true);
});
function linkHelper() {
  return load('lib/login-link.ts', {'server-only':{},'@/lib/env':{env:{appBaseUrl:'https://compliance.example'}},'@/lib/supabase/admin':{}}).createLoginLink;
}
test('duplicate request cannot generate a replacement token', async () => {
  let generated=0;
  const admin={rpc:async(name,args)=>{assert.equal(name,'reserve_login_link_request');assert.match(args.p_email_digest,/^[a-f0-9]{64}$/);return {data:false,error:null};},auth:{admin:{generateLink:async()=>{generated++;}}}};
  await assert.rejects(linkHelper()(admin,' MEAGAN@EXAMPLE.COM '), /requested recently/);assert.equal(generated,0);
});
test('guard failure fails closed without generating a token', async () => {
  const admin={rpc:async()=>({data:null,error:{code:'network'}})};
  await assert.rejects(linkHelper()(admin,'test@example.com'), /Unable to request/);
});
test('email link preserves provider verification type', async () => {
  const admin={rpc:async()=>({data:true,error:null}),auth:{admin:{generateLink:async args=>{assert.equal(args.email,'test@example.com');return {data:{properties:{hashed_token:token,verification_type:'signup'}},error:null};}}}};
  const url=new URL(await linkHelper()(admin,' TEST@example.com '));assert.equal(url.searchParams.get('type'),'signup');assert.equal(url.pathname,'/auth/confirm');
});
test('workspace errors keep the signed-in user on a clear support screen', async () => {
  const client={auth:{verifyOtp:async()=>({error:null})},rpc:async()=>({error:{code:'42501'}})};
  await assert.rejects(action(client)(form()), /error=workspace/);
});
test('provider outages are distinct from expired links', async () => {
  const client={auth:{verifyOtp:async()=>({error:{code:'unexpected_failure',status:503}})}};
  await assert.rejects(action(client)(form()), /error=unavailable/);
});
