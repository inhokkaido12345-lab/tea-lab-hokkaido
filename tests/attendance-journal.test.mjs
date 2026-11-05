/** Actual journal UI with fake DOM and real WebCrypto. No accounts or external requests. */
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {webcrypto,createHmac} from 'node:crypto';
const source=fs.readFileSync(new URL('../workforce/attendance-journal.js',import.meta.url),'utf8');
function journal(){return {month:'2026-11',days:Array.from({length:30},(_,i)=>({day:'2026-11-'+String(i+1).padStart(2,'0'),clockIn:'',clockOut:'',breakMs:0,workedMs:null,state:'NO_RECORD',plannedStart:'',plannedEnd:'',plannedBreakMinutes:null,plannedWorkedMs:null,excessMs:null}))};}
function harness({cards=false,today=false,audience,intl=Intl}={}){
  const nodes=new Map(),handlers={},sent=[],timers=new Map();let id=0;
  function el(){return {value:'',textContent:'',hidden:false,disabled:false,children:[],events:{},contentWindow:{},
    appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];},addEventListener(k,fn){this.events[k]=fn;},remove(){},
    submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
  const n=k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k);};
  const window={addEventListener(k,fn){handlers[k]=fn;}};window.top=window;
  vm.runInNewContext(source,{window,crypto:webcrypto,Uint8Array,TextEncoder,Intl:intl,Date,
    document:{currentScript:null,getElementById:key=>n(key.replace('journal-','')),createElement:el,body:el()},
    setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(k){timers.delete(k);}});
  n('month').value='2026-11';n('mode').value=audience==='admin'?'admin':'self';const viewer=window.TlhAttendanceJournal.init({liff:{getIDToken:()=> 'fake.jwt.proof'},gasUrl:window.TlhAttendanceJournal.config.gasUrl,cards:cards?n('cards'):null,today,audience});
  async function reply(r,code='JOURNAL_READY',j=journal(),patch={},eventPatch={}){
    const data={type:'TLH_BRIDGE_ATTENDANCE_JOURNAL',nonce:r.nonce,action:r.action,code,journal:code==='JOURNAL_READY'?JSON.stringify(j):''};
    data.mac=createHmac('sha256',r.responseKey).update([data.type,data.nonce,data.action,data.code,data.journal].join('\n')).digest('hex');Object.assign(data,patch);
    await handlers.message({source:{parent:n('frame').contentWindow},origin:'null',data,...eventPatch});
  }
  return {n,sent,timers,handlers,window,viewer,reply,click:()=>n('check').events.click()};
}

test('role-specific journal rejects cross-role mode and locks admin reads until verified',()=>{
  const employee=harness({audience:'employee'});employee.n('mode').value='admin';employee.n('employee').value='EMP001';employee.click();assert.equal(employee.sent.length,0);
  const admin=harness({audience:'admin'});admin.n('employee').value='EMP001';admin.click();assert.equal(admin.sent.length,0);assert.equal(admin.n('check').disabled,true);
  admin.viewer.setAdminAllowed(true);admin.n('mode').value='self';admin.click();assert.equal(admin.sent.length,0);
  admin.n('mode').value='admin';admin.click();assert.equal(admin.sent[0].mode,'admin');assert.equal(admin.sent[0].employeeCode,'EMP001');
  admin.viewer.setAdminAllowed(false);assert.equal(admin.n('check').disabled,true);assert.equal(admin.n('table').hidden,true);
});
test('init sends nothing, explicit self read excludes other employee, nested signed reply renders all days',async()=>{
  const h=harness();assert.equal(h.sent.length,0);h.n('employee').value='OTHER';h.click();h.click();assert.equal(h.sent.length,1);
  assert.equal(h.sent[0].employeeCode,'');await h.reply(h.sent[0]);assert.equal(h.n('rows').children.length,30);assert.equal(h.n('table').hidden,false);
  assert.equal(h.timers.size,0);assert.equal(h.n('rows').children[0].children[1].textContent,'未打刻');
});
test('admin query explicitly includes employee and displayed target changes clear previous records',async()=>{
  const h=harness();h.n('mode').value='admin';h.n('employee').value='EMP001';h.n('mode').events.input();h.click();
  assert.equal(h.sent[0].mode,'admin');assert.equal(h.sent[0].employeeCode,'EMP001');await h.reply(h.sent[0]);
  h.n('employee').events.input();assert.equal(h.n('table').hidden,true);assert.equal(h.n('rows').children.length,0);
});
test('completed work renders JST clock times, actual/planned break and one hour planned-work excess',async()=>{
  const h=harness(),j=journal();Object.assign(j.days[0],{state:'COMPLETED',clockIn:'2026-11-01T00:00:00.000Z',clockOut:'2026-11-01T10:00:00.000Z',
    breakMs:3600000,workedMs:9*3600000,plannedStart:'2026-11-01T00:00:00.000Z',plannedEnd:'2026-11-01T09:00:00.000Z',plannedBreakMinutes:60,plannedWorkedMs:8*3600000,excessMs:3600000});
  h.click();await h.reply(h.sent[0],'JOURNAL_READY',j);const cells=h.n('rows').children[0].children.map(c=>c.textContent);
  assert.match(cells[2],/09:00/);assert.match(cells[3],/19:00/);assert.equal(cells[4],'1時間00分');
  assert.equal(cells[5],'9時間00分');assert.equal(cells[8],'60分');assert.equal(cells[9],'1時間00分');
});

