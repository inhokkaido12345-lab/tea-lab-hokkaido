import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{scheduleUiHarness}from'./helpers/schedule-harness.mjs';
function shared(h){return{...h.snapshot(),phase:'PUBLISHED',publishedAt:'2026-11-04T18:30:00.000Z',plans:[{employeeCode:'SCH002',employeeName:'=架空社員',day:'2026-11-05',revision:1,periods:[{start:'23:00',end:'01:00',endNextDay:true,breakMinutes:15}],workIntervals:[{startAtUtc:'2026-11-05T14:00:00.000Z',endAtUtc:'2026-11-05T16:00:00.000Z'}],plannedMinutes:105,leaveType:'NONE',publicNote:'帰省,\n共有メモ',note:'PRIVATE_MARKER'}],events:[{day:'2026-11-05',title:'架空イベント',note:'全員へ共有'}]};}
const text=n=>n.textContent+' '+n.children.map(text).join(' ');

test('Sheet-cleared work remains unassigned in the calendar and printed/CSV hours are blank',async()=>{
 const h=scheduleUiHarness('admin'),s=shared(h);s.inputMode='SHEET';s.plans[0].periods=[];s.plans[0].workIntervals=[];s.plans[0].plannedMinutes=null;s.plans[0].publicNote='帰省';const r=h.window.TlhScheduleReport.build(s),row=r.rows.find(r=>r[1]==='SCH002');assert.equal(row[3],'予定未設定');assert.equal(row[4],'');assert.equal(row[5],'');assert.doesNotMatch(h.window.TlhScheduleReport.csv(r),/"null"/);await h.api.read();await h.reply(h.sent[0],s);assert.match(text(h.n('calendar')),/予定未設定/);assert.doesNotMatch(text(h.n('calendar')),/予定実働 null/);
});
test('second-half report contains only its days and identifies the exact range in CSV',()=>{
 const h=scheduleUiHarness(),s=shared(h);s.period='SECOND';s.plans[0].day='2026-11-20';const report=h.window.TlhScheduleReport.build(s);
 assert.equal(report.rows.length,15);assert.ok(report.rows[0][0].startsWith('2026-11-16'));assert.ok(report.rows.at(-1)[0].startsWith('2026-11-30'));assert.match(h.window.TlhScheduleReport.csv(report),/2026-11-16〜2026-11-30/);
});
test('PDF table and CSV include only complete shared plans, dates, public notes and release date; formula cells are escaped',async()=>{
 const h=scheduleUiHarness('admin'),s=shared(h),r=h.window.TlhScheduleReport.build(s),csv=h.window.TlhScheduleReport.csv(r);assert.equal(r.rows.length,30);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/23:00–01:00（翌日）/);assert.match(csv,/"'=架空社員"/);assert.match(csv,/帰省,/);assert.doesNotMatch(csv,/PRIVATE_MARKER/);assert.match(csv,/2026年11月5日/);
 await h.api.read();await h.reply(h.sent[0],s);assert.equal(h.n('print').disabled,false);assert.equal(h.n('report').hidden,true);assert.equal(h.n('report-rows').children.length,0);
 h.events.beforeprint();h.events.beforeprint();assert.equal(h.n('report').hidden,false);assert.equal(h.n('report-rows').children.length,2);assert.match(text(h.n('report-rows')),/全員へ共有/);assert.doesNotMatch(text(h.n('report-rows')),/PRIVATE_MARKER/);
 h.events.afterprint();assert.equal(h.n('report-rows').children.length,0);h.events.beforeprint();assert.equal(h.n('report-rows').children.length,2);
});
test('printing never writes or sends messages; unverified, unpublished, refresh and departure cannot export',async()=>{
 const h=scheduleUiHarness();let printed=0;h.window.print=()=>printed++;h.click('print');assert.equal(printed,0);await h.api.read();await h.reply(h.sent[0],h.snapshot());h.click('print');assert.equal(printed,0);
 await h.api.read();await h.reply(h.sent[1],shared(h));const before=h.sent.length;h.click('print');assert.equal(printed,1);assert.equal(h.sent.length,before);
 await h.api.read();h.click('print');h.events.beforeprint();assert.equal(printed,1);assert.equal(h.n('report').hidden,true);assert.equal(h.n('report-rows').children.length,0);await h.reply(h.sent[2],shared(h));h.events.pagehide();h.click('print');h.events.beforeprint();assert.equal(printed,1);assert.equal(h.n('csv').disabled,true);assert.equal(h.n('report-rows').children.length,0);
});
test('both pages use dedicated shared-only print section; private forms and screen calendar are excluded from print',()=>{
 const read=name=>fs.readFileSync(new URL('../workforce/'+name,import.meta.url),'utf8');for(const page of ['schedule.html']){const html=read(page);assert.match(html,/class="secondary-page schedule-page"/);assert.match(html,/id="schedule-report" class="schedule-print-only" hidden/);assert.match(html,/schedule-report.js/);}
 assert.doesNotMatch(read('admin-schedule.html'),/schedule-report-title|schedule-csv/);assert.match(read('schedule.css'),/\.schedule-page main>\*\{display:none!important\}/);assert.match(read('schedule.css'),/#schedule-report:not\(\[hidden\]\)/);assert.doesNotMatch(read('schedule-report.js'),/fetch\(|localStorage|sessionStorage|innerHTML|sendBeacon/);
});

function fakeCanvas(){
 let strokes=0;const fills=[],drawn=[],context={measureText:s=>({width:[...String(s)].length*7}),scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;},fillRect(){fills.push(this.fillStyle);},strokeRect(){},fillText(s){drawn.push(s);}};
 return{get strokes(){return strokes;},fills,drawn,width:0,height:0,getContext:()=>context,toBlob(done){done(new Blob(['fake png'],{type:'image/png'}));}};
}
test('PNG retains shared dates, shifts and wrapped notes without private fields or redundant prefix',()=>{
 const h=scheduleUiHarness(),s=shared(h),canvas=fakeCanvas();s.plans[0].publicNote='長い公開備考'.repeat(18);
 h.window.TlhScheduleReport.drawPng(canvas,h.window.TlhScheduleReport.build(s));
 assert.equal(canvas.width,2400);assert.ok(canvas.height>0);const output=canvas.drawn.join('');
 assert.match(output,/23–1（翌日）/);assert.match(output,/休15分/);assert.match(output,/架空イベント/);assert.match(output,/長い/);assert.doesNotMatch(output,/PRIVATE_MARKER|共有事項：/);
 const before=canvas.height;s.plans[0].publicNote='短い';h.window.TlhScheduleReport.drawPng(canvas,h.window.TlhScheduleReport.build(s));assert.ok(canvas.height<before);
});
test('PNG needs verified publication and performs no new communication',async()=>{
 const canvas=fakeCanvas(),h=scheduleUiHarness('employee',{createCanvas:()=>canvas});
 assert.equal(h.n('png').disabled,true);await h.click('png');assert.equal(canvas.width,0);
 await h.api.read();await h.reply(h.sent[0],shared(h));assert.equal(h.n('png').disabled,false);const count=h.sent.length;
 await h.click('png');assert.equal(h.sent.length,count);assert.match(h.n('export-status').textContent,/PNGの保存を開始/);assert.equal(canvas.width,0);assert.equal(h.n('png').disabled,false);
 h.events.pagehide();assert.equal(h.n('png').disabled,true);
});
test('refresh discards in-flight PNG and repeated clicks produce one conversion',async()=>{
 const canvas=fakeCanvas();let finish,calls=0;canvas.toBlob=done=>{calls++;finish=done;};
 const h=scheduleUiHarness('employee',{createCanvas:()=>canvas});await h.api.read();await h.reply(h.sent[0],shared(h));
 const task=h.click('png');await h.click('png');assert.equal(calls,1);
 await h.api.read();finish(new Blob(['png'],{type:'image/png'}));await task;
 assert.equal(h.n('png').disabled,true);assert.doesNotMatch(h.n('export-status').textContent,/PNGの保存を開始/);
});
test('oversized PNG refuses allocation instead of dropping rows',()=>{
 const h=scheduleUiHarness(),s=shared(h);s.plans=Array.from({length:300},(_,i)=>({...s.plans[0],employeeCode:'EMP'+i}));
 assert.throws(()=>h.window.TlhScheduleReport.drawPng(fakeCanvas(),h.window.TlhScheduleReport.build(s)),/PNG_TOO_LARGE/);
});

