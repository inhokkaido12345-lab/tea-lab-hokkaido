import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {scheduleBulkHarness,bulkSnapshot} from './helpers/schedule-bulk-harness.mjs';
const setup=async count=>{const h=scheduleBulkHarness();await h.api.load();await h.reply(h.sent[0],bulkSnapshot(count));return h;};
test('plan index preserves first-match and half boundaries and a new snapshot drops removed plans',()=>{
 const h=scheduleBulkHarness(),m=h.model,s=bulkSnapshot(1),first={employeeCode:'EMP001',day:'2026-11-01',revision:2,plan:m.parse('公休')};
 s.halves.FIRST.drafts=[first,{...first,revision:3},{...first,day:'2026-11-16'}];
 s.halves.SECOND.drafts=[{...first,day:'2026-11-16',revision:4}];
 const find=m.planLookup(s);for(const day of m.days(s.month))assert.equal(find('EMP001',day),m.oldPlan(s,'EMP001',day));
 assert.equal(find('EMP001',first.day),first);assert.equal(find('OTHER',first.day),undefined);
 const fresh=m.planLookup(bulkSnapshot(1));assert.equal(fresh('EMP001',first.day),undefined);
 const changes=new Map([[m.key('EMP001',first.day),m.input(first.plan)]]);assert.equal(m.payload(s,changes,'').changes.length,0);
 changes.set(m.key('EMP001',first.day),m.parse('有給'));assert.equal(m.payload(s,changes,'').changes[0].expectedPlanRevision,2);
 changes.set(m.key('EMP001','2026-11-16'),m.parse('有給'));assert.deepEqual(Array.from(m.payload(s,changes,'').changes,c=>c.expectedPlanRevision),[2,4]);
});
test('five staff by 15 days edit without a request per cell; one save carries exactly 75 changed plans',async()=>{
 const h=await setup(5);assert.equal(h.sent.length,1);for(let person=1;person<=5;person++)for(let day=1;day<=15;day++)h.edit('EMP'+String(person).padStart(3,'0'),'2026-11-'+String(day).padStart(2,'0'),'9:00-18:00/60');
 assert.equal(h.sent.length,1);assert.equal(h.n('save').disabled,false);assert.match(h.n('count').textContent,/75日分/);h.click('save');assert.equal(h.sent.length,2);
 const input=JSON.parse(h.sent[1].input);assert.equal(input.changes.length,75);assert.equal(h.sent[1].command,'batchPlan');assert.equal(input.changes[0].plan.periods[0].start,'09:00');
 h.click('save');assert.equal(h.sent.length,2);assert.equal(h.n('save').disabled,true);
});
test('real month lengths, split shifts, next-day ends and notes preserve the existing model meaning',()=>{
 const h=scheduleBulkHarness(),m=h.model;assert.equal(m.days('2028-02').length,29);assert.equal(m.days('2026-02').length,28);assert.equal(m.days('2026-01').length,31);
 const base={periods:[],appointments:[{title:'既存の会議'}],leave:{type:'NONE',unit:'DAY',minutes:null,note:''},note:'秘密の理由',publicNote:'共有メモ'};
 const p=m.parse('09:00-12:00/0,14:00-18:00/30',base);assert.equal(p.periods.length,2);assert.equal(p.note,base.note);assert.equal(p.appointments.length,1);assert.equal(p.publicNote,base.publicNote);
 assert.equal(m.parse('22:00-翌06:00/60').periods[0].endNextDay,true);assert.throws(()=>m.parse('18:00-09:00/0'),/時刻|逆転/);assert.throws(()=>m.parse('09:00-10:00/61'),/分数/);
 assert.equal(m.parse('公休').leave.type,'PUBLIC_OFF');assert.equal(m.parse('有給').leave.type,'PAID');assert.throws(()=>m.parse('',m.parse('09:00-18:00/60')),/未定/);
});
test('invalid cell and pending response prevent save; forged/mismatched replies never reveal a roster',async()=>{
 const h=scheduleBulkHarness();await h.api.load();await h.reply(h.sent[0],bulkSnapshot(),undefined,{mac:'a'.repeat(64)});assert.equal(h.n('rows').children.length,0);await h.reply(h.sent[0],bulkSnapshot(),undefined,{},'https://evil.test');assert.equal(h.n('rows').children.length,0);
 await h.reply(h.sent[0],bulkSnapshot());h.edit('EMP001','2026-11-01','bad');assert.equal(h.n('save').disabled,true);h.click('save');assert.equal(h.sent.length,1);
 h.edit('EMP001','2026-11-01','公休');h.confirm(false);h.click('save');assert.equal(h.sent.length,1);
});
test('lost save reply keeps immutable payload/ID and locks editing; same operation retry resolves saved outcome',async()=>{
 const h=await setup(1);h.edit('EMP001','2026-11-01','公休');h.click('save');const original=h.sent[1];[...h.timers.values()][0]();assert.equal(h.n('retry').hidden,false);assert.equal(h.cell('EMP001','2026-11-01').disabled,true);
 h.n('reason').value='changed after send';h.click('retry');assert.equal(h.sent[2].input,original.input);assert.equal(h.sent[2].operationId,original.operationId);assert.notEqual(h.sent[2].nonce,original.nonce);
 await h.reply(original,bulkSnapshot(1),'SCHEDULE_SAVED');assert.equal(h.n('retry').hidden,false);
 await h.reply(h.sent[2],bulkSnapshot(1),'SCHEDULE_ALREADY_DONE');assert.equal(h.n('retry').hidden,true);assert.equal(h.n('save').disabled,true);
});
test('paging and rectangular paste are local; out-of-range paste cannot partially change existing drafts',async()=>{
 const h=await setup(26),first=h.cell('EMP001','2026-11-01');let prevented=0;first.events.paste({preventDefault(){prevented++;},clipboardData:{getData:()=> '9:00-12:00/0\t公休\n有給\t未定'}});assert.equal(prevented,1);assert.equal(h.sent.length,1);assert.match(h.n('count').textContent,/3日分/);
 h.click('next');assert.equal(h.cell('EMP026','2026-11-01').value,'');h.edit('EMP026','2026-11-01','公休');h.click('prev');assert.equal(h.cell('EMP001','2026-11-01').value,'9:00-12:00/0');assert.equal(h.sent.length,1);
 h.cell('EMP001','2026-11-30').events.paste({preventDefault(){},clipboardData:{getData:()=> '公休\t公休'}});assert.match(h.n('status').textContent,/範囲を超え/);assert.match(h.n('count').textContent,/4日分/);
});
test('confirmed published changes require reason; refresh or month navigation cannot silently discard local edits',async()=>{
 const h=scheduleBulkHarness(),s=bulkSnapshot(1);s.halves.FIRST.phase='PUBLISHED';s.halves.FIRST.publishedAt='2026-11-01T00:00:00.000Z';s.halves.FIRST.monthRevision=2;await h.api.load();await h.reply(h.sent[0],s);
 h.edit('EMP001','2026-11-01','公休');h.click('save');assert.equal(h.sent.length,1);assert.match(h.n('status').textContent,/変更理由/);h.n('reason').value='本人と勤務調整';h.click('save');assert.equal(h.sent.length,2);assert.equal(JSON.parse(h.sent[1].input).changes[0].expectedPlanRevision,2);
 const other=await setup(1);other.edit('EMP001','2026-11-01','公休');other.confirm(false);other.n('month').value='2026-12';await other.api.load();assert.equal(other.n('month').value,'2026-11');assert.equal(other.sent.length,1);
});
test('departure clears roster and local drafts, blocks writes and ignores all late replies',async()=>{
 const h=await setup(1);h.edit('EMP001','2026-11-01','公休');let prevented=false;h.events.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,true);h.click('save');const r=h.sent[1];h.events.pagehide();await h.reply(r,bulkSnapshot(1),'SCHEDULE_SAVED');assert.equal(h.n('rows').children.length,0);assert.equal(h.n('save').disabled,true);h.click('save');assert.equal(h.sent.length,2);
});
test('valid signature cannot render a different month, employee audience, duplicate roster or wrong frame',async()=>{
 for(const mutate of [s=>{s.month='2026-12';},s=>{s.halves.FIRST.admin=false;},s=>{s.halves.SECOND.period='FIRST';},s=>{s.halves.FIRST.employees.push({...s.halves.FIRST.employees[0]});s.halves.SECOND.employees.push({...s.halves.SECOND.employees[0]});}]){
  const h=scheduleBulkHarness();await h.api.load();const s=bulkSnapshot(1);mutate(s);await h.reply(h.sent[0],s);assert.equal(h.n('rows').children.length,0);
 }
 const h=scheduleBulkHarness();await h.api.load();await h.reply(h.sent[0],bulkSnapshot(1),'SCHEDULE_READY',{},'null',{});assert.equal(h.n('rows').children.length,0);
});
test('retired monthly editor URL leads to sheet-only management without loading CSV or cell controllers',()=>{
 const html=fs.readFileSync(new URL('../workforce/admin-schedule-bulk.html',import.meta.url),'utf8');assert.match(html,/url=admin-schedule.html/);assert.doesNotMatch(html,/type="file"|schedule-bulk.js|bulk-grid|bulk-file/);
 const js=fs.readFileSync(new URL('../workforce/schedule-management.js',import.meta.url),'utf8');assert.doesNotMatch(js,/localStorage\.|sessionStorage\.|setInterval\(|console\./);assert.match(js,/TlhCurrentWorkplace.submit\(form\)/);
});
