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
