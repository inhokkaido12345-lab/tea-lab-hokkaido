/** D12 fake DOM, actual WebCrypto. No network, live identity or real employee information. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
function harness(){
  const handlers={},timers=new Map(),sent=[],nodes=new Map();let seq=0;
  function node(id){
    if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,disabled:false,events:{},
      addEventListener(type,fn){this.events[type]=fn;},reportValidity(){return true;}});
    return nodes.get(id);
  }
  const window={confirm:()=>true,addEventListener(type,fn){handlers[type]=fn;}};window.top=window;
  const context={window,crypto:webcrypto,Uint8Array,TextEncoder,
    document:{getElementById:node,body:{appendChild(){}},createElement(){return {children:[],appendChild(n){this.children.push(n);},
      remove(){},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}},
    setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../workforce/staff-maintenance.js',import.meta.url),'utf8'),context);
  window.TlhStaffMaintenance.init({gasUrl:'https://script.google.com/fake',liff:{getIDToken:()=> 'fake.jwt.proof'}});
  node('maintenance-code').value='EMP012';node('maintenance-old-name').value='Test Staff';node('maintenance-old-date').value='';
  const submit=id=>node(id).events.submit({preventDefault(){}}),click=id=>node(id).events.click();
  async function reply(request,code,revision='',changes={},origin='null'){
    const data={type:'TLH_BRIDGE_STAFF_MAINTENANCE',nonce:request.nonce,action:request.action,code,revision};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,code,revision].join('\n')).digest('hex');
    Object.assign(data,changes);await handlers.message({origin,data});
  }
  async function review(code='STAFF_REVIEW_INVITED'){submit('maintenance-target-form');await reply(sent.at(-1),code,'b'.repeat(64));}
  return {node,sent,timers,window,submit,click,reply,review};
}
test('initialization does not send requests, write buttons unavailable until authenticated review',async()=>{
  const h=harness();assert.equal(h.sent.length,0);assert.equal(h.node('maintenance-stop').disabled,true);
  h.click('maintenance-stop');h.submit('maintenance-correct-form');assert.equal(h.sent.length,0);
  h.submit('maintenance-target-form');const r=h.sent[0];
  await h.reply(r,'STAFF_REVIEW_INVITED','b'.repeat(64),{revision:'c'.repeat(64)});
  await h.reply(r,'STAFF_REVIEW_INVITED','b'.repeat(64),{},'https://attacker.example');
  assert.equal(h.node('maintenance-stop').disabled,true);
  await h.reply(r,'STAFF_REVIEW_INVITED','b'.repeat(64));assert.equal(h.node('maintenance-stop').disabled,false);
  assert.equal(h.node('maintenance-new-name').value,'Test Staff');assert.equal(h.node('maintenance-target-fields').disabled,true);
});
test('strict code/revision types and HMAC are required; valid INACTIVE preview never opens write controls',async()=>{
  const h=harness();h.submit('maintenance-target-form');const r=h.sent[0];
  for(const changes of [{code:['STAFF_REVIEW_INVITED']},{revision:['b'.repeat(64)]},{mac:'0'.repeat(64)}]){
    await h.reply(r,'STAFF_REVIEW_INVITED','b'.repeat(64),changes);assert.equal(h.node('maintenance-stop').disabled,true);
  }
  await h.reply(r,'STAFF_REVIEW_INVITED','');assert.equal(h.node('maintenance-stop').disabled,true);
  await h.reply(r,'STAFF_REVIEW_INACTIVE','b'.repeat(64));assert.equal(h.node('maintenance-stop').disabled,true);
  assert.equal(h.node('maintenance-reviewed').hidden,true);h.click('maintenance-reset');assert.equal(h.node('maintenance-check').disabled,false);
});
test('correct operation sends snapshot, exact new fields and random operation ID; double submit prevented',async()=>{
  const h=harness();await h.review();h.node('maintenance-new-name').value='Corrected Staff';h.node('maintenance-new-date').value='2026-10-01';
  h.submit('maintenance-correct-form');h.submit('maintenance-correct-form');h.click('maintenance-stop');assert.equal(h.sent.length,2);
  const r=h.sent[1];assert.equal(r.expectedName,'Test Staff');assert.equal(r.name,'Corrected Staff');assert.equal(r.hireDate,'2026-10-01');
  assert.equal(r.revision,'b'.repeat(64));assert.match(r.operationId,/^[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(r).sort(),['action','employeeCode','expectedHireDate','expectedName','hireDate','idToken','name','nonce','operationId','responseKey','revision']);
  await h.reply(r,'STAFF_DETAILS_CORRECTED');assert.equal(h.node('maintenance-reviewed').hidden,true);
  assert.equal(h.node('maintenance-target-fields').disabled,false);assert.equal(h.node('maintenance-stop').disabled,true);
});
test('unknown write outcome locks same immutable operation and retries ID even if inputs change',async()=>{
  const h=harness();await h.review('STAFF_REVIEW_ACTIVE');h.node('maintenance-new-name').value='Corrected Staff';
  h.submit('maintenance-correct-form');const r=h.sent[1];[...h.timers.values()][0]();
  assert.equal(h.node('maintenance-reset').disabled,true);assert.equal(h.node('maintenance-stop').disabled,true);
  h.click('maintenance-reset');h.node('maintenance-new-name').value='Other Person';h.submit('maintenance-correct-form');
  assert.equal(h.sent[2].operationId,r.operationId);assert.equal(h.sent[2].name,r.name);assert.equal(h.sent[2].revision,r.revision);
  await h.reply(r,'STAFF_DETAILS_CORRECTED');assert.equal(h.node('maintenance-reset').disabled,true);
  await h.reply(h.sent[2],'STAFF_OPERATION_ALREADY_DONE');assert.equal(h.node('maintenance-reset').disabled,false);
});
test('stop requires confirmation, no new identity/name/date fields, ambiguity keeps same stop operation',async()=>{
  const h=harness();await h.review();h.window.confirm=()=>false;h.click('maintenance-stop');assert.equal(h.sent.length,1);
  h.window.confirm=()=>true;h.click('maintenance-stop');const r=h.sent[1];assert.equal(r.action,'bridgeStopStaffAccess');
  assert.equal(Object.hasOwn(r,'name'),false);assert.equal(Object.hasOwn(r,'hireDate'),false);
  await h.reply(r,'MAINTENANCE_UNAVAILABLE');h.click('maintenance-stop');assert.equal(h.sent[2].operationId,r.operationId);
  await h.reply(h.sent[2],'STAFF_ACCESS_STOPPED');assert.equal(h.node('maintenance-reviewed').hidden,true);
});
test('quarantine, missing headers and ambiguous provenance block writes; stale revision requires recheck',async()=>{
  for(const code of ['WRITE_REVIEW_REQUIRED','STAFF_STORAGE_NOT_READY','STAFF_MAINTENANCE_REVIEW']){
    const h=harness();await h.review();h.click('maintenance-stop');await h.reply(h.sent[1],code);
    assert.equal(h.node('maintenance-check').disabled,true);assert.equal(h.node('maintenance-stop').disabled,true);
  }
  for(const code of ['STAFF_TARGET_CHANGED','WRITE_UNAVAILABLE','TLH_ADMIN_REQUIRED']){
    const h=harness();await h.review();h.click('maintenance-stop');await h.reply(h.sent[1],code);
    assert.equal(h.node('maintenance-check').disabled,false);assert.equal(h.node('maintenance-stop').disabled,true);
  }
});
test('read timeout can retry check; reset cannot change target during a request; embedded page cannot send',async()=>{
  const h=harness();h.submit('maintenance-target-form');h.click('maintenance-reset');assert.equal(h.node('maintenance-target-fields').disabled,true);
  [...h.timers.values()][0]();assert.equal(h.node('maintenance-target-fields').disabled,false);
  h.submit('maintenance-target-form');await h.reply(h.sent[0],'STAFF_REVIEW_INVITED','b'.repeat(64));
  assert.equal(h.node('maintenance-stop').disabled,true);await h.reply(h.sent[1],'STAFF_REVIEW_INVITED','b'.repeat(64));
  h.click('maintenance-reset');assert.equal(h.node('maintenance-reviewed').hidden,true);
  const embedded=harness();embedded.window.top={};embedded.submit('maintenance-target-form');assert.equal(embedded.sent.length,0);
});
test('cancelled correction has no effect or request, no-op response permits selecting another target',async()=>{
  const h=harness();await h.review();h.window.confirm=()=>false;h.submit('maintenance-correct-form');assert.equal(h.sent.length,1);
  h.window.confirm=()=>true;h.submit('maintenance-correct-form');await h.reply(h.sent[1],'STAFF_NO_CHANGE');
  assert.equal(h.node('maintenance-reset').disabled,false);assert.equal(h.node('maintenance-target-fields').disabled,false);
});
