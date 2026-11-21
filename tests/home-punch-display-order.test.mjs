/** Actual home display wiring + punch/journal/summary controllers with signed synthetic traffic. No real requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto,createHmac} from 'node:crypto';
const read=f=>fs.readFileSync(new URL('../workforce/'+f,import.meta.url),'utf8');
const mac=(d,q,order)=>createHmac('sha256',q.responseKey).update(order.map(k=>d[k]).join('\n')).digest('hex');
async function again(check){for(let i=0;i<20;i++){if(check())return;await new Promise(r=>setTimeout(r,1));}assert.ok(check());}
const day='2026-11-02',month=day.slice(0,7);
const journal=(worked=false)=>({month,days:Array.from({length:30},(_,i)=>{
 const current=i===1&&worked,done=current&&worked==='DONE';
 return {day:month+'-'+String(i+1).padStart(2,'0'),clockIn:current?day+'T00:00:00.000Z':'',clockOut:done?day+'T01:00:00.000Z':'',breakMs:0,workedMs:done?3600000:null,state:done?'COMPLETED':current?'WORKING':'NO_RECORD',plannedStart:'',plannedEnd:'',plannedBreakMinutes:null,plannedWorkedMs:null,excessMs:null};
})});
function harness(){
 const nodes=new Map(),handlers=new Map(),posted=[],pending=[],timers=new Map();let seq=0,proof='fake.jwt.one',now=Date.parse(day+'T02:00:00.000Z');
 const el=id=>({id,attributes:new Map(),events:new Map(),children:[],textContent:'',hidden:true,disabled:false,value:'',contentWindow:{},
  addEventListener(k,f){this.events.set(k,f);},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];},
  setAttribute(k,v){this.attributes.set(k,v);},getAttribute(k){return this.attributes.get(k);},remove(){},
  submit(){posted.push(Object.fromEntries(this.children.map(c=>[c.name,c.value])));}});
 const byId=id=>{if(!nodes.has(id))nodes.set(id,el(id));return nodes.get(id);};
 const click=(id,force=false)=>{const b=byId(id);if(force||!b.disabled)b.events.get('click')?.();};
 const window={confirm:()=>true,liff:{getIDToken:()=>proof},addEventListener(k,f){if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(f);}};window.top=window;
 function Clock(...args){return args.length?new Date(...args):new Date(now);}Object.assign(Clock,{now:()=>now,parse:Date.parse,UTC:Date.UTC});Clock.prototype=Date.prototype;
 const homeReads={request(q){return new Promise(resolve=>pending.push({q,resolve,cancelled:false}));},cancel(nonce){const r=pending.find(r=>r.q.nonce===nonce);if(r)r.cancelled=true;}};
 const context={window,crypto:webcrypto,Uint8Array,TextEncoder,Date:Clock,Intl,document:{getElementById:byId,currentScript:null,createElement:el,body:el('body')},
  GAS_URL:'https://script.google.com/fixture',homeReady:true,homePane:'employee',homeReads,console:{info(){}},
  autoReads:{invalidate(){},together(keys,allowed){if(allowed())for(const k of keys)click(({punch:'punch-check',today:'journal-check',daily:'daily-summary-check',monthly:'monthly-work-check'})[k]);}},
  setTimeout(f){timers.set(++seq,f);return seq;},clearTimeout(i){timers.delete(i);}};
 const load=code=>vm.runInNewContext(code,context);
 for(const file of ['punch.js','attendance-journal.js','daily-summary.js','monthly-work-summary.js'])load(read(file));
 for(const k of ['TlhPunch','TlhAttendanceJournal','TlhDailySummary','TlhMonthlyWorkSummary'])context[k]=window[k];
 for(const k of ['TlhDemoInvitation','TlhStaffEnrollment','TlhStaffMaintenance','TlhWorkState'])context[k]={init(){}};
 const index=read('index.html');load(index.slice(index.indexOf('    const homeJournal='),index.indexOf('    const bridgeSection =')));
 byId('journal-mode').value='self';
 const send=(r,data,fields)=>r.resolve({...data,mac:mac(data,r.q,fields)});
 function ready(r,state='OFF'){send(r,{type:'TLH_BRIDGE_PUNCH',action:r.q.action,nonce:r.q.nonce,code:'PUNCH_READY_'+state,revision:'1'.repeat(64)},['type','nonce','action','code','revision']);}
 function dayReply(r,fresh=false){send(r,{type:'TLH_BRIDGE_ATTENDANCE_JOURNAL',action:r.q.action,nonce:r.q.nonce,code:'JOURNAL_READY',journal:JSON.stringify(journal(fresh))},['type','nonce','action','code','journal']);}
 async function saveReply(q,code='PUNCH_CLOCK_IN_DONE'){const d={type:'TLH_BRIDGE_PUNCH',action:q.action,nonce:q.nonce,code,revision:''};d.mac=mac(d,q,['type','nonce','action','code','revision']);for(const cb of handlers.get('message'))await cb({origin:'null',data:d});}
 function summaryReply(r){
   const monthly=r.q.action==='bridgeGetMonthlyWorkSummary',name=monthly?'MONTHLY_WORK_SUMMARY':'DAILY_SUMMARY';
   const summary={...(monthly?{workMonth:month,completedDays:0}:{workDate:day}),completedShifts:0,grossMs:0,breakMs:0,workedMs:0,openState:'OFF'};
   send(r,{type:'TLH_BRIDGE_'+name,action:r.q.action,nonce:r.q.nonce,code:name+'_READY',summary:JSON.stringify(summary)},['type','nonce','action','code','summary']);
 }
 return {byId,click,pending,posted,timers,ready,dayReply,saveReply,summaryReply,setProof:v=>proof=v,dayLater:()=>now+=86400000,changeWorkplace:()=>{window.TlhCurrentWorkplace={locationMatches:()=>true,submit(f){f.submit();}};}};
}
for(const unknown of [false,true])test('deliberately late pre-punch reads do not overwrite '+(unknown?'unknown fixed retry':'pending and verified success'),async()=>{
 const h=harness(),n=h.byId;
 assert.equal(n('punch-in').hidden,true);
 h.click('punch-check');h.click('journal-check');h.click('daily-summary-check');h.click('monthly-work-check');
 const [oldState,oldDay,oldDaily,oldMonthly]=h.pending;h.ready(oldState);
 await again(()=>!n('punch-in').hidden);
 assert.equal(n('punch-in').disabled,false,'the current shift/card did not determine whether punch works');
 h.click('punch-in');const saved=h.posted[0];assert.equal(saved.action,'bridgeRecordPunch');
 assert.ok(oldDay.cancelled&&oldDaily.cancelled&&oldMonthly.cancelled);assert.equal(n('journal-check').disabled,true);
 assert.match(n('journal-status').textContent,/打刻の結果を確認中/);
 if(unknown){const timeout=[...h.timers.values()].at(-1);timeout();assert.match(n('punch-status').textContent,/結果を確認できません/);}
 h.dayReply(oldDay);h.ready(oldState);h.summaryReply(oldDaily);h.summaryReply(oldMonthly);
 await new Promise(r=>setImmediate(r));
 assert.equal(n('journal-cards').children.length,0);assert.match(n('journal-status').textContent,/打刻の結果を確認中/);
 assert.equal(n('daily-summary-result').hidden,true);assert.equal(n('monthly-work-result').hidden,true);
 h.click('journal-check',true);h.click('daily-summary-check',true);h.click('monthly-work-check',true);
 assert.equal(h.pending.length,4,'no new secondary read while pending or unknown');
 if(unknown){
  h.click('punch-retry');const retry=h.posted[1];
  assert.equal(retry.eventId,saved.eventId);assert.equal(retry.revision,saved.revision);
  await h.saveReply(saved);assert.equal(h.pending.length,4,'late old write frame cannot advance retry state');
  await h.saveReply(retry,'PUNCH_ALREADY_RECORDED');
 }else await h.saveReply(saved);
 const [freshState,freshDay]=h.pending.slice(4);assert.ok(freshState&&freshDay);
 h.ready(freshState,'WORKING');h.dayReply(freshDay,true);
 await again(()=>n('journal-cards').children.length===1&&!n('punch-out').hidden);
 h.dayReply(oldDay);assert.match(n('journal-cards').children[0].children[1].textContent,/未退勤/);
 assert.equal(n('journal-rows').children.length,0);
});

test('old authorized ready reply after login, day or store change never enables a button; fresh state still works',async()=>{
 for(const change of [h=>h.setProof('fake.jwt.two'),h=>h.dayLater(),h=>h.changeWorkplace()]){
  const h=harness(),n=h.byId;h.click('punch-check');const old=h.pending[0];change(h);h.ready(old);
  await again(()=>n('punch-check').disabled===false);
  assert.equal(n('punch-in').hidden,true);assert.match(n('punch-status').textContent,/確認し直して/);assert.equal(h.posted.length,0);
  h.click('punch-check');h.ready(h.pending[1]);await again(()=>n('punch-in').hidden===false);
 }
});

test('delayed Today from both normal startup and first post-punch refresh cannot repaint after the next punch',async()=>{
 const h=harness(),n=h.byId;
 h.click('punch-check');h.click('journal-check');
 const [initialState,initialDay]=h.pending;h.ready(initialState);await again(()=>n('punch-in').hidden===false);
 h.click('punch-in');await h.saveReply(h.posted[0]);
 const [postInState,postInDay]=h.pending.slice(2);h.dayReply(initialDay);
 h.ready(postInState,'WORKING');await again(()=>n('punch-out').hidden===false);
 assert.equal(n('journal-cards').children.length,0);
 h.click('punch-out');const exit=h.posted[1];assert.equal(exit.eventType,'CLOCK_OUT');assert.equal(postInDay.cancelled,true);
 h.dayReply(postInDay,true);await new Promise(r=>setImmediate(r));assert.equal(n('journal-cards').children.length,0);
 assert.match(n('journal-status').textContent,/打刻の結果を確認中/);
 await h.saveReply(exit,'PUNCH_CLOCK_OUT_DONE');
 const [postOutState,postOutDay]=h.pending.slice(4);
 h.ready(postOutState);h.dayReply(postOutDay,'DONE');
 await again(()=>n('journal-cards').children.length===1&&n('punch-out').hidden===true);
 assert.match(n('journal-cards').children[0].children[0].children[1].textContent,/退勤済み/);
});
