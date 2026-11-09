import test from 'node:test';import assert from 'node:assert/strict';import {scheduleBulkHarness,bulkSnapshot} from './helpers/schedule-bulk-harness.mjs';
const scope={organizationId:'org_example',workplaceId:'wp_example'};
function data(h,s,created=false){return {version:1,month:s.month,snapshot:s,sheet:{url:'https://docs.google.com/spreadsheets/d/fake-sheet/edit#gid=123',created},csv:h.window.TlhScheduleSheet.template(s,scope)};}
async function setup(){const h=scheduleBulkHarness(),s=bulkSnapshot(2);await h.api.load();await h.reply(h.sent[0],s);return {h,s};}
test('one direct read requests no file/URL; authenticated preview shows current revision and explicit apply saves through existing batchPlan',async()=>{
 const {h,s}=await setup();h.click('sheet-read');assert.equal(h.sent[1].command,'sheetRead');assert.deepEqual(JSON.parse(h.sent[1].input),{month:'2026-11',audience:'admin'});assert.equal(h.sent[1].operationId,'');h.click('sheet-read');assert.equal(h.sent.length,2);
 const reply=data(h,s),sheet=h.window.TlhScheduleSheet,rows=sheet.read(reply.csv);rows[3][2]='公休';reply.csv=sheet.csv(rows);s.halves.FIRST.monthRevision=3;await h.reply(h.sent[1],reply,'SCHEDULE_SHEET_READY');assert.equal(h.sent.length,2);assert.match(h.n('import-summary').textContent,/変更 1日分/);assert.equal(h.n('import-apply').textContent,'確認した内容を一括保存');assert.equal(h.n('sheet-open').hidden,false);
 h.click('import-apply');assert.equal(h.sent.length,3);assert.equal(h.sent[2].command,'batchPlan');assert.equal(JSON.parse(h.sent[2].input).expectedRevisions.FIRST,3);assert.equal(JSON.parse(h.sent[2].input).changes.length,1);
});
test('month creation is explicit; response loss retries same month/operation and existing-sheet response does not overwrite local or server schedules',async()=>{
 const {h,s}=await setup();h.confirm(false);h.click('sheet-create');assert.equal(h.sent.length,1);h.confirm(true);h.click('sheet-create');const r=h.sent[1];assert.equal(r.command,'sheetCreate');assert.match(h.n('status').textContent,/用意/);for(const timer of [...h.timers.values()])timer();assert.equal(h.n('retry').hidden,false);assert.equal(h.n('sheet-read').disabled,true);h.click('retry');assert.equal(h.sent[2].operationId,r.operationId);assert.equal(h.sent[2].input,r.input);
 const reply=data(h,s);reply.csv='';await h.reply(h.sent[2],reply,'SCHEDULE_SHEET_READY');assert.match(h.n('status').textContent,/作成済み/);assert.equal(h.sent.length,3);assert.equal(h.n('save').disabled,true);
});
test('forged signatures, other months, unsafe Google URLs and incomplete ready messages cannot expose a source or alter input',async()=>{
 for(const mutate of [v=>v.month='2026-12',v=>v.sheet.url='https://evil.test/',v=>v.snapshot.admin=false,v=>v.sheet.created='yes']){
  const {h,s}=await setup();h.click('sheet-read');const reply=data(h,s);mutate(reply);await h.reply(h.sent[1],reply,'SCHEDULE_SHEET_READY');assert.equal(h.n('sheet-open').hidden,true);assert.equal(h.n('import-preview').hidden,true);
 }
 const {h}=await setup();h.click('sheet-read');await h.reply(h.sent[1],null,'SCHEDULE_SHEET_READY');assert.equal(h.n('sheet-read').disabled,true);assert.equal(h.n('sheet-open').hidden,true);
});
test('failed configuration/missing month or invalid row do not create a save; local changes, denial and departure keep direct operations blocked',async()=>{
 const {h,s}=await setup();h.click('sheet-read');await h.reply(h.sent[1],null,'SCHEDULE_SHEET_NOT_FOUND');assert.match(h.n('status').textContent,/作成/);assert.equal(h.sent.length,2);assert.equal(h.n('save').disabled,true);
 h.click('sheet-read');const reply=data(h,s),sheet=h.window.TlhScheduleSheet,rows=sheet.read(reply.csv);rows[3][2]='invalid';reply.csv=sheet.csv(rows);await h.reply(h.sent[2],reply,'SCHEDULE_SHEET_READY');assert.equal(h.n('save').disabled,true);assert.equal(h.sent.length,3);
 h.edit('EMP001','2026-11-01','公休');h.click('sheet-read');h.click('sheet-create');assert.equal(h.sent.length,3);h.events.pagehide();h.click('sheet-read');assert.equal(h.sent.length,3);assert.equal(h.n('sheet-open').hidden,true);
});
