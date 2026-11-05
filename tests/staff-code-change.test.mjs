import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {staffCodeChangeHarness} from './helpers/staff-code-change-harness.mjs';
test('a signed commit-only success cannot masquerade as a preview result',async()=>{
 const h=staffCodeChangeHarness();h.preview();await h.reply(h.sent[0],'STAFF_CODE_CHANGED');assert.equal(h.n('commit').disabled,true);assert.equal(h.n('status').textContent,'確認中です。');
});
test('no automatic mutation, commit unavailable before verified preview and double-click does not duplicate a command',async()=>{
 const h=staffCodeChangeHarness();assert.equal(h.sent.length,0);h.commit();assert.equal(h.sent.length,0);h.preview();h.preview();assert.equal(h.sent.length,1);assert.equal(h.sent[0].command,'PREVIEW');assert.equal(h.n('commit').disabled,true);
 await h.reply(h.sent[0],'STAFF_CODE_CHANGE_READY','a'.repeat(64));assert.equal(h.n('commit').disabled,false);assert.match(h.n('summary').textContent,/OLD001.*NEW001/);h.commit();h.commit();assert.equal(h.sent.length,2);assert.equal(h.sent[1].command,'COMMIT');
});
test('bad MAC, wrong frame/origin/nonce and late preview never enable save',async()=>{
 for(const [patch,event]of [[{mac:'0'.repeat(64)},{}],[{}, {source:{}}],[{}, {origin:'https://evil.example'}],[{nonce:'f'.repeat(32)},{}]]){const h=staffCodeChangeHarness();h.preview();await h.reply(h.sent[0],'STAFF_CODE_CHANGE_READY','a'.repeat(64),patch,event);assert.equal(h.n('commit').disabled,true);}
 const h=staffCodeChangeHarness();h.preview();const r=h.sent[0];h.timeout();await h.reply(r,'STAFF_CODE_CHANGE_READY','a'.repeat(64));assert.equal(h.n('commit').disabled,true);
});
test('unknown commit result retains immutable operation/input/revision and retry refreshes only the response envelope',async()=>{
 const h=staffCodeChangeHarness();h.preview();await h.reply(h.sent[0],'STAFF_CODE_CHANGE_READY','a'.repeat(64));h.commit();const first=h.sent[1];h.timeout();assert.equal(h.n('reset').disabled,true);h.n('new').value='DIFFERENT';h.commit();const second=h.sent[2];for(const k of ['employeeCode','newEmployeeCode','expectedName','expectedHireDate','operationId','revision'])assert.equal(second[k],first[k]);assert.notEqual(second.nonce,first.nonce);assert.notEqual(second.responseKey,first.responseKey);
 await h.reply(second,'STAFF_OPERATION_ALREADY_DONE');assert.equal(h.n('review').hidden,true);assert.equal(h.n('fields').disabled,false);assert.equal(h.n('reset').disabled,false);
});
test('busy/refused requests preserve safe retry, occupied codes never enable save and review quarantine blocks further writes',async()=>{
 const h=staffCodeChangeHarness();h.preview();await h.reply(h.sent[0],'STAFF_CODE_ALREADY_USED');assert.equal(h.n('commit').disabled,true);assert.equal(h.n('fields').disabled,false);
 h.preview();await h.reply(h.sent[1],'STAFF_CODE_CHANGE_READY','a'.repeat(64));h.commit();await h.reply(h.sent[2],'WRITE_REVIEW_REQUIRED');assert.equal(h.n('commit').disabled,true);h.commit();assert.equal(h.sent.length,3);
});
test('departure clears identity and refuses late verified replies and missing LINE proof never submits',async()=>{
 const h=staffCodeChangeHarness();h.preview();const r=h.sent[0];h.leave();await h.reply(r,'STAFF_CODE_CHANGE_READY','a'.repeat(64));assert.equal(h.n('old').value,'');assert.equal(h.n('name').value,'');assert.equal(h.n('review').hidden,true);h.commit();assert.equal(h.sent.length,1);
 const missing=staffCodeChangeHarness();missing.setToken(null);missing.preview();assert.equal(missing.sent.length,0);assert.match(missing.n('status').textContent,/LINE/);
});
test('page uses shared typography, no native confirmation or personal-data storage, and a dedicated framed reply',()=>{
 const html=fs.readFileSync(new URL('../workforce/staff-code-change.html',import.meta.url),'utf8'),js=fs.readFileSync(new URL('../workforce/staff-code-change.js',import.meta.url),'utf8');assert.match(html,/ibm-plex-sans-jp/);assert.match(html,/app\.css/);assert.match(html,/tlhStaffCodeChangeFrame/);assert.doesNotMatch(js,/localStorage|sessionStorage|console\.|\.confirm\(/);assert.match(html,/確認した社員番号へ変更する/);
});
