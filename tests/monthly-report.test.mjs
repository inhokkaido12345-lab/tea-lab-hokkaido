import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {monthlyReportHarness,sampleReport} from './helpers/monthly-report-harness.mjs';
test('verified admin gets signed report identity, split intervals, overnight exact timestamps and unresolved open intervals',async()=>{
 const h=monthlyReportHarness();h.click('report-csv');h.click('report-print');assert.equal(h.downloads.length,0);assert.equal(h.printed(),0);h.click('journal-check');assert.equal(h.sent.length,0);h.viewer.setAdminAllowed(true);h.click('journal-check');assert.equal(h.sent[0].action,'bridgeGetAttendanceReport');await h.reply(h.sent[0]);
 assert.equal(h.n('monthly-report').hidden,false);assert.equal(h.n('report-rows').children.length,31);assert.match(h.n('report-title').textContent,/RPT001（架空提出社員）/);assert.match(h.n('report-summary').textContent,/未退勤 1区間/);
 const model=h.window.TlhMonthlyReport.build(sampleReport());assert.equal(model.rows[1][2],'2026-11-01 14:00:00.000');assert.equal(model.rows[2][3],'2026-11-03 11:00:00.123');assert.equal(model.workedMs,66600000);assert.equal(model.rows[3][6],'未確定');assert.match(model.rows[4][7],/記録なし/);
});
test('CSV is BOM UTF-8, quotes names, keeps every interval and neutralizes spreadsheet formula cells',async()=>{
 const h=monthlyReportHarness(),r=sampleReport();r.employeeName=' =1+"2",架空';const model=h.window.TlhMonthlyReport.build(r),csv=h.window.TlhMonthlyReport.csv(model);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\' =1+""2"",架空"'));assert.ok(csv.includes('2026-11-03 11:00:00.123'));assert.doesNotMatch(csv,/idToken|responseKey|fake.jwt|provider_subject/);
 h.viewer.setAdminAllowed(true);h.click('journal-check');await h.reply(h.sent[0],r);h.click('report-csv');assert.equal(h.downloads[1].name,'timecard_RPT001_2026-11.csv');assert.ok((await h.downloads[0].blob.text()).includes('架空'));h.click('report-print');assert.equal(h.printed(),1);h.exporter.clear();assert.deepEqual(h.revoked,['blob:fake']);
});
test('wrong signature/source/employee, incomplete V2 payload, lost role and old target cannot enable exports',async()=>{
 for(const [report,patch,event]of [[sampleReport(),{mac:'0'.repeat(64)},{}],[sampleReport(),{},{source:{}}],[{...sampleReport(),employeeCode:'OTHER'},{},{}]]){const h=monthlyReportHarness();h.viewer.setAdminAllowed(true);h.click('journal-check');await h.reply(h.sent[0],report,patch,event);assert.equal(h.n('report-csv').disabled,true);}
 const h=monthlyReportHarness();h.viewer.setAdminAllowed(true);h.click('journal-check');h.viewer.setAdminAllowed(false);await h.reply(h.sent[0]);assert.equal(h.n('report-csv').disabled,true);h.viewer.setAdminAllowed(true);h.click('journal-check');h.n('journal-employee').value='OTHER';h.n('journal-employee').events.input();await h.reply(h.sent[1]);assert.equal(h.n('monthly-report').hidden,true);
});
test('refresh, timeout and departure erase previous report; failed read never yields an empty success',async()=>{
 const h=monthlyReportHarness();h.viewer.setAdminAllowed(true);h.click('journal-check');await h.reply(h.sent[0]);h.click('journal-check');assert.equal(h.n('monthly-report').hidden,true);assert.equal(h.n('report-csv').disabled,true);[...h.timers.values()][0]();await h.reply(h.sent[1]);assert.equal(h.n('monthly-report').hidden,true);h.click('journal-check');await h.reply(h.sent[2]);await h.handlers.pagehide();assert.equal(h.n('report-title').textContent,'');h.click('report-print');assert.equal(h.printed(),0);
});
test('print CSS exposes only the ready monthly report and repeats table headers',()=>{
 const css=fs.readFileSync(new URL('../workforce/app.css',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../workforce/admin-timecard-records.html',import.meta.url),'utf8');assert.match(css,/@page \{ size:A4 landscape/);assert.match(css,/#monthly-report:not\(\[hidden\]\)/);assert.match(css,/thead \{ display:table-header-group/);assert.match(html,/月次記録をCSV保存/);assert.match(html,/印刷・PDF保存/);
});

test('dedicated print stylesheet restores only an authorized monthly detail table, without overriding hidden reports',()=>{
 const html=fs.readFileSync(new URL('../workforce/admin-timecard-records.html',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../workforce/monthly-report.css',import.meta.url),'utf8');
 assert.ok(html.indexOf('monthly-report.css?v=')>html.indexOf('app.css?v='));
 assert.match(css,/body\.monthly-report-page #monthly-report:not\(\[hidden\]\) > \.table-scroll/);assert.match(css,/display:block !important/);
 assert.doesNotMatch(css,/#monthly-report\[hidden\]|visibility:visible/);
});
test('monthly detail keeps all daily clock/break timestamps, empty dates and existing totals',()=>{
 const h=monthlyReportHarness(),report=sampleReport(),session=report.days[0].sessions[0];
 session.breaks.push({start:'2026-11-01T02:00:00.000Z',end:'2026-11-01T02:15:00.000Z'});session.breakMs+=900000;session.workedMs-=900000;report.days[0].breakMs+=900000;report.days[0].workedMs-=900000;
 h.exporter.setReport(report);const text=h.n('report-rows').children.map(tr=>tr.children.map(td=>td.textContent).join(' | ')).join('\n');
 for(const value of ['2026-11-01 09:00:00.000','2026-11-01 10:00:00.000','2026-11-01 10:30:00.000','2026-11-01 11:00:00.000','2026-11-01 11:15:00.000','2026-11-01 12:00:00.000','2026-11-01 14:00:00.000','2026-11-01 17:00:00.000','2026-11-03 11:00:00.123','2026-11-30'])assert.ok(text.includes(value),value);
 assert.match(h.n('report-summary').textContent,/実働合計 18:15:00.000/);assert.match(h.n('report-summary').textContent,/休憩合計 0:45:00.000/);assert.match(h.n('report-summary').textContent,/未退勤 1区間/);
});
