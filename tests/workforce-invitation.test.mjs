/** D9 UI regression tests: fake DOM + real WebCrypto; no LINE or Google access.
 * Deleting this loses replay/spoof/double-tap coverage. Extend when controller changes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';

function harness() {
  const handlers={}, timers=new Map(), sent=[]; let timerSeq=0;
  const nodes=Object.fromEntries(['demo-issue','demo-claim','demo-status'].map(id=>[id,{
    disabled:id==='demo-claim', textContent:'', addEventListener(type,fn){this[type]=fn;},
  }]));
  const window={addEventListener(type,fn){handlers[type]=fn;},confirm(){return true;}};
  window.top=window;
  const document={getElementById:id=>nodes[id],body:{appendChild(){}},
    createElement(tag){return {children:[],appendChild(n){this.children.push(n);},
      remove(){},submit(){assert.equal(tag,'form'); sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};},
  };
  const context={window,document,crypto:webcrypto,TextEncoder,Uint8Array,
    setTimeout(fn){const id=++timerSeq;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../workforce/demo-invitation.js',import.meta.url),'utf8'),context);
  window.TlhDemoInvitation.init({gasUrl:'https://script.google.com/fake',liff:{getIDToken:()=> 'fake.jwt.proof'}});
  const reply=async (request,code,changes={})=>{
    const data={type:'TLH_BRIDGE_DEMO_INVITATION',nonce:request.nonce,action:request.action,code};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,code].join('\n')).digest('hex');
    Object.assign(data,changes);await handlers.message({origin:'null',data});
  };
  return {nodes,sent,timers,reply,window};
}
test('issue keeps token in memory, inhibits double tap, verifies HMAC then enables claim',async()=>{
  const h=harness();h.nodes['demo-issue'].click();h.nodes['demo-issue'].click();
  assert.equal(h.sent.length,1);assert.equal(h.nodes['demo-claim'].disabled,true);
  const request=h.sent[0];assert.match(request.inviteToken,/^[a-f0-9]{64}$/);
  await h.reply(request,'INVITATION_READY');assert.equal(h.nodes['demo-claim'].disabled,false);
  h.nodes['demo-claim'].click();assert.equal(h.sent[1].inviteToken,request.inviteToken);
  assert.notEqual(h.sent[1].responseKey,request.responseKey);
  await h.reply(h.sent[1],'DEMO_EMPLOYEE_LINKED');
  assert.equal(h.nodes['demo-claim'].disabled,true);assert.equal(h.timers.size,0);
});
test('invalid MAC, tampered code/action and unknown codes cannot enable claim',async()=>{
  for(const changes of [{mac:'0'.repeat(64)},{code:'DEMO_EMPLOYEE_LINKED'},
    {action:'bridgeClaimDemoInvitation'},{code:'untrusted'}]){
    const h=harness();h.nodes['demo-issue'].click();
    await h.reply(h.sent[0],'INVITATION_READY',changes);
    assert.equal(h.nodes['demo-claim'].disabled,true);assert.equal(h.timers.size,1);
  }
});
test('timeout retries same invitation; delayed old reply cannot settle new request',async()=>{
  const h=harness();h.nodes['demo-issue'].click();const old=h.sent[0];
  [...h.timers.values()][0]();h.nodes['demo-issue'].click();const next=h.sent[1];
  assert.equal(old.inviteToken,next.inviteToken);assert.notEqual(old.nonce,next.nonce);
  await h.reply(old,'INVITATION_READY');assert.equal(h.nodes['demo-claim'].disabled,true);
  await h.reply(next,'INVITATION_READY');assert.equal(h.nodes['demo-claim'].disabled,false);
});
test('review result stops both buttons; embedding cannot send writes',async()=>{
  const h=harness();h.nodes['demo-issue'].click();await h.reply(h.sent[0],'D9_REVIEW_REQUIRED');
  assert.equal(h.nodes['demo-issue'].disabled,true);assert.equal(h.nodes['demo-claim'].disabled,true);
  const embedded=harness();embedded.window.top={};embedded.nodes['demo-issue'].click();
  assert.equal(embedded.sent.length,0);
});
