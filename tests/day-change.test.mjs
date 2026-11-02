import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {dayChangeHarness} from './helpers/day-change-harness.mjs';
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
