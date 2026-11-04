import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{scheduleUiHarness}from'./helpers/schedule-harness.mjs';
function shared(h){return{...h.snapshot(),phase:'PUBLISHED',publishedAt:'2026-11-04T18:30:00.000Z',plans:[{employeeCode:'SCH002',employeeName:'=架空社員',day:'2026-11-05',revision:1,periods:[{start:'23:00',end:'01:00',endNextDay:true,breakMinutes:15}],workIntervals:[{startAtUtc:'2026-11-05T14:00:00.000Z',endAtUtc:'2026-11-05T16:00:00.000Z'}],plannedMinutes:105,leaveType:'NONE',publicNote:'帰省,\n共有メモ',note:'PRIVATE_MARKER'}],events:[{day:'2026-11-05',title:'架空イベント',note:'全員へ共有'}]};}
const text=n=>n.textContent+' '+n.children.map(text).join(' ');
test('second-half report contains only its days and identifies the exact range in CSV',()=>{
 const h=scheduleUiHarness(),s=shared(h);s.period='SECOND';s.plans[0].day='2026-11-20';const report=h.window.TlhScheduleReport.build(s);
 assert.equal(report.rows.length,15);assert.ok(report.rows[0][0].startsWith('2026-11-16'));assert.ok(report.rows.at(-1)[0].startsWith('2026-11-30'));assert.match(h.window.TlhScheduleReport.csv(report),/2026-11-16〜2026-11-30/);
});
test('PDF table and CSV include only complete shared plans, dates, public notes and release date; formula cells are escaped',async()=>{
 const h=scheduleUiHarness('admin'),s=shared(h),r=h.window.TlhScheduleReport.build(s),csv=h.window.TlhScheduleReport.csv(r);assert.equal(r.rows.length,30);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/23:00–01:00（翌日）/);assert.match(csv,/"'=架空社員"/);assert.match(csv,/帰省,/);assert.doesNotMatch(csv,/PRIVATE_MARKER/);assert.match(csv,/2026年11月5日/);
 await h.api.read();await h.reply(h.sent[0],s);assert.equal(h.n('print').disabled,false);assert.equal(h.n('report').hidden,true);assert.equal(h.n('report-rows').children.length,0);
 h.events.beforeprint();h.events.beforeprint();assert.equal(h.n('report').hidden,false);assert.equal(h.n('report-rows').children.length,30);assert.match(text(h.n('report-rows')),/全員へ共有/);assert.doesNotMatch(text(h.n('report-rows')),/PRIVATE_MARKER/);
 h.events.afterprint();assert.equal(h.n('report-rows').children.length,0);h.events.beforeprint();assert.equal(h.n('report-rows').children.length,30);
});
test('printing never writes or sends messages; unverified, unpublished, refresh and departure cannot export',async()=>{
 const h=scheduleUiHarness();let printed=0;h.window.print=()=>printed++;h.click('print');assert.equal(printed,0);await h.api.read();await h.reply(h.sent[0],h.snapshot());h.click('print');assert.equal(printed,0);
 await h.api.read();await h.reply(h.sent[1],shared(h));const before=h.sent.length;h.click('print');assert.equal(printed,1);assert.equal(h.sent.length,before);
 await h.api.read();h.click('print');h.events.beforeprint();assert.equal(printed,1);assert.equal(h.n('report').hidden,true);assert.equal(h.n('report-rows').children.length,0);await h.reply(h.sent[2],shared(h));h.events.pagehide();h.click('print');h.events.beforeprint();assert.equal(printed,1);assert.equal(h.n('csv').disabled,true);assert.equal(h.n('report-rows').children.length,0);
});
test('both pages use dedicated shared-only print section; private forms and screen calendar are excluded from print',()=>{
 const read=name=>fs.readFileSync(new URL('../workforce/'+name,import.meta.url),'utf8');for(const page of ['schedule.html','admin-schedule.html']){const html=read(page);assert.match(html,/class="secondary-page schedule-page"/);assert.match(html,/id="schedule-report" class="schedule-print-only" hidden/);assert.match(html,/schedule-report.js/);}
 assert.match(read('schedule.css'),/\.schedule-page main>\*\{display:none!important\}/);assert.match(read('schedule.css'),/#schedule-report:not\(\[hidden\]\)/);assert.doesNotMatch(read('schedule-report.js'),/fetch\(|localStorage|sessionStorage|innerHTML|sendBeacon/);
});
