import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {dayChangeHarness} from './helpers/day-change-harness.mjs';

function addSecond(h){h.click('add-session');const card=h.n('sessions').children.at(-1),inputs=card.children.slice(1,5).map(label=>label.children[0]);
 ['2026-11-01T15:00','2026-11-01T19:00','2026-11-01T16:00','2026-11-01T16:30'].forEach((value,i)=>inputs[i].value=value);return inputs;}

test('employee correction only submits SELF and cannot select the approval queue',async()=>{
 const h=dayChangeHarness({audience:'employee'});assert.equal(h.editor.selectRequest('EMP030','chg_'+'c'.repeat(32)),false);
 for(const mode of ['DIRECT','REVIEW']){h.n('mode').value=mode;h.n('group').value='chg_'+'c'.repeat(32);h.click('preview');assert.equal(h.sent.length,0);}
 h.n('mode').value='SELF';h.click('preview');assert.equal(h.sent[0].mode,'SELF');assert.equal(h.sent[0].employeeCode,'');
 await h.reply(h.sent[0]);h.click('commit');assert.equal(h.sent[1].mode,'SELF');await h.reply(h.sent[1],'CHANGE_REQUESTED');assert.match(h.n('status').textContent,/承認待ち/);
});

test('admin correction locks before verification, excludes SELF and retains DIRECT and REVIEW',async()=>{
 const h=dayChangeHarness({audience:'admin'});h.click('preview');assert.equal(h.sent.length,0);assert.equal(h.n('preview').disabled,true);
 h.editor.setAdminAllowed(true);h.n('mode').value='SELF';h.click('preview');assert.equal(h.sent.length,0);
 h.n('mode').value='DIRECT';h.click('preview');await h.reply(h.sent[0]);h.click('commit');assert.equal(h.sent[1].mode,'DIRECT');
 const r=dayChangeHarness({audience:'admin'});r.editor.setAdminAllowed(true);assert.equal(r.editor.selectRequest('EMP030','chg_'+'d'.repeat(32)),true);assert.equal(r.sent[0].mode,'REVIEW');
 r.editor.setAdminAllowed(false);assert.equal(r.n('commit').disabled,true);assert.equal(r.n('review').hidden,true);
});

