import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import {scheduleBulkHarness,bulkSnapshot} from './helpers/schedule-bulk-harness.mjs';
function fixture(){const h=scheduleBulkHarness(),s=bulkSnapshot(1);for(const p of ['FIRST','SECOND'])s.halves[p].inputMode='SHEET';return{h,s};}
function response(h,s){const plan={day:'2026-11-01',...h.model.parse('公休')};return{version:1,month:s.month,snapshot:s,csv:'',sheet:{url:'https://docs.google.com/spreadsheets/d/fake-sheet/edit#gid=123',created:false},authority:{sourceDigest:'a'.repeat(64),targetDigest:'b'.repeat(64),preview:{month:s.month,changes:[{employeeCode:'EMP001',employeeName:'架空社員1',day:plan.day,before:'勤務あり',after:'公休',workText:'公休',plan,published:false,expectedPlanRevision:0}],blanks:29,unchanged:29,eventChanges:0,eventDetails:[]}}};}

test('source mode hides manual editing and CSV; import sends only authenticated source/target digests and stable retry, never a browser plan',async()=>{
 const{h,s}=fixture();await h.api.load();await h.reply(h.sent[0],s);assert.equal(h.n('manual').hidden,true);assert.equal(h.n('csv-tools').hidden,true);assert.equal(h.n('file').disabled,true);assert.equal(h.n('save').hidden,true);h.click('save');assert.equal(h.sent.length,1);
 h.click('sheet-read');await h.reply(h.sent[1],response(h,s),'SCHEDULE_SHEET_READY');assert.equal(h.n('import-apply').textContent,'確認した正本シートを取り込む');h.click('import-apply');const r=h.sent[2],input=JSON.parse(r.input);assert.equal(r.command,'sheetImport');assert.deepEqual(Object.keys(input).sort(),['audience','month','reason','sourceDigest','targetDigest']);for(const timer of [...h.timers.values()])timer();h.click('retry');assert.equal(h.sent[3].input,r.input);assert.equal(h.sent[3].operationId,r.operationId);
});

test('source preview rejects malformed mode, plan, digest or roster and discards stale preview after a source-change refusal',async()=>{
 for(const mutate of [v=>v.authority.sourceDigest='bad',v=>v.authority.preview.changes[0].employeeCode='OTHER',v=>v.authority.preview.changes[0].plan.day='2026-12-01',v=>delete v.authority]){
 const{h,s}=fixture();await h.api.load();await h.reply(h.sent[0],s);h.click('sheet-read');const v=response(h,s);mutate(v);await h.reply(h.sent[1],v,'SCHEDULE_SHEET_READY');assert.equal(h.n('import-preview').hidden,true);assert.equal(h.n('sheet-open').hidden,true);
 }
 const{h,s}=fixture();await h.api.load();await h.reply(h.sent[0],s);h.click('sheet-read');await h.reply(h.sent[1],response(h,s),'SCHEDULE_SHEET_READY');h.click('import-apply');await h.reply(h.sent[2],null,'SCHEDULE_SHEET_CHANGED');assert.equal(h.n('import-preview').hidden,true);assert.match(h.n('status').textContent,/変わり/);
});

test('published source import still requires a reason and event-only changes can be explicitly imported',async()=>{
 const{h,s}=fixture();s.halves.FIRST.phase='PUBLISHED';s.halves.FIRST.publishedAt='2026-11-01T00:00:00.000Z';await h.api.load();await h.reply(h.sent[0],s);h.click('sheet-read');const v=response(h,s);v.authority.preview.changes[0].published=true;await h.reply(h.sent[1],v,'SCHEDULE_SHEET_READY');h.click('import-apply');assert.equal(h.sent.length,2);h.n('reason').value='調整';h.click('import-apply');assert.equal(h.sent.length,3);
 const f=fixture();await f.h.api.load();await f.h.reply(f.h.sent[0],f.s);f.h.click('sheet-read');const e=response(f.h,f.s);e.authority.preview.changes=[];e.authority.preview.eventChanges=1;e.authority.preview.eventDetails=[{day:'2026-11-01',before:'なし',after:'催事',published:false}];await f.h.reply(f.h.sent[1],e,'SCHEDULE_SHEET_READY');assert.equal(f.h.n('import-apply').disabled,false);f.h.click('import-apply');assert.equal(f.h.sent[2].command,'sheetImport');
});

// 実際の不具合: 署名済みモードが届く前のHTML/初期化で旧メモ編集を見せてしまった。
test('manual guidance stays hidden before authentication, on failed reads and after departure; only verified legacy mode reveals it',async()=>{
 const html=fs.readFileSync(new URL('../workforce/admin-schedule-bulk.html',import.meta.url),'utf8');
 for(const id of ['manual','csv-tools','save','count'])assert.match(html,new RegExp('<[^>]+id="bulk-'+id+'"[^>]* hidden'));
 assert.doesNotMatch(html,/セルを選ぶと、その日のメモを編集できます/);
 const{h,s}=fixture();for(const id of ['manual','csv-tools','save','count'])assert.equal(h.n(id).hidden,true);
 await h.api.load();await h.reply(h.sent[0],null,'SCHEDULE_PERMISSION_REQUIRED');assert.equal(h.n('manual').hidden,true);
 await h.api.load();await h.reply(h.sent.at(-1),s);assert.equal(h.n('manual').hidden,true);h.events.pagehide();assert.equal(h.n('manual').hidden,true);
 const legacy=scheduleBulkHarness();await legacy.api.load();await legacy.reply(legacy.sent[0],bulkSnapshot(1));assert.equal(legacy.n('manual').hidden,false);assert.equal(legacy.n('csv-tools').hidden,false);
});
