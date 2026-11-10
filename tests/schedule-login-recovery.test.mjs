import test from 'node:test';import assert from 'node:assert/strict';
import {scheduleUiHarness} from './helpers/schedule-harness.mjs';
import {scheduleBulkHarness,bulkSnapshot} from './helpers/schedule-bulk-harness.mjs';
function loginFixture(h){
 const actions=[];h.window.location={origin:'https://example.test',pathname:'/workforce/admin-schedule.html',search:'?do-not-copy=secret',hash:'#do-not-copy',assign:url=>actions.push(['assign',url])};
 Object.assign(h.liff,{isLoggedIn:()=>true,logout:()=>actions.push(['logout']),login:value=>actions.push(['login',value])});return actions;
}
test('verified read rejection exposes one explicit login; no automatic redirect or repeated refresh until recovery',async()=>{
 for(const mode of ['employee','admin','bulk']){
  const h=mode==='bulk'?scheduleBulkHarness():scheduleUiHarness(mode),actions=loginFixture(h);
  await(mode==='bulk'?h.api.load():h.api.read());const read=h.sent[0];
  await h.reply(read,mode==='bulk'?null:'','LINE_VERIFY_REJECTED');assert.equal(h.n('login').hidden,false);assert.equal(actions.length,0);
  await(mode==='bulk'?h.api.load():h.api.read());assert.equal(h.sent.length,1);
  h.click('login');h.click('login');assert.equal(actions.length,2);assert.equal(actions[0][0],'logout');assert.deepEqual(JSON.parse(JSON.stringify(actions[1][1])),{redirectUri:'https://example.test/workforce/admin-schedule.html'});
  assert.equal(h.n('login').disabled,true);h.events.pagehide();h.click('login');assert.equal(actions.length,2);
 }
});
test('forged rejection, wrong frame and ordinary read failures do not initiate login',async()=>{
 const h=scheduleUiHarness('admin');await h.api.read();await h.reply(h.sent[0],'','LINE_VERIFY_REJECTED',{mac:'a'.repeat(64)});assert.equal(h.n('login').hidden,true);
 await h.reply(h.sent[0],'','LINE_VERIFY_REJECTED',{},{});assert.equal(h.n('login').hidden,true);
 await h.reply(h.sent[0],'','SCHEDULE_UNAVAILABLE');assert.equal(h.n('login').hidden,true);await h.api.read();assert.equal(h.sent.length,2);
 const b=scheduleBulkHarness();await b.api.load();await b.reply(b.sent[0],null,'LINE_VERIFY_REJECTED',{mac:'a'.repeat(64)});assert.equal(b.n('login').hidden,true);
 await b.reply(b.sent[0],null,'SCHEDULE_PERMISSION_REQUIRED');assert.equal(b.n('login').hidden,true);
});
test('missing proof on a read offers login, and LINE in-app recovery uses the fixed miniapp without copying the URL',async()=>{
 const h=scheduleUiHarness('admin'),actions=loginFixture(h);h.liff.getIDToken=()=>null;h.liff.isInClient=()=>true;
 await h.api.read();assert.equal(h.sent.length,0);assert.equal(h.n('login').hidden,false);h.click('login');assert.deepEqual(actions,[['assign','https://miniapp.line.me/2011940133-JXUDzLnG']]);
});
test('authentication rejection cannot reinterpret an uncertain write as a read or lose the fixed retry ID',async()=>{
 const h=scheduleUiHarness();await h.api.read();await h.reply(h.sent[0],h.snapshot());h.n('reason').value='架空の希望';h.click('save');const write=h.sent[1];assert.equal(write.command,'request');
 await h.reply(write,'','LINE_VERIFY_REJECTED');assert.equal(h.n('login').hidden,true);for(const timer of [...h.timers.values()])timer();assert.equal(h.n('retry').hidden,false);h.click('retry');assert.equal(h.sent[2].operationId,write.operationId);assert.equal(h.sent[2].input,write.input);
 const b=scheduleBulkHarness();await b.api.load();await b.reply(b.sent[0],bulkSnapshot(1));b.edit('EMP001','2026-11-01','公休');b.click('save');const bulkWrite=b.sent[1];await b.reply(bulkWrite,null,'LINE_VERIFY_REJECTED');for(const timer of [...b.timers.values()])timer();assert.equal(b.n('login').hidden,true);b.click('retry');assert.equal(b.sent[2].operationId,bulkWrite.operationId);
});
test('failed login initiation leaves an explicit retry and never emits authentication details',async()=>{
 const h=scheduleUiHarness('admin'),actions=loginFixture(h);h.liff.login=()=>{throw Error('private proof');};await h.api.read();await h.reply(h.sent[0],'','LINE_VERIFY_REJECTED');h.click('login');assert.equal(h.n('login').disabled,false);assert.doesNotMatch(h.n('status').textContent,/private/);assert.match(h.n('status').textContent,/開始できません/);assert.equal(actions.length,1);
});
