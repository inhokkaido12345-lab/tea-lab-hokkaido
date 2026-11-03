import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {accountInfoHarness,sampleAccountInfo} from './helpers/account-info-harness.mjs';

test('explicit self read sends only proof and envelope; repeated taps send once and signed fields display',async()=>{
 const h=accountInfoHarness();assert.equal(h.sent.length,0);for(let i=0;i<1000;i++)h.click();assert.equal(h.sent.length,1);
 assert.deepEqual(Object.keys(h.sent[0]).sort(),['action','idToken','nonce','responseKey']);await h.reply(h.sent[0]);assert.equal(h.n('result').hidden,false);assert.equal(h.n('check').disabled,false);
 const text=h.n('fields').children.map(n=>n.textContent).join(' ');assert.match(text,/INFO001/);assert.match(text,/架空スタッフ/);assert.match(text,/LINE/);assert.equal(h.timers.size,0);
});
test('account-only and stopped profiles are distinguished from active employee, all values render as text',async()=>{
 for(const employee of [null,{...sampleAccountInfo().employee,status:'INACTIVE',name:'<img src=x onerror=alert(1)>'}]){
  const h=accountInfoHarness(),info={...sampleAccountInfo(),employee};h.click();await h.reply(h.sent[0],'ACCOUNT_INFO_READY',info);
  const text=h.n('fields').children.map(n=>n.textContent).join(' ');assert.match(text,employee?/停止済み/:/従業員登録なし/);if(employee)assert.match(text,/<img src=x/);
  assert.equal(h.n('result').hidden,false);assert.doesNotMatch(h.source,/innerHTML/);
 }
});
test('forged source, origin, signature, nonce, action and type cannot display personal information',async()=>{
 const h=accountInfoHarness();h.click();const r=h.sent[0];
 for(const [patch,event]of [[{mac:'0'.repeat(64)},{}],[{nonce:'0'.repeat(32)},{}],[{action:'bridgeAdminStatus'},{}],[{type:'OTHER'},{}],[{info:'{}'},{}],[{},{source:{}}],[{},{origin:'https://evil.test'}]]){
  await h.reply(r,'ACCOUNT_INFO_READY',sampleAccountInfo(),patch,event);assert.equal(h.n('result').hidden,true);
 }
 await h.reply(r);assert.equal(h.n('result').hidden,false);
});
test('valid signature cannot make malformed or overbroad DTO display',async()=>{
 const bad=[{version:2},{provider_subject:'private-subject'},{permissions:{workforceEmployee:'yes',globalAdmin:false}},{employee:{...sampleAccountInfo().employee,hireDate:'2026-02-30'}},{linkedProviders:['LINE','LINE']}];
 for(const patch of bad){const h=accountInfoHarness();h.click();await h.reply(h.sent[0],'ACCOUNT_INFO_READY',{...sampleAccountInfo(),...patch});assert.equal(h.n('result').hidden,true);}
});
test('refresh clears old info before send; refusal, timeout and late responses never restore it',async()=>{
 const h=accountInfoHarness();h.click();await h.reply(h.sent[0]);h.click();assert.equal(h.n('fields').children.length,0);assert.equal(h.n('result').hidden,true);
 const old=h.sent[1];[...h.timers.values()][0]();h.click();await h.reply(old);assert.equal(h.n('result').hidden,true);await h.reply(h.sent[2],'ACCOUNT_INFO_NOT_REGISTERED');assert.match(h.n('status').textContent,/まだ登録/);assert.equal(h.n('fields').children.length,0);
});
test('departure clears fields and ignores late response, no proof or embedding sends nothing',async()=>{
 const h=accountInfoHarness();h.click();const r=h.sent[0];h.handlers.pagehide();await h.reply(r);h.click();assert.equal(h.sent.length,1);assert.equal(h.n('result').hidden,true);assert.equal(h.n('check').disabled,true);
 for(const options of [{proof:''},{embedded:true},{throwSubmit:true}]){const h=accountInfoHarness(options);h.click();assert.equal(h.sent.length,0);assert.equal(h.n('result').hidden,true);}
 assert.doesNotMatch(h.source,/localStorage|sessionStorage|console\.|URLSearchParams|bridgeCreateAccount|bridgeClaimStaffInvitation/);
});
test('personal entry is outside management, uses dedicated frame, and offers no editing or disconnection',()=>{
 const read=n=>fs.readFileSync(new URL('../workforce/'+n,import.meta.url),'utf8'),html=read('account-info.html'),main=read('index.html');
 const more=main.slice(main.indexOf('<div id="more-tools-panel"'));assert.match(more,/href="account-info.html"/);
 const manager=main.slice(main.indexOf('<div id="manager-tools-panel"'),main.indexOf('<div id="more-tools-panel"'));assert.doesNotMatch(manager,/href="account-info.html"/);
 assert.match(html,/name="tlhAccountInfoFrame"/);assert.match(html,/name="referrer" content="no-referrer"/);assert.doesNotMatch(html,/<input|<textarea|admin-access\.js/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
});
