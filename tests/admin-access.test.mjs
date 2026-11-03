import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {adminAccessHarness} from './helpers/admin-access-harness.mjs';
test('starts locked, checks only once despite repeated starts, and only verified admin reply enables UI',async()=>{
  const h=adminAccessHarness();assert.equal(h.sent.length,0);assert.equal(h.states.at(-1).allowed,false);
  for(let i=0;i<1000;i++)h.api.start();assert.equal(h.sent.length,1);assert.equal(h.states.at(-1).reason,'checking');
  assert.equal(h.sent[0].action,'bridgeCheckStaffEnrollment');assert.deepEqual(Object.keys(h.sent[0]).sort(),['action','idToken','nonce','responseKey']);
  await h.reply();assert.equal(h.states.at(-1).allowed,true);assert.equal(h.timers.size,0);h.api.start();assert.equal(h.sent.length,1);
});
test('employee and service failures remain locked without retry traffic',async()=>{
  for(const code of ['TLH_ADMIN_REQUIRED','ENROLLMENT_BUSY','WRITE_REVIEW_REQUIRED','LINE_VERIFY_REJECTED']){
    const h=adminAccessHarness();h.api.start();await h.reply(code);for(let i=0;i<1000;i++)h.api.start();
    assert.equal(h.sent.length,1);assert.equal(h.states.at(-1).allowed,false);assert.equal(h.timers.size,0);
  }
});
test('forged signature, code, nonce, action, type and unrelated frame/origin cannot enable management',async()=>{
  const h=adminAccessHarness();h.api.start();
  for(const [patch,event]of [[{mac:'0'.repeat(64)},{}],[{nonce:'0'.repeat(32)},{}],[{action:'bridgeIssueStaffInvitation'},{}],
    [{type:'TLH_BRIDGE_ADMIN_STATUS'},{}],[{code:'UNKNOWN'},{}],[{},{source:{}}],[{},{origin:'https://fixture-script.googleusercontent.com.attacker.test'}]]){
    await h.reply('STAFF_ADMIN_READY',patch,event);assert.equal(h.states.at(-1).allowed,false);
  }
  await h.reply();assert.equal(h.states.at(-1).allowed,true);
});
test('timeout and departure discard late success; previously allowed UI is locked when leaving',async()=>{
  const h=adminAccessHarness();h.api.start();[...h.timers.values()][0]();await h.reply();assert.equal(h.states.at(-1).reason,'unavailable');h.api.start();assert.equal(h.sent.length,1);
  const second=adminAccessHarness();second.api.start();second.handlers.pagehide();await second.reply();assert.equal(second.states.at(-1).allowed,false);
  const third=adminAccessHarness();third.api.start();await third.reply();third.handlers.pagehide();assert.equal(third.states.at(-1).allowed,false);
});
test('missing LINE proof, embedded contexts and submit failure stay locked without automatic resend',()=>{
  for(const options of [{proof:''},{embedded:true},{throwSubmit:true}]){
    const h=adminAccessHarness(options);h.api.start();h.api.start();assert.equal(h.sent.length,0);assert.equal(h.states.at(-1).allowed,false);
  }
});
test('all entry pages are initially locked and use a dedicated read-only gate without storage',()=>{
  const root=new URL('../workforce/',import.meta.url),read=n=>fs.readFileSync(new URL(n,root),'utf8');
  assert.match(read('index.html'),/id="manager-tab"[^>]*\bdisabled\b/);
  assert.match(read('admin-timecard-records.html'),/id="journal-admin-option"[^>]*\bdisabled\b/);
  for(const id of ['change-direct-option','change-review-option'])assert.ok(new RegExp('id="'+id+'"[^>]*\\bdisabled\\b').test(read('admin-day-change.html')));
  for(const page of ['index.html','admin-timecard-records.html','admin-day-change.html'])assert.ok(read(page).includes('name="tlhAdminAccessFrame"'));
  for(const page of ['day-change.html','timecard-records.html'])assert.doesNotMatch(read(page),/admin-access\.js|pending-approvals\.js/);
  assert.doesNotMatch(read('admin-access.js'),/localStorage|sessionStorage|console\.|bridgeRecordPunch|bridgeIssueStaffInvitation/);
});
