import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{scheduleUiHarness,snapshot}from'./helpers/schedule-harness.mjs';
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
