/** D13 fake DOM/LINE, real HMAC verification; no online identities or employee records. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto, createHmac } from 'node:crypto';
function harness(){
  const sent=[],timers=new Map(),nodes=new Map(),handlers={};let seq=0,proof='fake.jwt.proof';
  const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'未確認',events:{},addEventListener(type,fn){this.events[type]=fn;}});return nodes.get(id);};
  const window={addEventListener(type,fn){handlers[type]=fn;}};window.top=window;
  const context={window,crypto:webcrypto,Uint8Array,TextEncoder,
    document:{getElementById:node,body:{appendChild(){}},createElement(){return {children:[],appendChild(n){this.children.push(n);},remove(){},
      submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}},
    setTimeout(fn){const n=++seq;timers.set(n,fn);return n;},clearTimeout(n){timers.delete(n);},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../workforce/work-state.js',import.meta.url),'utf8'),context);
  window.TlhWorkState.init({gasUrl:'https://script.google.com/fake',liff:{getIDToken:()=>proof}});
  const click=()=>node('work-state-check').events.click();
  async function reply(request,code,changes={},origin='null'){
    const data={type:'TLH_BRIDGE_WORK_STATE',action:'bridgeGetWorkState',nonce:request.nonce,code};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,code].join('\n')).digest('hex');
    Object.assign(data,changes);await handlers.message({origin,data});
  }
  return {node,window,sent,timers,click,reply,setProof(value){proof=value;}};
}
test('initial UI sends nothing, explicit request contains proof/envelope only and blocks repeated tap',()=>{
  const h=harness();assert.equal(h.sent.length,0);h.click();h.click();assert.equal(h.sent.length,1);
  assert.deepEqual(Object.keys(h.sent[0]).sort(),['action','idToken','nonce','responseKey']);
  assert.match(h.sent[0].nonce,/^[a-f0-9]{32}$/);assert.match(h.sent[0].responseKey,/^[a-f0-9]{64}$/);
  assert.equal(h.node('work-state-check').disabled,true);
});
test('signed states update plain text without adopting raw identity/name/timestamps from payload',async()=>{
  for(const [code,label] of [['WORK_STATE_OFF','勤務外'],['WORK_STATE_WORKING','勤務中'],['WORK_STATE_BREAK','休憩中']]){
    const h=harness();h.click();await h.reply(h.sent[0],code,{name:'Never display',employeeId:'private',occurredAt:'private'});
    assert.equal(h.node('work-state-status').textContent,label);assert.equal(h.node('work-state-check').disabled,false);
  }
});
test('bad MAC, wrong type/action/nonce/origin and non-string code never replace displayed state',async()=>{
  const h=harness();h.click();const r=h.sent[0];
  for(const change of [{mac:'0'.repeat(64)},{action:'bridgeStopStaffAccess'},{type:'TLH_BRIDGE_STAFF_ENROLLMENT'},
    {nonce:'0'.repeat(32)},{code:['WORK_STATE_OFF']},{code:'<script>unsafe</script>'}]){
    await h.reply(r,'WORK_STATE_OFF',change);assert.equal(h.node('work-state-status').textContent,'確認中です。');
  }
  await h.reply(r,'WORK_STATE_OFF',{},'https://attacker.example');assert.equal(h.node('work-state-status').textContent,'確認中です。');
  await h.reply(r,'WORK_STATE_OFF');assert.equal(h.node('work-state-status').textContent,'勤務外');
});
test('timeout hides previous state, retries with fresh nonce/key, delayed old reply is ignored',async()=>{
  const h=harness();h.click();await h.reply(h.sent[0],'WORK_STATE_WORKING');h.click();const old=h.sent[1];
  assert.equal(h.node('work-state-status').textContent,'確認中です。');[...h.timers.values()][0]();assert.equal(h.node('work-state-check').disabled,false);
  h.click();assert.notEqual(h.sent[2].nonce,old.nonce);assert.notEqual(h.sent[2].responseKey,old.responseKey);
  await h.reply(old,'WORK_STATE_WORKING');assert.equal(h.node('work-state-status').textContent,'確認中です。');
  await h.reply(h.sent[2],'WORK_STATE_EMPLOYEE_REQUIRED');assert.equal(h.node('work-state-status').textContent,'有効な従業員登録がありません。');
});
test('quarantine, schema problems, raw-history inconsistencies and unsupported corrections disable queries',async()=>{
  for(const code of ['WRITE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_CORRECTIONS_PENDING']){
    const h=harness();h.click();await h.reply(h.sent[0],code);assert.equal(h.node('work-state-check').disabled,true);h.click();assert.equal(h.sent.length,1);
  }
});
test('account/employee/role refusals and transient failures never auto-register, auto-punch or retry',async()=>{
  for(const code of ['WORK_STATE_ACCOUNT_REQUIRED','WORK_STATE_ACCOUNT_UNAVAILABLE','WORK_STATE_EMPLOYEE_REQUIRED',
    'WORK_STATE_ROLE_REQUIRED','WORK_STATE_NOT_STARTED','WORK_STATE_BUSY','WORK_STATE_UNAVAILABLE','LINE_VERIFY_REJECTED','INVALID_REQUEST']){
    const h=harness();h.click();await h.reply(h.sent[0],code);assert.equal(h.sent.length,1);
    assert.equal(h.node('work-state-check').disabled,false);assert.notEqual(h.node('work-state-status').textContent,'勤務外');
  }
});
test('embedded page or absent proof cannot start a request',()=>{
  const embedded=harness();embedded.window.top={};embedded.click();assert.equal(embedded.sent.length,0);
  const noProof=harness();noProof.setProof(null);noProof.click();assert.equal(noProof.sent.length,0);
});
