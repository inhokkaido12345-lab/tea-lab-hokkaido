/** Fake DOM/LIFF only, real WebCrypto. No employee data or network.
 * Protect D11 HMAC, double-tap, immutable retry draft and no automatic writes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
function harness() {
  const handlers={},timers=new Map(),sent=[];let timerSeq=0;
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,disabled:false,events:{},
      addEventListener(type,fn){this.events[type]=fn;},reportValidity(){return true;},focus(){},select(){}});
    return nodes.get(id);
  };
  const window={confirm(){return true;},navigator:{clipboard:{writeText:async()=>{}}},
    addEventListener(type,fn){handlers[type]=fn;}};window.top=window;
  const context={window,crypto:webcrypto,Uint8Array,TextEncoder,
    document:{getElementById:node,body:{appendChild(){}},createElement(){return {
      children:[],appendChild(n){this.children.push(n);},remove(){},
      submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));},
    };}},
    setTimeout(fn){const n=++timerSeq;timers.set(n,fn);return n;},clearTimeout(n){timers.delete(n);},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../workforce/staff-enrollment.js',import.meta.url),'utf8'),context);
  window.TlhStaffEnrollment.init({gasUrl:'https://script.google.com/fake',liff:{getIDToken:()=> 'fake.jwt.proof'}});
  const click=id=>node(id).events.click();
  const submit=id=>node(id).events.submit({preventDefault(){}});
  const reply=async(request,code,changes={},origin='null')=>{
    const data={type:'TLH_BRIDGE_STAFF_ENROLLMENT',nonce:request.nonce,action:request.action,code};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,code].join('\n')).digest('hex');
    Object.assign(data,changes);await handlers.message({origin,data});
  };
  function fill(){node('staff-employee-code').value='EMP011';node('staff-name').value='Test Worker';node('staff-hire-date').value='';}
  return {node,click,submit,reply,fill,window,sent,timers};
}
async function admin(h){h.click('staff-check');await h.reply(h.sent[0],'STAFF_ADMIN_READY');h.fill();}
test('initial UI makes no requests; only signed admin response opens form',async()=>{
  const h=harness();assert.equal(h.sent.length,0);assert.equal(h.node('staff-admin').hidden,true);
  h.click('staff-check');await h.reply(h.sent[0],'STAFF_ADMIN_READY',{mac:'0'.repeat(64)});
  await h.reply(h.sent[0],'STAFF_ADMIN_READY',{code:['STAFF_ADMIN_READY']});
  assert.equal(h.node('staff-admin').hidden,true);await h.reply(h.sent[0],'STAFF_ADMIN_READY');
  assert.equal(h.node('staff-admin').hidden,false);
});
test('issue draft is immutable across timeout, no duplicate submit, secret displayed only after verification',async()=>{
  const h=harness();await admin(h);h.submit('staff-issue-form');h.submit('staff-issue-form');
  assert.equal(h.sent.length,2);const request=h.sent[1];assert.match(request.inviteToken,/^[a-f0-9]{64}$/);
  assert.equal(h.node('staff-issued-code').value,'');assert.equal(h.node('staff-fields').disabled,true);
  [...h.timers.values()][0]();h.node('staff-name').value='Modified';h.submit('staff-issue-form');
  assert.equal(h.sent[2].name,request.name);assert.equal(h.sent[2].inviteToken,request.inviteToken);
  await h.reply(request,'STAFF_INVITATION_READY');assert.equal(h.node('staff-issued-code').value,'');
  await h.reply(h.sent[2],'STAFF_INVITATION_READY');assert.equal(h.node('staff-issued-code').value,request.inviteToken);
});
test('revoke hides code immediately and confirmed result permits new issue',async()=>{
  const h=harness();await admin(h);h.submit('staff-issue-form');await h.reply(h.sent[1],'STAFF_INVITATION_READY');
  h.click('staff-revoke');assert.equal(h.node('staff-invite-box').hidden,true);
  assert.equal(Object.hasOwn(h.sent[2],'inviteToken'),false);assert.equal(h.sent[2].employeeCode,'EMP011');
  await h.reply(h.sent[2],'STAFF_INVITATION_REVOKED');assert.equal(h.node('staff-fields').disabled,false);
});
test('claim sends only proof/code/envelope, requires confirmation and ignores foreign origin/bad MAC',async()=>{
  const h=harness();h.node('staff-claim-code').value='b'.repeat(64);h.window.confirm=()=>false;
  h.submit('staff-claim-form');assert.equal(h.sent.length,0);h.window.confirm=()=>true;h.submit('staff-claim-form');
  const r=h.sent[0];assert.deepEqual(Object.keys(r).sort(),['action','idToken','inviteToken','nonce','responseKey']);
  await h.reply(r,'STAFF_REGISTERED',{},'https://attacker.example');assert.equal(h.node('staff-claim-code').value,'b'.repeat(64));
  await h.reply(r,'STAFF_REGISTERED',{mac:'0'.repeat(64)});assert.equal(h.timers.size,1);
  await h.reply(r,'STAFF_REGISTERED');assert.equal(h.node('staff-claim-code').value,'');assert.equal(h.node('staff-claim').disabled,true);
});
test('malformed invite, embedding and cancelled issue/revoke do not send requests',async()=>{
  const h=harness();h.node('staff-claim-code').value='short';h.submit('staff-claim-form');assert.equal(h.sent.length,0);
  await admin(h);h.window.confirm=()=>false;h.submit('staff-issue-form');h.click('staff-revoke');assert.equal(h.sent.length,1);
  const embedded=harness();embedded.window.top={};embedded.click('staff-check');assert.equal(embedded.sent.length,0);
});
test('review quarantines UI and clears displayed secret; admin rejection hides form',async()=>{
  const h=harness();await admin(h);h.submit('staff-issue-form');await h.reply(h.sent[1],'WRITE_REVIEW_REQUIRED');
  assert.equal(h.node('staff-issued-code').value,'');assert.equal(h.node('staff-claim').disabled,true);
  assert.equal(h.node('staff-issue').disabled,true);assert.equal(h.node('staff-reset').disabled,true);
  const n=harness();await admin(n);n.click('staff-check');await n.reply(n.sent[1],'TLH_ADMIN_REQUIRED');
  assert.equal(n.node('staff-admin').hidden,true);
});
test('copy uses deliberate clipboard action only; resetting issues a different secret',async()=>{
  const h=harness();let copied=null;h.window.navigator.clipboard.writeText=async text=>{copied=text;};
  await admin(h);h.submit('staff-issue-form');const first=h.sent[1].inviteToken;await h.reply(h.sent[1],'STAFF_INVITATION_READY');
  assert.equal(copied,null);await h.click('staff-copy');assert.equal(copied,first);
  h.click('staff-reset');assert.equal(h.node('staff-issued-code').value,'');h.submit('staff-issue-form');
  assert.notEqual(h.sent[2].inviteToken,first);
});
