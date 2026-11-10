import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {managementHarness,managementSnapshot,sheetReply} from './helpers/schedule-management-harness.mjs';
async function ready(){const h=managementHarness();await h.api.load();await h.reply(h.sent[0]);return h;}
const plan=()=>({day:'2026-11-05',periods:[],appointments:[],leave:{type:'PUBLIC_OFF',unit:'DAY',minutes:null,note:''},note:''});
const change=()=>({employeeCode:'EMP001',employeeName:'架空社員1',day:'2026-11-05',before:'なし',after:'公休',expectedPlanRevision:0,published:false,workText:'公休',plan:plan()});
test('management has exactly two categories; switching them reads nothing and employee editing/CSV are absent',async()=>{
 const h=await ready();assert.equal(h.sent.length,1);assert.equal(h.n('publish').disabled,false);assert.equal(h.n('sheet-open').hidden,false);h.click('requests-tab');assert.equal(h.n('requests-panel').hidden,false);assert.equal(h.n('edit-panel').hidden,true);h.click('edit-tab');let prevented=false;h.n('edit-tab').events.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.n('requests-panel').hidden,false);assert.equal(h.n('edit-tab').tabIndex,-1);assert.equal(h.sent.length,1);
 const html=fs.readFileSync(new URL('../workforce/admin-schedule.html',import.meta.url),'utf8');assert.doesNotMatch(html,/type="file"|bulk-grid|月をまたぐ従業員メモ|schedule-compose|schedule-overview|schedule-task-nav/);
});
test('publish reads source and waits for confirmation, then imports and publishes the confirmed digest only once',async()=>{
 const h=await ready();h.click('publish');assert.equal(h.sent[1].command,'sheetRead');await h.reply(h.sent[1],sheetReply(managementSnapshot(),[change()]),'SCHEDULE_SHEET_READY');assert.equal(h.n('confirm').hidden,false);assert.equal(h.sent.length,2);
 h.click('approve');h.click('approve');assert.equal(h.sent.length,3);assert.equal(h.sent[2].command,'sheetImport');await h.reply(h.sent[2],managementSnapshot(),'SCHEDULE_SAVED');assert.equal(h.sent[3].command,'monthPublish');assert.equal(JSON.parse(h.sent[3].input).sourceDigest,'a'.repeat(64));
 const s=managementSnapshot();for(const half of Object.values(s.halves)){half.phase='PUBLISHED';half.monthRevision=2;}await h.reply(h.sent[3],s,'SCHEDULE_SAVED');assert.match(h.n('status').textContent,/月全体の公開/);assert.equal(h.n('publish').textContent,'シートの変更を反映する');
});
test('unknown import keeps fixed input and ID; it never publishes until the same operation is confirmed saved',async()=>{
 const h=await ready();h.click('publish');await h.reply(h.sent[1],sheetReply(managementSnapshot(),[change()]),'SCHEDULE_SHEET_READY');h.click('approve');const original=h.sent[2];h.expire();assert.equal(h.n('month').disabled,true);assert.equal(h.n('retry').hidden,false);h.click('publish');assert.equal(h.sent.length,3);h.click('retry');const retry=h.sent[3];assert.equal(retry.operationId,original.operationId);assert.equal(retry.input,original.input);assert.notEqual(retry.nonce,original.nonce);await h.reply(retry,managementSnapshot(),'SCHEDULE_ALREADY_DONE');assert.equal(h.sent[4].command,'monthPublish');assert.equal(JSON.parse(h.sent[4].input).sourceDigest,'a'.repeat(64));
});
test('changed source or denied import stops publication; safe failure never becomes success',async()=>{
 const h=await ready();h.click('publish');await h.reply(h.sent[1],sheetReply(managementSnapshot(),[change()]),'SCHEDULE_SHEET_READY');h.click('approve');await h.reply(h.sent[2],null,'SCHEDULE_SHEET_CHANGED');assert.equal(h.sent.length,3);assert.match(h.n('status').textContent,/止めました/);assert.equal(h.n('refresh').hidden,false);
});
test('empty diff still needs confirmation and publishes without an unnecessary import',async()=>{
 const h=await ready();h.click('publish');await h.reply(h.sent[1],sheetReply(),'SCHEDULE_SHEET_READY');assert.equal(h.sent.length,2);h.click('approve');assert.equal(h.sent[2].command,'monthPublish');assert.equal(JSON.parse(h.sent[2].input).sourceDigest,'a'.repeat(64));
});
test('creation has explicit confirmation, preserves existing resources and retries the original operation on lost reply',async()=>{
 const h=await ready();h.click('sheet-create');assert.equal(h.sent.length,1);h.click('approve');const original=h.sent[1];assert.equal(original.command,'sheetCreate');h.expire();h.click('retry');assert.equal(h.sent[2].operationId,original.operationId);const result=sheetReply();delete result.authority;await h.reply(h.sent[2],result,'SCHEDULE_SHEET_READY');assert.match(h.n('status').textContent,/保持/);assert.equal(h.sent.length,3);
});
test('foreign iframe, origin, invalid MAC or malformed source DTO cannot start imports or unlock pending actions',async()=>{
 const h=await ready();h.click('publish');const r=h.sent[1],v=sheetReply();await h.reply(r,v,'SCHEDULE_SHEET_READY',{},'https://untrusted.example');await h.reply(r,v,'SCHEDULE_SHEET_READY',{},'null',{});await h.reply(r,v,'SCHEDULE_SHEET_READY',{mac:'0'.repeat(64)});assert.equal(h.n('confirm').hidden,true);v.month='2026-12';await h.reply(r,v,'SCHEDULE_SHEET_READY');assert.equal(h.n('confirm').hidden,true);assert.equal(h.sent.length,2);h.expire();assert.equal(h.n('refresh').hidden,false);
});
test('official read rejection clears source link and offers explicit login; late response after departure sends nothing',async()=>{
 const h=await ready();await h.api.load();await h.reply(h.sent[1],null,'LINE_VERIFY_REJECTED');assert.equal(h.n('login').hidden,false);assert.equal(h.n('login').disabled,false);assert.equal(h.n('sheet-open').hidden,true);assert.equal(h.n('publish').disabled,true);const g=await ready();g.click('publish');const r=g.sent[1];g.depart();await g.reply(r,sheetReply(),'SCHEDULE_SHEET_READY');assert.equal(g.sent.length,2);assert.equal(g.n('confirm').hidden,true);assert.equal(g.timers.size,0);
});
test('request approval shows employee name and code, requires reason and preserves conflict notice from signed reply',async()=>{
 const h=managementHarness(),s=managementSnapshot();s.halves.FIRST.requests=[{requestId:'req_example',employeeCode:'EMP001',employeeName:'架空社員1',revision:1,status:'PENDING',kind:'SHIFT_PREFERENCE',payload:{plan:plan(),reason:'本人の希望'},submittedAt:'2026-11-01T00:00:00.000Z'}];await h.api.load();await h.reply(h.sent[0],s);
 const nodes=h.walk(h.n('requests'));assert.ok(nodes.some(n=>n.textContent.includes('架空社員1（EMP001）')));const approve=nodes.find(n=>n.tagName==='button'&&n.textContent==='承認する');approve.events.click();assert.equal(h.sent.length,1);nodes.find(n=>n.tagName==='textarea').value='内容を確認';approve.events.click();h.click('approve');assert.equal(h.sent[1].command,'review');assert.equal(JSON.parse(h.sent[1].input).expectedRequestRevision,1);
 const result=s.halves.FIRST;result.requests[0].status='APPROVED';result.requests[0].payload.sheetPreference={version:1,conflict:true};await h.reply(h.sent[1],result,'SCHEDULE_SAVED');assert.match(h.n('status').textContent,/希望休と競合/);assert.match(h.n('status').textContent,/スプレッドシートで調整/);
});
test('published-period changes require a reason and create consent proposals without a second publish',async()=>{
 const h=await ready(),s=managementSnapshot();s.halves.FIRST.phase='PUBLISHED';h.click('publish');const c=change();c.published=true;await h.reply(h.sent[1],sheetReply(s,[c]),'SCHEDULE_SHEET_READY');h.click('approve');assert.equal(h.sent.length,2);h.n('reason').value='急用で変更';h.click('approve');assert.equal(h.sent[2].command,'sheetImport');await h.reply(h.sent[2],s,'SCHEDULE_CONSENT_REQUIRED');assert.equal(h.sent.length,4);assert.equal(h.sent[3].command,'monthPublish');await h.reply(h.sent[3],s,'SCHEDULE_READY');assert.match(h.n('status').textContent,/本人同意/);
});
test('monthly approval is independent of the publication selector and preserves the request-owned revision',async()=>{
 const h=managementHarness(),s=managementSnapshot();s.halves.FIRST.monthRevision=3;s.halves.SECOND.monthRevision=8;const p={...plan(),day:'2026-11-22'};
 s.halves.SECOND.requests=[{requestId:'req_second',employeeCode:'EMP001',employeeName:'架空社員1',revision:4,status:'PENDING',kind:'SHIFT_PREFERENCE',payload:{plan:p,reason:'希望'},submittedAt:'2026-11-01T00:00:00.000Z'}];await h.api.load();await h.reply(h.sent[0],s);assert.equal(h.n('period').value,'FIRST');const nodes=h.walk(h.n('requests'));assert.ok(nodes.some(n=>n.textContent.includes('2026-11-22')));nodes.find(n=>n.tagName==='textarea').value='確認';nodes.find(n=>n.tagName==='button'&&n.textContent==='承認する').events.click();h.click('approve');const input=JSON.parse(h.sent[1].input);assert.equal(input.period,'SECOND');assert.equal(input.expectedMonthRevision,8);assert.equal(input.expectedRequestRevision,4);assert.equal(input.requestId,'req_second');
 h.expire();h.click('retry');assert.equal(h.sent[2].operationId,h.sent[1].operationId);assert.equal(h.sent[2].input,h.sent[1].input);
});
test('deadline window has explicit dates and a global expected version independent of legacy half selection',async()=>{
 const h=managementHarness(),s=managementSnapshot();for(const half of Object.values(s.halves)){half.deadlineRevision=4;half.requestDeadlines=[];}await h.api.load();await h.reply(h.sent[0],s);h.n('deadline-start').value='2026-12-28';h.n('deadline-end').value='2027-01-08';h.n('deadline').value='2026-12-20T18:00';h.click('deadline-save');assert.match(h.n('question').textContent,/2026-12-28〜2027-01-08/);h.click('approve');assert.equal(h.sent[1].command,'deadlineRange');const input=JSON.parse(h.sent[1].input);assert.equal(input.expectedDeadlineRevision,4);assert.equal(input.startDay,'2026-12-28');assert.equal(input.endDay,'2027-01-08');assert.equal(input.deadline,'2026-12-20T09:00:00.000Z');assert.ok(!Object.hasOwn(input,'period'));assert.ok(!Object.hasOwn(input,'expectedMonthRevision'));
});

for(const [code,pattern]of [['SCHEDULE_SHEET_BINDING_REQUIRED',/月別シートがない/],['SCHEDULE_SHEET_BINDING_INVALID',/店舗識別設定が一致しません/]])test('input creation reports '+code+' without publication or automatic retry',async()=>{
 const h=await ready();h.click('sheet-create');h.click('approve');assert.equal(h.sent[1].command,'sheetCreate');
 await h.reply(h.sent[1],null,code);assert.match(h.n('status').textContent,pattern);assert.equal(h.sent.length,2);
});
