import test from 'node:test';import assert from 'node:assert/strict';
import {scheduleBulkHarness,bulkSnapshot} from './helpers/schedule-bulk-harness.mjs';
const scope={organizationId:'org_example',workplaceId:'wp_example'};
function fixture(count=2){const h=scheduleBulkHarness(),s=bulkSnapshot(count),sheet=h.window.TlhScheduleSheet,rows=sheet.read(sheet.template(s,scope));return {h,s,sheet,rows};}
function file(text){return {size:Buffer.byteLength(text),text:async()=>text};}
test('spreadsheet CSV handles quoted multiline split shifts, BOM, CRLF, commas and doubled quotes',()=>{
 const {s,sheet,rows}=fixture();rows[3][2]='09:00-12:00/0\n14:00-18:00/30';rows[3][1]='表示,補助"氏名';rows[4][3]='有給';
 const result=sheet.preview(sheet.csv(rows),s,scope);assert.equal(result.changes.length,2);assert.equal(result.changes[0].plan.periods.length,2);assert.equal(result.changes[0].employeeName,'架空社員1');assert.equal(result.blanks,58);
 assert.equal(sheet.preview(sheet.template(s,scope),s,scope).changes.length,0);
});
test('all rows validate before applying; mismatched scope/month, broken dates, unknown/duplicate codes and invalid later cells reject whole CSV',()=>{
 for(const mutate of [r=>r[0][1]='2026-12',r=>r[0][2]='other',r=>r[0][3]='other',r=>r[1][2]='2026-11-02',r=>r[2][2]='月',r=>r[3][0]='NOT_REGISTERED',r=>r[4][0]=r[3][0],r=>r[4][3]='bad',r=>r[3][32]='公休']){
  const {s,sheet,rows}=fixture();rows[3][2]='公休';mutate(rows);assert.throws(()=>sheet.preview(sheet.csv(rows),s,scope));
 }
 for(const text of ['"broken','a"b','"closed"junk','\ufffd','\0'])assert.throws(()=>fixture().sheet.read(text));
});
test('blank CSV cells never remove saved plans; unchanged cells preserve special leave, appointments and private/public notes',()=>{
 const {h,s,sheet,rows}=fixture(),plan=h.model.parse('09:00-18:00/60');plan.appointments=[{title:'keep'}];plan.note='private';plan.publicNote='public';plan.leave={type:'PAID',unit:'HOUR',minutes:60,note:'keep leave note'};
 s.halves.FIRST.drafts.push({employeeCode:'EMP001',day:'2026-11-01',revision:4,plan});
 assert.equal(sheet.preview(sheet.csv(rows),s,scope).changes.length,0);
 rows[3][2]='09:00-18:00/60';assert.equal(sheet.preview(sheet.csv(rows),s,scope).changes.length,0);
 rows[3][2]='10:00-18:00/60';assert.throws(()=>sheet.preview(sheet.csv(rows),s,scope),/時間休/);plan.leave={type:'NONE',unit:'DAY',minutes:null,note:''};const change=sheet.preview(sheet.csv(rows),s,scope).changes[0];assert.equal(change.plan.note,'private');assert.equal(change.plan.publicNote,'public');assert.equal(change.plan.appointments[0].title,'keep');
 rows[3][2]='未定';assert.equal(sheet.preview(sheet.csv(rows),s,scope).changes[0].plan.periods.length,0);
});
test('reordering rows uses employee code and partial rows leave omitted people unchanged; maximum 500 changes enforced',()=>{
 const {s,sheet,rows}=fixture();const people=rows.splice(3).reverse();rows.push(...people);rows[3][2]='公休';assert.equal(sheet.preview(sheet.csv(rows),s,scope).changes[0].employeeCode,'EMP002');
 const many=fixture(17);for(const row of many.rows.slice(3))for(let i=2;i<32;i++)row[i]='公休';assert.throws(()=>many.sheet.preview(many.sheet.csv(many.rows),many.s,scope),/500/);
});
test('preview and apply send nothing; explicit save posts 75 changes once, uses current revisions and lost-reply retry keeps ID/input',async()=>{
 const {h,s,sheet,rows}=fixture(5);s.halves.FIRST.monthRevision=3;s.halves.SECOND.monthRevision=8;
 await h.api.load();await h.reply(h.sent[0],s);for(const row of rows.slice(3))for(let i=2;i<17;i++)row[i]='09:00-18:00/60';
 await h.api.previewFile(file(sheet.csv(rows)));assert.equal(h.sent.length,1);assert.equal(h.n('save').disabled,true);assert.equal(h.n('import-rows').children.length,75);
 h.click('import-apply');assert.equal(h.sent.length,1);assert.match(h.n('count').textContent,/75日分/);h.click('save');assert.equal(h.sent.length,2);const r=h.sent[1],data=JSON.parse(r.input);assert.equal(data.changes.length,75);assert.equal(data.expectedRevisions.FIRST,3);assert.equal(data.expectedRevisions.SECOND,8);
 [...h.timers.values()][0]();assert.equal(h.n('file').disabled,true);h.click('retry');assert.equal(h.sent[2].input,r.input);assert.equal(h.sent[2].operationId,r.operationId);
});
test('cancel/error/discarded asynchronous read cannot modify local plans or re-enable departed page',async()=>{
 const {h,s,sheet,rows}=fixture();await h.api.load();await h.reply(h.sent[0],s);rows[3][2]='公休';await h.api.previewFile(file(sheet.csv(rows)));h.click('import-cancel');assert.match(h.n('count').textContent,/0日分/);assert.equal(h.sent.length,1);
 rows[4][2]='bad';await h.api.previewFile(file(sheet.csv(rows)));assert.match(h.n('count').textContent,/0日分/);assert.equal(h.n('import-preview').hidden,true);
 let done;const reading=h.api.previewFile({size:10,text:()=>new Promise(resolve=>done=resolve)});h.events.pagehide();done(sheet.csv(rows));await reading;assert.equal(h.n('rows').children.length,0);assert.equal(h.n('file').disabled,true);assert.equal(h.n('save').disabled,true);
});
test('published imported changes stay consent proposals and save still requires a reason; local unsaved changes block new imports',async()=>{
 const {h,s,sheet,rows}=fixture();s.halves.FIRST.phase='PUBLISHED';s.halves.FIRST.monthRevision=2;s.halves.FIRST.publishedAt='2026-11-01T00:00:00.000Z';await h.api.load();await h.reply(h.sent[0],s);rows[3][2]='公休';await h.api.previewFile(file(sheet.csv(rows)));h.click('import-apply');h.click('save');assert.equal(h.sent.length,1);assert.match(h.n('status').textContent,/理由/);h.n('reason').value='本人と調整';h.click('save');assert.equal(JSON.parse(h.sent[1].input).changes[0].expectedPlanRevision,2);
 const other=fixture();await other.h.api.load();await other.h.reply(other.h.sent[0],other.s);other.h.edit('EMP001','2026-11-01','有給');await other.h.api.previewFile(file(other.sheet.csv(other.rows)));assert.equal(other.h.n('import-preview').hidden,true);
});
