import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{scheduleUiHarness,snapshot}from'./helpers/schedule-harness.mjs';

test('manager can select pre-registered staff with an unlinked marker; older responses remain compatible',async()=>{
 const h=scheduleUiHarness('admin'),s=h.snapshot();s.employees.push({employeeCode:'UNLINK001',employeeName:'架空未認証社員',registrationStatus:'PENDING_LINK'});
 await h.api.read();await h.reply(h.sent[0],s);assert.match(h.n('employee').children.at(-1).textContent,/UNLINK001（架空未認証社員）.*未認証/);
 h.n('employee').value='UNLINK001';h.click('save');assert.equal(JSON.parse(h.sent.at(-1).input).employeeCode,'UNLINK001');
 const wrong={...s,employees:[{employeeCode:'UNLINK001',employeeName:'架空未認証社員',registrationStatus:'ADMIN'}]};assert.equal(h.module.validate(wrong,'2026-11',true),false);
});

test('period-bound employee form displays availability and sends selected half without a second open-page action',async()=>{
 const h=scheduleUiHarness(),s={...h.snapshot(),period:'FIRST',rangeStart:'2026-11-01',rangeEnd:'2026-11-15'};h.n('scope').value='FIRST';await h.api.read();await h.reply(h.sent[0],s);
 assert.equal(h.n('save').disabled,false);assert.match(h.n('availability').textContent,/送信できます/);assert.equal(h.n('calendar').children.filter(n=>n.className==='schedule-day').length,15);
 h.n('day').value='2026-11-16';h.n('reason').value='希望';h.click('save');assert.equal(h.sent.length,1);assert.match(h.n('status').textContent,/期間に含まれる/);
 h.n('day').value='2026-11-05';h.click('save');assert.equal(JSON.parse(h.sent[1].input).period,'FIRST');
});
test('unconfigured and closed periods explain disabled submission; annual leave remains separately available',async()=>{
 for(const phase of ['NOT_OPEN','DRAFT','COLLECTING']){
  const h=scheduleUiHarness(),s={...h.snapshot(),phase,deadline:phase==='COLLECTING'?'2026-11-03T00:00:00.000Z':''};await h.api.read();await h.reply(h.sent[0],s);
  assert.equal(h.n('save').disabled,true);assert.match(h.n('availability').textContent,phase==='NOT_OPEN'?/未設定/:phase==='DRAFT'?/開始していません/:/締切済み/);
  if(phase!=='NOT_OPEN'){h.n('leave').value='PAID';h.n('leave').events.change();assert.equal(h.n('save').disabled,false);}
 }
});
test('a signed reply for another half is ignored and second-half calendar starts on the sixteenth',async()=>{
 const h=scheduleUiHarness();h.n('scope').value='SECOND';await h.api.read();const s={...h.snapshot(),period:'FIRST',rangeStart:'2026-11-01',rangeEnd:'2026-11-15'};
 await h.reply(h.sent[0],s);assert.equal(h.n('editor').disabled,true);await h.reply(h.sent[0],{...s,period:'SECOND',rangeStart:'2026-11-16',rangeEnd:'2026-11-30'});
 assert.equal(h.n('day').min,'2026-11-16');assert.equal(h.n('day').value,'2026-11-16');assert.equal(h.n('calendar').children.filter(n=>n.className==='schedule-day').length,15);
});

