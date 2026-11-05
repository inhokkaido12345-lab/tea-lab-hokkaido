import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {adminOverviewHarness,sampleOverview} from './helpers/admin-overview-harness.mjs';
test('home may defer the authorized roster to its queue without changing ordinary page auto-load',async()=>{
 const h=adminOverviewHarness({autoLoad:false});h.api.setAllowed(true);assert.equal(h.sent.length,0);assert.equal(h.n('check').disabled,false);
 h.click();h.click();assert.equal(h.sent.length,1);await h.reply(h.sent[0]);assert.equal(h.badges[0].textContent,'● 2件');
 h.api.setAllowed(false);h.click();assert.equal(h.sent.length,1);
});
test('no unauthenticated roster; verified gate auto-loads once, concurrent taps send once, labels never become identifiers',async()=>{
 const h=adminOverviewHarness();h.click();assert.equal(h.sent.length,0);h.api.setAllowed(true);for(let i=0;i<1000;i++){h.api.setAllowed(true);h.click();}assert.equal(h.sent.length,1);assert.equal(h.n('status').attributes['aria-busy'],'true');
 await h.reply(h.sent[0]);assert.equal(h.n('select').options[1].textContent,'DIR001（架空社員）');assert.equal(h.n('select').options[1].value,'DIR001');assert.ok(h.badges.every(b=>!b.hidden&&b.textContent==='● 2件'));assert.equal(h.n('status').attributes['aria-busy'],'false');
});
test('unknown hides badge, zero hides badge with explicit status, failure is not zero and no partial roster',async()=>{
 const h=adminOverviewHarness();h.api.setAllowed(true);assert.ok(h.badges.every(b=>b.hidden));await h.reply(h.sent[0],'ADMIN_OVERVIEW_READY',{...sampleOverview(),employees:[],pendingCount:0});assert.match(h.n('status').textContent,/承認待ち 0件/);assert.ok(h.badges.every(b=>b.hidden));
 h.click();await h.reply(h.sent[1],'ADMIN_OVERVIEW_ADMIN_REQUIRED');assert.match(h.n('status').textContent,/未確認/);assert.equal(h.n('select').options.length,1);
});
test('bad signatures, frames, origins and malformed signed directory cannot expose names or counts',async()=>{
 for(const [patch,event]of [[{mac:'0'.repeat(64)},{}],[{review:'{}'},{}],[{},{source:{}}],[{},{origin:'https://evil.invalid'}]]){const h=adminOverviewHarness();h.api.setAllowed(true);await h.reply(h.sent[0],'ADMIN_OVERVIEW_READY',sampleOverview(),patch,event);assert.equal(h.n('select').options.length,1);assert.ok(h.badges.every(b=>b.hidden));}
 for(const value of [{...sampleOverview(),pendingCount:-1},{...sampleOverview(),employees:[sampleOverview().employees[0],sampleOverview().employees[0]]}]){const h=adminOverviewHarness();h.api.setAllowed(true);await h.reply(h.sent[0],'ADMIN_OVERVIEW_READY',value);assert.equal(h.n('select').options.length,1);}
});
test('timeout, revocation, departure clear sensitive data and ignore delayed successes',async()=>{
 const h=adminOverviewHarness();h.api.setAllowed(true);const first=h.sent[0];[...h.timers.values()][0]();await h.reply(first);assert.match(h.n('status').textContent,/未確認/);assert.ok(h.badges.every(b=>b.hidden));
 h.click();await h.reply(h.sent[1]);h.api.setAllowed(false);assert.equal(h.n('select').options.length,1);assert.ok(h.badges.every(b=>b.hidden));h.api.setAllowed(true);h.handlers.pagehide();await h.reply(h.sent[2]);assert.equal(h.n('select').options.length,1);
});
test('approval invalidates old count; latest signed queue beats older overview and selected employee is preserved on refresh',async()=>{
 const h=adminOverviewHarness();h.api.setAllowed(true);h.api.setCount(1);await h.reply(h.sent[0]);assert.equal(h.badges[0].textContent,'● 1件');
 assert.equal(h.api.selectEmployee('DIR001','架空社員'),true);h.n('select').value='DIR001';h.click();await h.reply(h.sent[1]);assert.equal(h.n('select').value,'DIR001');h.api.invalidateCount();assert.ok(h.badges.every(b=>b.hidden));assert.match(h.n('status').textContent,/未確認/);
 h.lockRefresh();h.click();assert.equal(h.sent.length,2);
});
test('all existing target fields use selects while new code stays editable; headings use shared hierarchy',()=>{
 const home=fs.readFileSync(new URL('../workforce/index.html',import.meta.url),'utf8');assert.match(home,/<select id="maintenance-code"/);assert.match(home,/<input id="staff-employee-code"/);assert.doesNotMatch(home,/card manager-intro/);assert.match(home,/class="page-heading"><div><p class="eyebrow">管理者用/);
 for(const [file,id]of [['admin-day-change.html','change-employee'],['admin-timecard-records.html','journal-employee']]){const text=fs.readFileSync(new URL('../workforce/'+file,import.meta.url),'utf8');assert.ok(text.includes('<select id="'+id+'"'));assert.match(text,/admin-overview.js/);}
});