test('manager navigation leads only to dedicated management pages; employee URLs stay self-only',()=>{
 const read=n=>fs.readFileSync(new URL('../workforce/'+n,import.meta.url),'utf8'),main=read('index.html');
 const manager=main.slice(main.indexOf('<div id="manager-tools-panel"'),main.indexOf('<section id="staff-section"'));
 assert.match(manager,/href="admin-day-change.html"/);assert.match(manager,/href="admin-timecard-records.html"/);assert.doesNotMatch(manager,/href="(?:day-change|timecard-records)\.html"/);
 for(const page of ['day-change.html','timecard-records.html']){const html=read(page);assert.match(html,/data-audience="employee"/);assert.doesNotMatch(html,/<option[^>]+value="(?:DIRECT|REVIEW|admin)"/);}
 for(const page of ['admin-day-change.html','admin-timecard-records.html']){const html=read(page);assert.match(html,/data-audience="admin"/);assert.doesNotMatch(html,/<option[^>]+value="(?:SELF|self)"/);assert.match(html,/data-bootstrap="true"/);}
});
test('JST local input converts exactly, invalid calendar dates reject without browser timezone assumptions',()=>{
  const h=dayChangeHarness(),utc=h.window.TlhDayChange.utc;assert.equal(utc('2026-11-01T09:00'),'2026-11-01T00:00:00.000Z');
  for(const s of ['2026-02-30T09:00','2026-11-01T24:00','2026-11-01 09:00'])assert.throws(()=>utc(s));
});
test('preview sends nothing at init, displays signed review; direct commit needs confirmation and frozen reviewed fields',async()=>{
  const h=dayChangeHarness();assert.equal(h.sent.length,0);h.click('commit');assert.equal(h.sent.length,0);h.click('preview');h.click('preview');assert.equal(h.sent.length,1);
  await h.reply(h.sent[0]);assert.equal(h.n('commit').disabled,false);assert.match(h.n('review').textContent,/EMP030/);
  h.window.confirm=()=>false;h.click('commit');assert.equal(h.sent.length,1);h.window.confirm=()=>true;h.n('out').value='tampered without input';h.click('commit');h.click('commit');
  assert.equal(h.sent.length,2);assert.equal(h.sent[1].clockOut,h.sent[0].clockOut);assert.equal(h.sent[1].groupId,h.sent[0].groupId);assert.equal(h.sent[1].command,'commit');
  await h.reply(h.sent[1],'CHANGE_APPLIED');assert.equal(h.n('commit').disabled,true);assert.match(h.n('status').textContent,/反映/);
});
test('forged source/origin/signature/group/command or edited summary never enables a write',async()=>{
  const h=dayChangeHarness();h.click('preview');const r=h.sent[0];
  for(const [patch,eventPatch] of [[{mac:'0'.repeat(64)},{}],[{groupId:'chg_'+'f'.repeat(32)},{}],[{command:'commit'},{}],[{summary:'{}'},{}],[{},{source:{}}],[{},{origin:'https://attacker.test'}]]){
    await h.reply(r,'CHANGE_READY',patch,eventPatch);assert.equal(h.n('commit').disabled,true);
  }
  await h.reply(r);h.n('reason').events.input();assert.equal(h.n('commit').disabled,true);
});
test('self request is distinguished from direct correction, and review requires a group plus admin employee selection',async()=>{
  const h=dayChangeHarness();h.n('mode').value='SELF';h.n('mode').events.input();h.click('preview');assert.equal(h.sent[0].employeeCode,'');
  await h.reply(h.sent[0]);h.click('commit');await h.reply(h.sent[1],'CHANGE_REQUESTED');assert.match(h.n('status').textContent,/承認待ち/);assert.equal(h.n('copy').hidden,false);
  const review=dayChangeHarness();review.n('mode').value='REVIEW';review.n('mode').events.input();review.click('preview');assert.equal(review.sent.length,0);
  review.n('group').value='chg_'+'c'.repeat(32);review.click('preview');assert.equal(review.sent[0].mode,'REVIEW');assert.equal(review.sent[0].clockIn,undefined);
});
test('unknown commit freezes new writes, readback reuses the group, departure clears secrets and old responses stay ignored',async()=>{
  const h=dayChangeHarness();h.click('preview');await h.reply(h.sent[0]);h.click('commit');const original=h.sent[1];[...h.timers.values()][0]();
  h.click('commit');assert.equal(h.sent.length,2);h.click('preview');assert.equal(h.sent[2].groupId,original.groupId);
  await h.reply(original,'CHANGE_APPLIED');assert.equal(h.n('commit').disabled,true);await h.reply(h.sent[2],'CHANGE_APPLIED');assert.match(h.n('status').textContent,/反映/);
  h.handlers.pagehide();assert.equal(h.n('reason').value,'');assert.equal(h.n('receipt').textContent,'');assert.doesNotMatch(h.source,/localStorage|sessionStorage|console\.|URLSearchParams/);
});
test('dedicated HTML has required controls and journal links to it without changing the punch controller',()=>{
  const html=fs.readFileSync(new URL('../workforce/day-change.html',import.meta.url),'utf8'),journal=fs.readFileSync(new URL('../workforce/timecard-records.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const k of ['mode','employee','group','day','in','out','break-start','break-end','reason','preview','commit','review','status','receipt','copy','frame'])assert.ok(ids.includes('change-'+k));
  assert.match(journal,/href="day-change.html"/);assert.match(html,/name="referrer" content="no-referrer"/);
});

test('native datetime-local values with seconds or fractional seconds are accepted without losing precision',()=>{
  const h=dayChangeHarness();h.n('in').value='2026-11-01T09:00:00';h.n('out').value='2026-11-01T18:00:00.125';h.click('preview');
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].clockIn,'2026-11-01T00:00:00.000Z');assert.equal(h.sent[0].clockOut,'2026-11-01T09:00:00.125Z');
});
test('missing reason, mismatched day and incomplete or reversed breaks identify the exact field without sending',()=>{
  for(const [patch,expected]of [[{reason:''},/理由/],[{day:'2026-11-02'},/出勤日/],
    [{'break-end':''},/休憩終了/],[{'break-start':'2026-11-01T14:00'},/休憩/],[{out:'2026-11-01T08:00'},/退勤日時/]]){
    const h=dayChangeHarness();for(const [key,value]of Object.entries(patch))h.n(key).value=value;h.click('preview');
    assert.equal(h.sent.length,0);assert.match(h.n('status').textContent,expected);assert.equal(h.n('commit').disabled,true);
  }
});
test('split-day request preserves all sessions in signed preview and immutable commit while gaps are explicit',async()=>{
 const h=dayChangeHarness();h.n('out').value='2026-11-01T12:00';h.n('break-start').value='2026-11-01T10:00';h.n('break-end').value='2026-11-01T10:15';const extra=addSecond(h);
 h.click('preview');const r=h.sent[0],parts=JSON.parse(r.sessions);assert.equal(parts.length,2);assert.equal(r.clockOut,'2026-11-01T10:00:00.000Z');assert.equal(r.action,'bridgeAttendanceDayChangeV2');
 await h.reply(r);assert.equal(h.n('commit').disabled,false);assert.match(h.n('review').textContent,/勤務 2/);assert.match(h.n('review').textContent,/15:00/);extra[1].value='tampered';h.click('commit');assert.equal(h.sent[1].sessions,r.sessions);assert.equal(h.n('add-session').disabled,true);
 await h.reply(h.sent[1],'CHANGE_APPLIED');assert.equal(h.n('sessions').children.length,0);
});
test('overlapping extra shifts or half a break are identified without any request; unknown commit cannot add sessions',async()=>{
 const h=dayChangeHarness(),fields=addSecond(h);h.click('preview');assert.equal(h.sent.length,0);assert.match(h.n('status').textContent,/勤務 2/);
 h.n('out').value='2026-11-01T12:00';h.n('break-start').value='';h.n('break-end').value='';fields[3].value='';h.click('preview');assert.equal(h.sent.length,0);assert.match(h.n('status').textContent,/休憩終了/);
 fields[3].value='2026-11-01T16:30';h.click('preview');await h.reply(h.sent[0]);h.click('commit');[...h.timers.values()][0]();h.click('add-session');assert.equal(h.n('sessions').children.length,1);assert.equal(h.sent.length,2);
});

test('latest review commits only after signed preview and confirmation; unknown outcome keeps the exact source request',async()=>{
 const h=dayChangeHarness({audience:'admin'});h.editor.setAdminAllowed(true);h.editor.selectRequest('EMP030','chg_'+'e'.repeat(32));
 assert.equal(h.sent[0].command,'latestPreview');await h.reply(h.sent[0]);assert.equal(h.n('commit').disabled,false);
 h.window.confirm=()=>false;h.click('commit');assert.equal(h.sent.length,1);h.window.confirm=()=>true;h.click('commit');assert.equal(h.sent[1].command,'latestCommit');
 [...h.timers.values()][0]();assert.equal(h.n('employee').disabled,true);assert.equal(h.editor.selectRequest('EMP030','chg_'+'f'.repeat(32)),false);
 h.click('preview');assert.equal(h.sent[2].command,'latestPreview');assert.equal(h.sent[2].groupId,h.sent[0].groupId);await h.reply(h.sent[2],'CHANGE_APPLIED');assert.equal(h.n('commit').disabled,true);
});