test('admin can compose first draft with no collection; public/private notes stay distinct through submission and departure',async()=>{
 const h=scheduleUiHarness('admin'),s={...h.snapshot(),phase:'NOT_OPEN',monthRevision:0,deadline:''};await h.api.read();await h.reply(h.sent[0],s);assert.equal(h.n('editor').disabled,false);assert.equal(h.n('publish').disabled,true);
 h.n('employee').value='SCH001';h.n('public-note').value='地元に帰省';h.n('note').value='非公開の事情';h.click('save');const p=JSON.parse(h.sent[1].input).plan;assert.equal(p.publicNote,'地元に帰省');assert.equal(p.note,'非公開の事情');h.events.pagehide();assert.equal(h.n('public-note').value,'');
});
test('another employee sees explicit shared note as text and cannot receive a malformed public note',async()=>{
 const h=scheduleUiHarness(),s=h.snapshot();s.phase='PUBLISHED';s.plans=[{employeeCode:'SCH002',employeeName:'別の社員',day:'2026-11-05',revision:1,periods:[],workIntervals:[],plannedMinutes:0,leaveType:'PUBLIC_OFF',publicNote:'帰省 <script>text</script>'}];
 assert.equal(h.module.validate({...s,plans:[{...s.plans[0],publicNote:{private:'bad'}}]},s.month,false),false);
 await h.api.read();await h.reply(h.sent[0],s);const text=n=>n.textContent+' '+n.children.map(text).join(' ');assert.match(text(h.n('calendar')),/共有事項：帰省 <script>text<\/script>/);
});
test('verified publication date is displayed in Japan time and invalid timestamps are rejected',async()=>{
 const h=scheduleUiHarness(),s={...h.snapshot(),phase:'PUBLISHED',publishedAt:'2026-11-04T18:30:00.000Z'};
 assert.equal(h.module.validate({...s,publishedAt:'not a date'},s.month,false),false);assert.equal(h.module.validate({...s,phase:'DRAFT'},s.month,false),false);
 await h.api.read();await h.reply(h.sent[0],s);assert.match(h.n('published-at').textContent,/2026年11月5日.*03:30/);h.events.pagehide();assert.equal(h.n('published-at').textContent,'');
});
test('no write on initialization; signed role-bound read renders 30 correct November dates without treating unset days as holidays',async()=>{
 const h=scheduleUiHarness();assert.equal(h.sent.length,0);assert.equal(h.n('editor').disabled,true);await h.api.read();await h.reply(h.sent[0],h.snapshot());assert.equal(h.n('editor').disabled,false);assert.equal(h.n('calendar').children.filter(c=>c.className==='schedule-day').length,30);assert.equal(h.n('calendar').children.filter(c=>c.className==='schedule-blank').length,0);
 assert.match(h.n('summary').textContent,/希望受付/);
});
test('another frame, altered HMAC, wrong role/month and private roster in employee DTO are ignored',async()=>{
 const h=scheduleUiHarness();await h.api.read();const r=h.sent[0];await h.reply(r,h.snapshot(),'SCHEDULE_READY',{},{});assert.equal(h.n('editor').disabled,true);
 await h.reply(r,h.snapshot(),'SCHEDULE_READY',{mac:'0'.repeat(64)});await h.reply(r,snapshot('admin'));await h.reply(r,{...h.snapshot(),month:'2026-12'});await h.reply(r,{...h.snapshot(),employees:[{employeeCode:'BAD001',employeeName:'should not appear'}]});assert.equal(h.n('editor').disabled,true);await h.reply(r,h.snapshot());assert.equal(h.n('editor').disabled,false);
});
test('uncertain write keeps identical operation and input, prevents duplicate taps, and never automatically retries',async()=>{
 const h=scheduleUiHarness();await h.api.read();await h.reply(h.sent[0],h.snapshot());h.n('reason').value='希望休';h.click('save');for(let i=0;i<1000;i++)h.click('save');assert.equal(h.sent.length,2);const r=h.sent[1];assert.equal(r.command,'request');const input=JSON.parse(r.input);assert.equal(input.audience,'employee');assert.equal(input.plan.leave.type,'PUBLIC_OFF');assert.ok(!('employeeCode'in input));[...h.timers.values()][0]();assert.equal(h.sent.length,2);assert.equal(h.n('retry').hidden,false);h.n('reason').value='別の入力';h.click('retry');assert.equal(h.sent[2].operationId,r.operationId);assert.equal(h.sent[2].input,r.input);await h.reply(h.sent[2],h.snapshot(),'SCHEDULE_ALREADY_DONE');assert.equal(h.n('retry').hidden,true);
});
test('denial and departure erase calendars, private inputs and requests; late verified reply cannot reopen actions',async()=>{
 const h=scheduleUiHarness();await h.api.read();await h.reply(h.sent[0],h.snapshot());h.n('note').value='private';h.n('reason').value='private';await h.api.read();await h.reply(h.sent[1],'','SCHEDULE_PERMISSION_REQUIRED');assert.equal(h.n('calendar').children.length,0);assert.equal(h.n('note').value,'');assert.equal(h.n('editor').disabled,true);
 const n=scheduleUiHarness();await n.api.read();const late=n.reply(n.sent[0],n.snapshot());n.events.pagehide();await late;n.click('save');assert.equal(n.sent.length,1);assert.equal(n.timers.size,0);assert.equal(n.n('calendar').children.length,0);
});
test('role pages preserve disabled forms and direct-write separation, and source contains no network/storage shortcuts',()=>{
 const read=name=>fs.readFileSync(new URL('../workforce/'+name,import.meta.url),'utf8');for(const page of ['schedule.html','admin-schedule.html']){const html=read(page);assert.match(html,/name="tlhScheduleFrame"/);assert.match(html,/id="schedule-editor" disabled/);assert.match(html,/name="referrer" content="no-referrer"/);assert.match(html,/fonts\/ibm-plex-sans-jp.css/);}
 assert.match(read('schedule.html'),/data-audience="employee"/);assert.match(read('admin-schedule.html'),/data-audience="admin"/);assert.doesNotMatch(read('schedule.js'),/\bfetch\(|localStorage|sessionStorage|console\.|innerHTML/);
});
test('personal calendar details use only the matching verified employee, and mismatched private plans refuse rendering',async()=>{
 const h=scheduleUiHarness(),s=h.snapshot(),plan={day:'2026-11-05',periods:[],appointments:[{title:'本人だけの打合せ',location:'架空の場所',start:'09:00',end:'10:00',endNextDay:false,countsAsWork:true}],leave:{type:'NONE',unit:'DAY',minutes:null,note:''},note:'自分の特記事項'};
 s.phase='PUBLISHED';s.plans=[{employeeCode:'SCH001',employeeName:'架空社員',day:plan.day,revision:1,periods:[],workIntervals:[{startAtUtc:'2026-11-05T00:00:00.000Z',endAtUtc:'2026-11-05T01:00:00.000Z'}],plannedMinutes:60,leaveType:'NONE'}];s.ownPlans=[{...s.plans[0],plan}];
 assert.equal(h.module.validate({...s,ownPlans:[{...s.ownPlans[0],employeeCode:'OTHER001'}]},s.month,false),false);
 await h.api.read();await h.reply(h.sent[0],s);const text=n=>n.textContent+' '+n.children.map(text).join(' ');assert.match(text(h.n('calendar')),/本人だけの打合せ/);assert.match(text(h.n('calendar')),/自分の用事・特記事項/);
});
