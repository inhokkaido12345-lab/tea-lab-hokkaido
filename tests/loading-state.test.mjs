/** Actual request lifecycle, not timer-driven decoration. Fake transport and real signed reply verification. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adminAccessHarness} from './helpers/admin-access-harness.mjs';import {accountInfoHarness} from './helpers/account-info-harness.mjs';import {dayChangeHarness} from './helpers/day-change-harness.mjs';
test('admin spinner starts only during check and stops on success, denial, timeout or departure without retry traffic',async()=>{
 for(const outcome of ['success','denied','timeout','departure']){const h=adminAccessHarness();assert.equal(h.status.attributes['aria-busy'],'false');h.api.start();assert.equal(h.status.attributes['aria-busy'],'true');
  if(outcome==='success')await h.reply();else if(outcome==='denied')await h.reply('TLH_ADMIN_REQUIRED');else if(outcome==='timeout')[...h.timers.values()][0]();else h.handlers.pagehide();
  assert.equal(h.status.attributes['aria-busy'],'false');for(let i=0;i<1000;i++)h.api.start();assert.equal(h.sent.length,1);
 }
});
test('personal reads stop animation after reply or timeout, and unknown correction outcome is not shown as ongoing communication',async()=>{
 const account=accountInfoHarness();account.click();assert.equal(account.n('status').attributes['aria-busy'],'true');await account.reply(account.sent[0]);assert.equal(account.n('status').attributes['aria-busy'],'false');
 account.click();[...account.timers.values()][0]();assert.equal(account.n('status').attributes['aria-busy'],'false');
 const change=dayChangeHarness();change.click('preview');assert.equal(change.n('status').attributes['aria-busy'],'true');await change.reply(change.sent[0]);assert.equal(change.n('status').attributes['aria-busy'],'false');change.click('commit');assert.equal(change.n('status').attributes['aria-busy'],'true');[...change.timers.values()][0]();assert.equal(change.n('status').attributes['aria-busy'],'false');assert.equal(change.n('commit').disabled,true);
});
test('all three existing stylesheets provide the same CSS-only indicator and a reduced-motion alternative',()=>{
 const root=new URL('../workforce/',import.meta.url),read=file=>fs.readFileSync(new URL(file,root),'utf8');
 for(const file of ['app.css','recovery.css','sandbox/index.html']){const text=read(file);assert.match(text,/\[aria-busy="true"\]::after/);assert.match(text,/@keyframes tlh-network-wait/);assert.match(text,/@media\(prefers-reduced-motion:reduce\)/);}
});