test('public off is diagonal only in visual outputs; leave, unknown days, public notes and CSV semantics survive',()=>{
 const h=scheduleUiHarness(),s=shared(h),original=s.plans[0];
 s.plans=[{...original,periods:[],workIntervals:[],plannedMinutes:0,leaveType:'PUBLIC_OFF',publicNote:'帰省'},
 {...original,day:'2026-11-06',periods:[],workIntervals:[],plannedMinutes:0,leaveType:'LEAVE',publicNote:''}];
 const before=JSON.stringify(s),report=h.window.TlhScheduleReport.build(s),canvas=fakeCanvas();
 h.window.TlhScheduleReport.renderMatrix(h.n('report-rows'),report.matrix);const descendants=n=>[n,...n.children.flatMap(descendants)];
 const nodes=descendants(h.n('report-rows')),svgs=nodes.filter(n=>n.tagName==='svg');assert.equal(svgs.length,1);assert.equal(svgs[0].attrs['aria-hidden'],'true');
 assert.equal(nodes.filter(n=>n.className==='matrix-off-label').length,1);assert.match(text(h.n('report-rows')),/帰省/);
 h.window.TlhScheduleReport.drawPng(canvas,report);assert.equal(canvas.strokes,1);assert.ok(canvas.drawn.includes('帰省'));assert.ok(canvas.drawn.includes('休暇'));assert.ok(!canvas.drawn.includes('公休'));
 assert.match(h.window.TlhScheduleReport.csv(report),/公休/);assert.equal(JSON.stringify(s),before);
});

test('PNG matches screen colors for headers, event row, off days, working days and unspecified dates',()=>{
 const h=scheduleUiHarness(),s=shared(h),base=s.plans[0];s.plans.push({...base,day:'2026-11-06',workIntervals:[],periods:[],plannedMinutes:0,leaveType:'PUBLIC_OFF',publicNote:'公休の備考'});
 const canvas=fakeCanvas();h.window.TlhScheduleReport.drawPng(canvas,h.window.TlhScheduleReport.build(s));
 for(const color of ['#E5EBE9','#FFF7DF','#EFF1EF','#FFFDFA','#F3EFE7'])assert.ok(canvas.fills.includes(color),color);
 assert.match(fs.readFileSync(new URL('../workforce/schedule.css',import.meta.url),'utf8'),/print-color-adjust:exact/);
 assert.equal(canvas.strokes,1);assert.ok(canvas.drawn.join('').includes('公休の備考'));
});
