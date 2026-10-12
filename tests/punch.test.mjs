/** Fake DOM/LIFF only. Actual WebCrypto and D14 retry controller; no online writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHmac } from 'node:crypto';
function harness(){
  const nodes=new Map(),handlers={},sent=[],timers=new Map();let seq=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,textContent:'',events:{},addEventListener(type,fn){this.events[type]=fn;}});return nodes.get(id);};
  const window={top:null,confirm:()=>true,addEventListener(type,fn){handlers[type]=fn;}};window.top=window;
  const context={window,crypto:webcrypto,Uint8Array,TextEncoder,
    document:{getElementById:node,body:{appendChild(){}},createElement(){return {children:[],appendChild(n){this.children.push(n);},remove(){},
      submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}},
    setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../workforce/punch.js',import.meta.url),'utf8'),context);
  window.TlhPunch.init({gasUrl:'https://script.google.com/fake',liff:{getIDToken:()=> 'fake.jwt.proof'}});
  const click=id=>node(id).events.click();
  async function reply(r,code,revision='',changes={},origin='null'){
    const d={type:'TLH_BRIDGE_PUNCH',action:r.action,nonce:r.nonce,code,revision};
    d.mac=createHmac('sha256',r.responseKey).update([d.type,d.nonce,d.action,d.code,d.revision].join('\n')).digest('hex');
    Object.assign(d,changes);await handlers.message({origin,data:d});
  }
  async function ready(code='PUNCH_READY_OFF'){click('punch-check');await reply(sent.at(-1),code,'b'.repeat(64));}
  return {node,window,sent,timers,click,reply,ready};
}
test('initial UI sends nothing; signed closed switch never opens command buttons',async()=>{
  const h=harness();assert.equal(h.sent.length,0);h.click('punch-in');assert.equal(h.sent.length,0);
  h.click('punch-check');await h.reply(h.sent[0],'PUNCH_DISABLED');assert.equal(h.node('punch-in').hidden,true);
  assert.equal(h.node('punch-status').textContent,'打刻受付は停止中です。');
  assert.deepEqual(Object.keys(h.sent[0]).sort(),['action','idToken','nonce','responseKey']);
});
test('HMAC and revision must match; foreign origins, non-string codes and forged pointers are ignored',async()=>{
  const h=harness();h.click('punch-check');const r=h.sent[0];
  for(const changes of [{revision:'c'.repeat(64)},{code:['PUNCH_READY_OFF']},{mac:'0'.repeat(64)}]){
    await h.reply(r,'PUNCH_READY_OFF','b'.repeat(64),changes);assert.equal(h.node('punch-in').hidden,true);
  }
  await h.reply(r,'PUNCH_READY_OFF','b'.repeat(64),{},'https://attacker.example');assert.equal(h.node('punch-in').hidden,true);
  await h.reply(r,'PUNCH_READY_OFF','');assert.equal(h.node('punch-in').hidden,true);
  await h.reply(r,'PUNCH_READY_OFF','b'.repeat(64));assert.equal(h.node('punch-in').hidden,false);
});
test('only legal commands are visible for each state, non-visible commands never submit',async()=>{
  for(const [state,visible]of [['PUNCH_READY_OFF',['punch-in']],['PUNCH_READY_WORKING',['punch-break-start','punch-out']],['PUNCH_READY_BREAK',['punch-break-end']]]){
    const h=harness();await h.ready(state);
    for(const id of ['punch-in','punch-break-start','punch-break-end','punch-out'])assert.equal(h.node(id).hidden,!visible.includes(id));
    const invalid=['punch-in','punch-break-start','punch-break-end','punch-out'].find(id=>!visible.includes(id));h.click(invalid);assert.equal(h.sent.length,1);
  }
});
test('confirmation is required; write contains only event/type/revision and proof/envelope, double taps stop',async()=>{
  const h=harness();await h.ready();h.window.confirm=()=>false;h.click('punch-in');assert.equal(h.sent.length,1);
  h.window.confirm=()=>true;h.click('punch-in');h.click('punch-in');h.click('punch-check');assert.equal(h.sent.length,2);
  const r=h.sent[1];assert.match(r.eventId,/^evt_[a-f0-9]{32}$/);assert.equal(r.eventType,'CLOCK_IN');assert.equal(r.revision,'b'.repeat(64));
  assert.deepEqual(Object.keys(r).sort(),['action','eventId','eventType','idToken','nonce','responseKey','revision']);
  await h.reply(r,'PUNCH_CLOCK_OUT_DONE');assert.equal(h.node('punch-check').disabled,true);
  await h.reply(r,'PUNCH_CLOCK_IN_DONE');assert.equal(h.node('punch-check').disabled,false);assert.equal(h.node('punch-in').hidden,true);
});
test('unknown outcome keeps exact event ID/revision/type; fresh nonce/key on retry and delayed response ignored',async()=>{
  const h=harness();await h.ready();h.click('punch-in');const old=h.sent[1];[...h.timers.values()][0]();
  assert.equal(h.node('punch-check').disabled,true);assert.equal(h.node('punch-retry').disabled,false);
  h.click('punch-check');h.click('punch-out');assert.equal(h.sent.length,2);h.click('punch-retry');const r=h.sent[2];
  assert.equal(r.eventId,old.eventId);assert.equal(r.eventType,old.eventType);assert.equal(r.revision,old.revision);
  assert.notEqual(r.nonce,old.nonce);assert.notEqual(r.responseKey,old.responseKey);
  await h.reply(old,'PUNCH_CLOCK_IN_DONE');assert.equal(h.node('punch-check').disabled,true);
  await h.reply(r,'PUNCH_ALREADY_RECORDED');assert.equal(h.node('punch-retry').hidden,true);assert.equal(h.node('punch-check').disabled,false);
});
test('known busy/not-saved and generic failure retain retry draft; stale snapshot requires new readiness',async()=>{
  for(const code of ['PUNCH_NOT_SAVED','PUNCH_BUSY','WORK_STATE_BUSY','PUNCH_UNAVAILABLE']){
    const h=harness();await h.ready();h.click('punch-in');const old=h.sent[1];await h.reply(old,code);
    h.click('punch-retry');assert.equal(h.sent[2].eventId,old.eventId);
  }
  const h=harness();await h.ready();h.click('punch-in');await h.reply(h.sent[1],'PUNCH_STATE_CHANGED');
  assert.equal(h.node('punch-in').hidden,true);assert.equal(h.node('punch-check').disabled,false);assert.equal(h.node('punch-retry').hidden,true);
});
test('quarantine and raw-history/schema errors disable all commands, including retry',async()=>{
  for(const code of ['WRITE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_CORRECTIONS_PENDING']){
    const h=harness();await h.ready();h.click('punch-in');await h.reply(h.sent[1],code);
    assert.equal(h.node('punch-check').disabled,true);assert.equal(h.node('punch-retry').disabled,true);assert.equal(h.node('punch-in').hidden,true);
  }
});
test('read timeout has no write draft, and embedding cannot request capability or save',async()=>{
  const h=harness();h.click('punch-check');[...h.timers.values()][0]();assert.equal(h.node('punch-check').disabled,false);assert.equal(h.node('punch-retry').hidden,true);
  const other=harness();other.window.top={};other.click('punch-check');assert.equal(other.sent.length,0);
});
