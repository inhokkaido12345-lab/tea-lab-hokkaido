import test from 'node:test';import assert from 'node:assert/strict';import {pendingApprovalsHarness} from './helpers/pending-approvals-harness.mjs';import {dayChangeHarness} from './helpers/day-change-harness.mjs';
const item={groupId:'chg_'+'a'.repeat(32),employeeCode:'EMP030',employeeName:'試験スタッフ',day:'2026-11-01',submittedAt:'2026-11-02T01:00:00.000Z',canReview:true};
const page={version:1,totalCount:1,items:[item],nextCursor:''};
test('employee cannot query; signed admin-only cards identify the applicant and selecting requests only a preview',async()=>{
 const editor=dayChangeHarness(),h=pendingApprovalsHarness({onSelect:editor.editor.selectRequest});h.click('load');assert.equal(h.sent.length,0);assert.equal(h.n('section').hidden,true);
 h.api.setAllowed(true);h.click('load');h.click('load');assert.equal(h.sent.length,1);await h.reply(page);
 const card=h.n('list').children[0];assert.match(card.children[0].textContent,/試験スタッフ（EMP030）/);card.children[2].events.click();assert.equal(editor.sent[0].mode,'REVIEW');assert.equal(editor.sent[0].employeeCode,'EMP030');assert.equal(editor.sent[0].groupId,item.groupId);assert.equal(editor.sent[0].command,'latestPreview');assert.equal(editor.n('commit').disabled,true);
});
test('forged origin/signature, malformed groups and stale responses never populate the list',async()=>{
 const h=pendingApprovalsHarness();h.api.setAllowed(true);h.click('load');await h.reply(page,{mac:'0'.repeat(64)});await h.reply(page,{}, {source:{}});assert.equal(h.n('list').children.length,0);
 await h.reply({...page,items:[{...item,day:'2026-02-30'}]});assert.equal(h.n('list').children.length,0);
 [...h.timers.values()][0]();const late=await h.reply(page);assert.equal(h.n('list').children.length,0);h.click('load');await h.receive(late);assert.equal(h.n('list').children.length,0);
 await h.reply(page);assert.equal(h.n('list').children.length,1);h.handlers.pagehide();assert.equal(h.n('list').children.length,0);h.click('load');assert.equal(h.sent.length,2);
});
test('pagination appends the next page, inactive employees cannot be selected, and approval invalidates stale cards',async()=>{
 const h=pendingApprovalsHarness();h.api.setAllowed(true);h.click('load');await h.reply({...page,totalCount:2,nextCursor:item.groupId});assert.equal(h.n('next').hidden,false);h.click('next');assert.equal(h.sent[1].cursor,item.groupId);
 await h.reply({...page,totalCount:2,items:[{...item,groupId:'chg_'+'b'.repeat(32),canReview:false}]});assert.equal(h.n('list').children.length,2);assert.equal(h.n('list').children[1].children[2].disabled,true);h.api.invalidate();assert.equal(h.n('list').children.length,0);
});
