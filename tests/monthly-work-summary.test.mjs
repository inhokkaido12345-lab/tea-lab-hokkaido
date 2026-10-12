/** D16 fake DOM/LINE, actual daily duration helper and HMAC. No real records. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto, createHmac } from 'node:crypto';
const normal={workMonth:'2026-10',completedDays:1,completedShifts:2,grossMs:3601234,breakMs:60000,workedMs:3541234,openState:'OFF'};
function harness(){
  const sent=[],timers=new Map(),nodes=new Map(),handlers={};let seq=0,proof='fake.jwt.proof';
  const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:true,textContent:'未確認',events:{},addEventListener(type,fn){this.events[type]=fn;}});return nodes.get(id);};
  const window={addEventListener(type,fn){handlers[type]=fn;}};window.top=window;
  const context={window,crypto:webcrypto,Uint8Array,TextEncoder,Date,
    document:{getElementById:node,body:{appendChild(){}},createElement(){return {children:[],appendChild(n){this.children.push(n);},remove(){},
      submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}},
    setTimeout(fn){const n=++seq;timers.set(n,fn);return n;},clearTimeout(n){timers.delete(n);},
  };
  for(const file of ['daily-summary.js','monthly-work-summary.js'])vm.runInNewContext(fs.readFileSync(new URL('../workforce/'+file,import.meta.url),'utf8'),context);
  window.TlhMonthlyWorkSummary.init({gasUrl:'https://script.google.com/fake',liff:{getIDToken:()=>proof}});
  async function reply(request,code='MONTHLY_WORK_SUMMARY_READY',summary=JSON.stringify(normal),changes={},origin='null'){
    const data={type:'TLH_BRIDGE_MONTHLY_WORK_SUMMARY',action:'bridgeGetMonthlyWorkSummary',nonce:request.nonce,code,summary};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,code,summary].join('\n')).digest('hex');
    Object.assign(data,changes);await handlers.message({origin,data});
  }
  return {node,window,sent,timers,reply,click:()=>node('monthly-work-check').events.click(),setProof(value){proof=value;}};
}
test('no automatic request; explicit self request only proof/envelope and repeated taps blocked',()=>{
  const h=harness();assert.equal(h.sent.length,0);h.click();h.click();assert.equal(h.sent.length,1);assert.equal(h.node('monthly-work-check').disabled,true);
  assert.deepEqual(Object.keys(h.sent[0]).sort(),['action','idToken','nonce','responseKey']);
});
test('signed month, unique days, shift count and exact durations use text only',async()=>{
  const h=harness();h.click();await h.reply(h.sent[0],undefined,undefined,{name:'private',employeeId:'private'});
  assert.equal(h.node('monthly-work-month').textContent,'2026-10');assert.equal(h.node('monthly-work-days').textContent,'1日');assert.equal(h.node('monthly-work-count').textContent,'2回');
  assert.equal(h.node('monthly-work-gross').textContent,'1時間 0分 1.234秒');assert.equal(h.node('monthly-work-worked').textContent,'0時間 59分 1.234秒');
  assert.equal(h.node('monthly-work-result').hidden,false);
});
test('zero days/shifts explicit and unfinished work/break warned, never estimated',async()=>{
  for(const openState of ['OFF','WORKING','BREAK']){const h=harness();h.click();await h.reply(h.sent[0],'MONTHLY_WORK_SUMMARY_READY',JSON.stringify({...normal,
    completedDays:0,completedShifts:0,grossMs:0,breakMs:0,workedMs:0,openState}));assert.equal(h.node('monthly-work-days').textContent,'0日');
    assert.equal(h.node('monthly-work-worked').textContent,'0時間 0分 0秒');assert.match(h.node('monthly-work-open').textContent,openState==='OFF'?/未終了の勤務はありません/:/未終了の勤務があります/);assert.equal(h.sent.length,1);}
});
test('tampered month/day/total, wrong MAC/type/action/nonce/origin ignored',async()=>{
  const h=harness();h.click();const r=h.sent[0];
  for(const change of [{summary:JSON.stringify({...normal,completedDays:2})},{mac:'0'.repeat(64)},{action:'bridgeGetDailySummary'},
    {type:'TLH_BRIDGE_DAILY_SUMMARY'},{nonce:'0'.repeat(32)},{code:['MONTHLY_WORK_SUMMARY_READY']}]){
    await h.reply(r,undefined,undefined,change);assert.equal(h.node('monthly-work-status').textContent,'確認中です。');assert.equal(h.node('monthly-work-result').hidden,true);}
  await h.reply(r,undefined,undefined,{},'https://attacker.example');assert.equal(h.node('monthly-work-status').textContent,'確認中です。');
  await h.reply(r);assert.equal(h.node('monthly-work-result').hidden,false);
});
test('even signed invalid month/day-count/types/ranges/arithmetic rejected, leap/short month bounds checked',async()=>{
  for(const change of [{workMonth:'2026-13'},{workMonth:'2026-00'},{workMonth:202610},{workMonth:'2026-1'},
    {completedDays:-1},{completedDays:0},{completedDays:3},{completedShifts:2501},{grossMs:'3601234'},{breakMs:-1},
    {workedMs:3.5},{workedMs:Number.MAX_SAFE_INTEGER+1},{openState:'UNKNOWN'},{employeeId:'private'},
    {workMonth:'2025-02',completedDays:29,completedShifts:29},{workMonth:'2024-02',completedDays:30,completedShifts:30},
    {workMonth:'2026-04',completedDays:31,completedShifts:31}]){const h=harness();h.click();await h.reply(h.sent[0],'MONTHLY_WORK_SUMMARY_READY',JSON.stringify({...normal,...change}));assert.equal(h.node('monthly-work-result').hidden,true);}
  const leap=harness();leap.click();await leap.reply(leap.sent[0],'MONTHLY_WORK_SUMMARY_READY',JSON.stringify({...normal,workMonth:'2024-02',completedDays:29,completedShifts:29}));assert.equal(leap.node('monthly-work-result').hidden,false);
  for(const text of ['null','[]','{}','x'.repeat(513),'not json']){const h=harness();h.click();await h.reply(h.sent[0],'MONTHLY_WORK_SUMMARY_READY',text);assert.equal(h.node('monthly-work-result').hidden,true);}
});
test('fresh query clears old totals; timeout/retry/delayed response and refusal never preserve stale personal data',async()=>{
  const h=harness();h.click();await h.reply(h.sent[0]);h.click();const old=h.sent[1];assert.equal(h.node('monthly-work-result').hidden,true);assert.equal(h.node('monthly-work-month').textContent,'');
  [...h.timers.values()][0]();h.click();assert.notEqual(h.sent[2].nonce,old.nonce);assert.notEqual(h.sent[2].responseKey,old.responseKey);await h.reply(old);
  assert.equal(h.node('monthly-work-result').hidden,true);await h.reply(h.sent[2],'WORK_STATE_EMPLOYEE_REQUIRED','');
  assert.equal(h.node('monthly-work-status').textContent,'有効な従業員登録がありません。');assert.equal(h.node('monthly-work-worked').textContent,'');
});
test('quarantine/raw/correction/schema errors disable query; refusal cannot carry an aggregate',async()=>{
  for(const code of ['WRITE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_CORRECTIONS_PENDING']){const h=harness();h.click();
    await h.reply(h.sent[0],code);assert.equal(h.node('monthly-work-status').textContent,'確認中です。');await h.reply(h.sent[0],code,'');
    assert.equal(h.node('monthly-work-check').disabled,true);h.click();assert.equal(h.sent.length,1);}
});
test('fixed refusals never auto-register/punch/retry; embedded or missing-proof pages cannot query',async()=>{
  for(const code of ['WORK_STATE_ACCOUNT_REQUIRED','WORK_STATE_ACCOUNT_UNAVAILABLE','WORK_STATE_EMPLOYEE_REQUIRED','WORK_STATE_ROLE_REQUIRED',
    'WORK_STATE_NOT_STARTED','WORK_STATE_BUSY','MONTHLY_WORK_SUMMARY_UNAVAILABLE','LINE_VERIFY_REJECTED','INVALID_REQUEST']){const h=harness();h.click();await h.reply(h.sent[0],code,'');
    assert.equal(h.sent.length,1);assert.equal(h.node('monthly-work-check').disabled,false);}
  const embedded=harness();embedded.window.top={};embedded.click();assert.equal(embedded.sent.length,0);
  const noProof=harness();noProof.setProof(null);noProof.click();assert.equal(noProof.sent.length,0);
});