test('a full month table and cards reuse only the formatter and preserve every JST timestamp',async()=>{
 let builds=0,formats=0;
 const intl={DateTimeFormat:function(...args){builds++;const formatter=new Intl.DateTimeFormat(...args);return {format(value){formats++;return formatter.format(value);}};}};
 const h=harness({cards:true,intl}),j=journal();assert.equal(builds,0);
 for(const row of j.days){const start=row.day+'T15:00:00.000Z',end=row.day+'T16:00:00.000Z';Object.assign(row,{state:'COMPLETED',clockIn:start,clockOut:end,workedMs:3600000,plannedStart:start,plannedEnd:end,plannedBreakMinutes:0,plannedWorkedMs:3600000,excessMs:0});}
 const expected=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 h.click();await h.reply(h.sent[0],'JOURNAL_READY',j);assert.equal(builds,1);assert.equal(formats,240);
 for(let i=0;i<30;i++){const cells=h.n('rows').children[i].children;assert.equal(cells[2].textContent,expected.format(new Date(j.days[i].clockIn)));assert.equal(cells[3].textContent,expected.format(new Date(j.days[i].clockOut)));assert.equal(cells[6].textContent,cells[2].textContent);assert.equal(cells[7].textContent,cells[3].textContent);}
 h.click();await h.reply(h.sent[1]);assert.equal(builds,1);assert.equal(h.n('rows').children[0].children[2].textContent,'—');
});
test('wrong source/origin, forged signature, nonce and modified journal never display records',async()=>{
  const h=harness();h.click();const r=h.sent[0];
  for(const [patch,eventPatch] of [[{mac:'0'.repeat(64)},{}],[{nonce:'0'.repeat(32)},{}],[{journal:'{}'},{}],
    [{},{source:{}}],[{},{origin:'https://fixture-script.googleusercontent.com.attacker.test'}]]){
    await h.reply(r,'JOURNAL_READY',journal(),patch,eventPatch);assert.equal(h.n('table').hidden,true);
  }
  await h.reply(r);assert.equal(h.n('table').hidden,false);
});
test('signed malformed month/date/negative time or inconsistent plan fails DTO parsing',()=>{
  const h=harness(),parse=h.window.TlhAttendanceJournal.parseJournal;
  assert.ok(parse(JSON.stringify(journal()),'2026-11'));
  for(const patch of [{day:'2026-11-31'},{workedMs:-1},{excessMs:0},{state:'<script>'},{clockIn:'not-a-date'},
    {plannedStart:'2026-11-01T00:00:00.000Z'}]){
    const j=journal();Object.assign(j.days[0],patch);assert.equal(parse(JSON.stringify(j),'2026-11'),null);
  }
  assert.equal(parse(JSON.stringify(journal()),'2026-10'),null);
});
test('timeout and departure clear records, late prior reply cannot fill another request, and no persisted secrets',async()=>{
  const h=harness();h.click();const old=h.sent[0];[...h.timers.values()][0]();h.click();await h.reply(old);assert.equal(h.n('table').hidden,true);
  await h.reply(h.sent[1]);assert.equal(h.n('table').hidden,false);h.handlers.pagehide();assert.equal(h.n('table').hidden,true);assert.equal(h.n('employee').value,'');
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\.|URLSearchParams/);
});
test('dedicated page has all controller fields, fixed connection matches current punch page and no automatic write',()=>{
  const h=harness(),html=fs.readFileSync(new URL('../workforce/timecard-records.html',import.meta.url),'utf8'),main=fs.readFileSync(new URL('../workforce/index.html',import.meta.url),'utf8');
  for(const key of ['month','mode','employee','target','check','status','table','caption','rows','frame','login'])assert.ok(html.includes('id="journal-'+key+'"'));
  assert.ok(main.includes('timecard-records.html'));assert.ok(main.includes(h.window.TlhAttendanceJournal.config.gasUrl));
  assert.match(html,/name="referrer" content="no-referrer"/);assert.doesNotMatch(source,/bridgeRecordPunch|bridgeRecoverySubmit|bridgeIssueStaffInvitation/);
});
test('cards show only signed validated records and clear old employee data at input change and departure',async()=>{
  const h=harness({cards:true}),j=journal();Object.assign(j.days[0],{state:'COMPLETED',clockIn:'2026-11-01T00:00:00.000Z',clockOut:'2026-11-01T01:00:00.000Z',workedMs:3600000});
  h.click();await h.reply(h.sent[0],'JOURNAL_READY',j,{mac:'0'.repeat(64)});assert.equal(h.n('cards').children.length,0);
  await h.reply(h.sent[0],'JOURNAL_READY',j);assert.equal(h.n('cards').children.length,3);
  const card=h.n('cards').children[2];assert.equal(card.children[0].children[0].textContent,'2026-11-01');assert.match(card.children[2].textContent,/1時間00分/);
  assert.equal(h.n('cards').children[0].children[2].children[1].textContent,'予定未設定あり');
  h.n('employee').events.input();assert.equal(h.n('cards').children.length,0);
  h.click();await h.reply(h.sent[1],'JOURNAL_READY',j);h.handlers.pagehide();assert.equal(h.n('cards').children.length,0);
});
test('home selects today at explicit read time and filters cards to the requested JST date without extra requests',async()=>{
  const h=harness({cards:true,today:true});assert.equal(h.sent.length,0);h.click();const r=h.sent[0];
  const [year,month]=r.month.split('-').map(Number),count=new Date(Date.UTC(year,month,0)).getUTCDate();
  const j={month:r.month,days:Array.from({length:count},(_,i)=>({...journal().days[0],day:r.month+'-'+String(i+1).padStart(2,'0')}))};
  await h.reply(r,'JOURNAL_READY',j);assert.equal(h.n('cards').children.length,1);assert.equal(h.sent.length,1);
  const expected=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  assert.equal(h.n('cards').children[0].children[0].children[0].textContent,expected);
});
test('detailed cards display both shifts and their breaks without presenting the middle gap as work',async()=>{
 const h=harness({cards:true}),j=journal(),sessions=[
  {clockIn:'2026-11-01T00:00:00.000Z',clockOut:'2026-11-01T03:00:00.000Z',breakMs:15*60000,workedMs:165*60000,breaks:[{start:'2026-11-01T01:00:00.000Z',end:'2026-11-01T01:15:00.000Z'}]},
  {clockIn:'2026-11-01T06:00:00.000Z',clockOut:'2026-11-01T10:00:00.000Z',breakMs:30*60000,workedMs:210*60000,breaks:[{start:'2026-11-01T07:00:00.000Z',end:'2026-11-01T07:30:00.000Z'}]}];
 Object.assign(j.days[0],{state:'COMPLETED',clockIn:sessions[0].clockIn,clockOut:sessions[1].clockOut,breakMs:45*60000,workedMs:375*60000,sessions});
 h.click();await h.reply(h.sent[0],'JOURNAL_READY',j);const card=h.n('cards').children[2];assert.match(card.children[1].textContent,/2回の勤務/);assert.match(card.children[2].textContent,/6時間15分/);assert.equal(card.children.at(-1).children.length,2);assert.match(card.children.at(-1).children[1].children[1].textContent,/15:00/);
 const bad=structuredClone(j);bad.days[0].sessions[1].clockIn='2026-11-01T02:00:00.000Z';assert.equal(h.window.TlhAttendanceJournal.parseJournal(JSON.stringify(bad),'2026-11'),null);
 const other=structuredClone(j);other.days[0].sessions[0].workedMs++;assert.equal(h.window.TlhAttendanceJournal.parseJournal(JSON.stringify(other),'2026-11'),null);
});
