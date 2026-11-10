/** Headless print regression using the actual HTML/CSS/controllers and fictitious records only.
 * No app server, real LINE session, employee data or internet access. Requires development-only Playwright.
 * Run: node qa/verify-monthly-report-print.mjs (see workforce/README.md for bundled module/executable options).
 * Removing this test loses browser cascade/PDF coverage: text-model tests alone cannot detect hidden tables.
 */
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
import {sampleReport} from '../tests/helpers/monthly-report-harness.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const {chromium}=require(process.env.TLH_PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.TLH_REPORT_OUTPUT_DIR||path.join(root,'.sandbox-work/monthly-report-print'));await fs.mkdir(out,{recursive:true});
const report=sampleReport(),s=report.days[0].sessions[0];s.breaks.push({start:'2026-11-01T02:00:00.000Z',end:'2026-11-01T02:15:00.000Z'});s.breakMs+=900000;s.workedMs-=900000;report.days[0].breakMs+=900000;report.days[0].workedMs-=900000;
let html=await fs.readFile(path.join(root,'workforce/admin-timecard-records.html'),'utf8');
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/href="([^"#]+\.css)(?:\?[^" ]*)?"/g,(_m,p)=>'href="'+pathToFileURL(path.join(root,'workforce',p)).href+'"');
for(const file of ['monthly-report.js','attendance-journal.js'])html=html.replace('</body>','<script>'+await fs.readFile(path.join(root,'workforce',file),'utf8')+'</script></body>');
html=html.replace('</body>','<script>window.TlhMonthlyReport.init().setReport('+JSON.stringify(report)+');</script></body>');
const input=path.join(out,'fixture.html');await fs.writeFile(input,html);
const browser=await chromium.launch({headless:true,...(process.env.TLH_CHROME_EXECUTABLE?{executablePath:process.env.TLH_CHROME_EXECUTABLE}:{}),args:['--allow-file-access-from-files']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 await page.goto(pathToFileURL(input).href);await page.evaluate(()=>document.fonts.ready);
 await page.emulateMedia({media:'print'});
 await page.evaluate(()=>document.querySelector('link[href*="monthly-report.css"]').disabled=true);
 assert.equal(await page.locator('#monthly-report .table-scroll').isVisible(),false,'Reproduce old PDF: summary visible but detail hidden');
 await page.evaluate(()=>document.querySelector('link[href*="monthly-report.css"]').disabled=false);
 await page.locator('#monthly-report .table-scroll').waitFor({state:'visible'});
 assert.equal(await page.locator('#report-rows tr').count(),31);
 const text=await page.locator('#report-rows').innerText();
 for(const value of ['2026-11-01 09:00:00.000','2026-11-01 10:00:00.000','2026-11-01 10:30:00.000','2026-11-01 11:00:00.000','2026-11-01 11:15:00.000','2026-11-01 14:00:00.000','2026-11-01 17:00:00.000','2026-11-03 11:00:00.123','2026-11-30'])assert.ok(text.includes(value),value);
 await page.pdf({path:path.join(out,'monthly-attendance-details-sample.pdf'),printBackground:true,preferCSSPageSize:true});
 await page.screenshot({path:path.join(out,'print-layout.png'),fullPage:true});
 for(const width of [390,1280]){await page.emulateMedia({media:'screen'});await page.setViewportSize({width,height:900});assert.equal(await page.locator('#monthly-report .table-scroll').isVisible(),true);}
 await page.emulateMedia({media:'print'});await page.evaluate(()=>document.getElementById('monthly-report').hidden=true);assert.equal(await page.locator('#monthly-report').isVisible(),false,'Hidden/unverified report must stay hidden in print');
 await fs.writeFile(path.join(out,'verified.json'),JSON.stringify({fixture:'FAKE_EMPLOYEE_ONLY',oldBugReproduced:true,detailedRows:31,screenWidths:[390,1280],printDetailsVisible:true,hiddenReportRemainsHidden:true,network:'FILE_ONLY',pdf:path.join(out,'monthly-attendance-details-sample.pdf')},null,2));
 console.log(JSON.stringify({code:'MONTHLY_REPORT_PRINT_VERIFIED',rows:31,pdf:path.join(out,'monthly-attendance-details-sample.pdf')}));
}finally{await browser.close();}
