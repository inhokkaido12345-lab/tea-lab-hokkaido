/** D15 fake DOM/LINE, real HMAC. No online personnel or punch data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto, createHmac } from 'node:crypto';
const normal={workDate:'2026-10-12',completedShifts:1,grossMs:3601234,breakMs:60000,workedMs:3541234,openState:'OFF'};
function harness(){
  const sent=[],timers=new Map(),nodes=new Map(),handlers={};let seq=0,proof='fake.jwt.proof';
  const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:true,textContent:'未確認',events:{},addEventListener(type,fn){this.events[type]=fn;}});return nodes.get(id);};
  const window={addEventListener(type,fn){handlers[type]=fn;}};window.top=window;
  const context={window,crypto:webcrypto,Uint8Array,TextEncoder,Date,
    document:{getElementById:node,body:{appendChild(){}},createElement(){return {children:[],appendChild(n){this.children.push(n);},remove(){},
      submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}},
    setTimeout(fn){const n=++seq;timers.set(n,fn);return n;},clearTimeout(n){timers.delete(n);},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../workforce/daily-summary.js',import.meta.url),'utf8'),context);
  window.TlhDailySummary.init({gasUrl:'https://script.google.com/fake',liff:{getIDToken:()=>proof}});
  async function reply(request,code='DAILY_SUMMARY_READY',summary=JSON.stringify(normal),changes={},origin='null'){
    const data={type:'TLH_BRIDGE_DAILY_SUMMARY',action:'bridgeGetDailySummary',nonce:request.nonce,code,summary};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,code,summary].join('\n')).digest('hex');
    Object.assign(data,changes);await handlers.message({origin,data});
  }
  return {node,window,sent,timers,reply,click:()=>node('daily-summary-check').events.click(),setProof(value){proof=value;}};
}
test('initial UI sends nothing; explicit self request contains only proof and envelope, repeated taps blocked',()=>{
  const h=harness();assert.equal(h.sent.length,0);h.click();h.click();assert.equal(h.sent.length,1);
  assert.deepEqual(Object.keys(h.sent[0]).sort(),['action','idToken','nonce','responseKey']);assert.equal(h.node('daily-summary-check').disabled,true);
});
test('verified totals display exact duration and date, with no identity/raw fields',async()=>{
  const h=harness();h.click();await h.reply(h.sent[0],undefined,undefined,{name:'private',employeeId:'private'});
  assert.equal(h.node('daily-summary-date').textContent,'2026-10-12');assert.equal(h.node('daily-summary-count').textContent,'1回');
  assert.equal(h.node('daily-summary-gross').textContent,'1時間 0分 1.234秒');assert.equal(h.node('daily-summary-worked').textContent,'0時間 59分 1.234秒');
  assert.equal(h.node('daily-summary-result').hidden,false);assert.equal(h.node('daily-summary-check').disabled,false);
});
test('zero is explicit; unfinished work/break is warned about and never added by browser time',async()=>{
  for(const state of ['OFF','WORKING','BREAK']){
    const h=harness();h.click();await h.reply(h.sent[0],'DAILY_SUMMARY_READY',JSON.stringify({...normal,completedShifts:0,grossMs:0,breakMs:0,workedMs:0,openState:state}));
    assert.equal(h.node('daily-summary-count').textContent,'0回');assert.equal(h.node('daily-summary-worked').textContent,'0時間 0分 0秒');
    assert.match(h.node('daily-summary-open').textContent,state==='OFF'?/未終了の勤務はありません/:/未終了の勤務があります/);assert.equal(h.sent.length,1);
  }
});
test('bad MAC or tampered totals/type/action/nonce/origin never display data',async()=>{
  const h=harness();h.click();const r=h.sent[0];
  for(const change of [{summary:JSON.stringify({...normal,workedMs:1})},{mac:'0'.repeat(64)},{action:'bridgeRecordPunch'},
    {type:'TLH_BRIDGE_PUNCH'},{nonce:'0'.repeat(32)},{code:['DAILY_SUMMARY_READY']}]){
    await h.reply(r,undefined,undefined,change);assert.equal(h.node('daily-summary-status').textContent,'確認中です。');assert.equal(h.node('daily-summary-result').hidden,true);
  }
  await h.reply(r,undefined,undefined,{},'https://attacker.example');assert.equal(h.node('daily-summary-status').textContent,'確認中です。');
  await h.reply(r);assert.equal(h.node('daily-summary-result').hidden,false);
});
test('signed malformed payloads also rejected: invalid dates/types/ranges/arithmetic/states/extra keys',async()=>{
  const changes=[{workDate:'2026-02-30'},{workDate:20261012},{completedShifts:-1},{completedShifts:2501},{completedShifts:0},
    {grossMs:'3601234'},{breakMs:-1},{workedMs:3.5},{workedMs:Number.MAX_SAFE_INTEGER+1},{openState:'UNKNOWN'},{employeeId:'private'},
    {breakMs:normal.grossMs+1,workedMs:-1}];
  for(const change of changes){const h=harness();h.click();await h.reply(h.sent[0],'DAILY_SUMMARY_READY',JSON.stringify({...normal,...change}));
    assert.equal(h.node('daily-summary-status').textContent,'確認中です。');assert.equal(h.node('daily-summary-result').hidden,true);}
  for(const text of ['null','[]','{}','x'.repeat(513),'not json']){const h=harness();h.click();await h.reply(h.sent[0],'DAILY_SUMMARY_READY',text);assert.equal(h.node('daily-summary-result').hidden,true);}
});
test('fresh query clears stale totals; timeout/old reply/refusal cannot leave former personal totals',async()=>{
  const h=harness();h.click();await h.reply(h.sent[0]);h.click();const old=h.sent[1];assert.equal(h.node('daily-summary-result').hidden,true);
  assert.equal(h.node('daily-summary-date').textContent,'');[...h.timers.values()][0]();assert.equal(h.node('daily-summary-check').disabled,false);
  h.click();assert.notEqual(h.sent[2].nonce,old.nonce);assert.notEqual(h.sent[2].responseKey,old.responseKey);await h.reply(old);
  assert.equal(h.node('daily-summary-result').hidden,true);await h.reply(h.sent[2],'WORK_STATE_EMPLOYEE_REQUIRED','');
  assert.equal(h.node('daily-summary-status').textContent,'有効な従業員登録がありません。');assert.equal(h.node('daily-summary-date').textContent,'');
});
test('quarantine/raw/correction/schema errors disable queries; failure cannot carry an aggregate',async()=>{
  for(const code of ['WRITE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_CORRECTIONS_PENDING']){
    const h=harness();h.click();await h.reply(h.sent[0],code);assert.equal(h.node('daily-summary-status').textContent,'確認中です。');
    await h.reply(h.sent[0],code,'');assert.equal(h.node('daily-summary-check').disabled,true);h.click();assert.equal(h.sent.length,1);
  }
});
test('other fixed refusals never auto-register/punch/retry; embedded or missing-proof page cannot query',async()=>{
  for(const code of ['WORK_STATE_ACCOUNT_REQUIRED','WORK_STATE_ACCOUNT_UNAVAILABLE','WORK_STATE_EMPLOYEE_REQUIRED','WORK_STATE_ROLE_REQUIRED',
    'WORK_STATE_NOT_STARTED','WORK_STATE_BUSY','DAILY_SUMMARY_UNAVAILABLE','LINE_VERIFY_REJECTED','INVALID_REQUEST']){
    const h=harness();h.click();await h.reply(h.sent[0],code,'');assert.equal(h.sent.length,1);assert.equal(h.node('daily-summary-check').disabled,false);
  }
  const embedded=harness();embedded.window.top={};embedded.click();assert.equal(embedded.sent.length,0);
  const noProof=harness();noProof.setProof(null);noProof.click();assert.equal(noProof.sent.length,0);
});
