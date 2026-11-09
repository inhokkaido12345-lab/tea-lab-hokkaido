import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {laborPolicyHarness,sampleReview} from './helpers/labor-policy-harness.mjs';
test('only verified management UI permits explicit read; repeated taps send once and unresolved work is urgent',async()=>{
 const h=laborPolicyHarness();h.click();assert.equal(h.sent.length,0);assert.equal(h.n('section').hidden,true);h.api.setAllowed(true);assert.equal(h.sent.length,0);
 for(let i=0;i<1000;i++)h.click();assert.equal(h.sent.length,1);await h.reply(h.sent[0]);assert.equal(h.n('list').children.length,1);assert.match(h.n('status').textContent,/至急対応 1件/);assert.match(h.n('list').children[0].children[3].textContent,/解消に必要/);
});
test('wrong frame, origin, signature, nonce and changed body never reveal the review',async()=>{
 const h=laborPolicyHarness();h.api.setAllowed(true);h.click();const r=h.sent[0];for(const [patch,event]of [[{mac:'0'.repeat(64)},{}],[{nonce:'0'.repeat(32)},{}],[{review:'{}'},{}],[{},{source:{}}],[{},{origin:'https://evil.test'}]]){await h.reply(r,'LABOR_POLICY_READY',sampleReview(),patch,event);assert.equal(h.n('list').children.length,0);}await h.reply(r);assert.equal(h.n('list').children.length,1);
});
test('signed malformed count or softened priority cannot disguise missing urgent settings',async()=>{
 for(const patch of [{urgentCount:0},{statutoryCalculationReady:true},{issues:[{...sampleReview().issues[0],priority:'LOW'}]}]){const h=laborPolicyHarness();h.api.setAllowed(true);h.click();await h.reply(h.sent[0],'LABOR_POLICY_READY',{...sampleReview(),...patch});assert.equal(h.n('list').children.length,0);}
});
test('empty settings list never claims legal compliance and refresh removes previous details',async()=>{
 const h=laborPolicyHarness();h.api.setAllowed(true);h.click();await h.reply(h.sent[0]);h.click();assert.equal(h.n('list').children.length,0);
 await h.reply(h.sent[1],'LABOR_POLICY_READY',{...sampleReview(),issues:[],urgentCount:0,reviewStatus:'NO_UNRESOLVED_SETTINGS_REPORTED'});assert.match(h.n('status').textContent,/保証する表示ではありません/);
});
test('timeout, revoked UI permission and departure clear business details and ignore old success',async()=>{
 const h=laborPolicyHarness();h.api.setAllowed(true);h.click();const r=h.sent[0];[...h.timers.values()][0]();await h.reply(r);assert.equal(h.n('list').children.length,0);assert.match(h.n('status').textContent,/状態未確認/);
 h.click();const fresh=h.sent[1];h.api.setAllowed(false);await h.reply(fresh);assert.equal(h.n('section').hidden,true);assert.equal(h.n('source').textContent,'');h.api.setAllowed(true);h.click();h.handlers.pagehide();await h.reply(h.sent[2]);assert.equal(h.n('list').children.length,0);
});
test('urgent review belongs to a dedicated gated page; home only contains its entry',()=>{
 const h=laborPolicyHarness(),html=fs.readFileSync(new URL('../workforce/index.html',import.meta.url),'utf8'),page=fs.readFileSync(new URL('../workforce/labor-policy.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="labor-policy-section"|src="labor-policy.js/);assert.match(html,/href="labor-policy.html"/);
 assert.match(page,/id="labor-policy-section"[^>]*hidden/);assert.match(page,/至急確認/);assert.match(page,/name="tlhLaborPolicyFrame"/);assert.match(page,/admin-access.js/);
 assert.doesNotMatch(h.source,/NOT_CONCLUDED_OR_FILED|2026-11-03|localStorage|sessionStorage|console\.|innerHTML|bridgeRecordPunch/);
});
