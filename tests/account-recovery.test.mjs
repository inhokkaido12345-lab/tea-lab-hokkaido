/** 復旧の偽DOM/実WebCrypto試験。通信/LINE/clipboard/タイマーは代用。実機受入れとは別。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
const source=fs.readFileSync(new URL('../workforce/account-recovery.js',import.meta.url),'utf8');
function harness() {
  const nodes=new Map(),handlers={},sent=[],timers=new Map();let timer=0,proof='fake.jwt.proof',copied='';
  function node(id) {
    if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,hidden:false,readOnly:false,events:{},contentWindow:{},
      addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this[k]=v;}});
    return nodes.get(id);
  }
  const window={confirm:()=>true,addEventListener(k,fn){handlers[k]=fn;}};window.top=window;
  const context={window,crypto:webcrypto,Uint8Array,TextEncoder,
    navigator:{clipboard:{async writeText(value){copied=value;}}},
    document:{currentScript:null,getElementById:node,body:{appendChild(){}},createElement(){
      return {children:[],appendChild(n){this.children.push(n);},remove(){},submit(){
        sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));
      }};
    }},setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(source,context);
  const n=name=>node('recovery-'+name),click=name=>n(name).events.click();
  window.TlhAccountRecovery.init({gasUrl:window.TlhAccountRecovery.config.gasUrl,liff:{getIDToken:()=>proof}});
  n('user-code').value='RCV001';n('owner-code').value='RCV001';n('owner-name').value='Fixture';n('owner-receipt').value='c'.repeat(64);
  async function reply(request,code,revision='',patch={},eventPatch={}) {
    const data={type:'TLH_BRIDGE_ACCOUNT_RECOVERY',nonce:request.nonce,action:request.action,code,revision};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,code,revision].join('\n')).digest('hex');
    Object.assign(data,patch);
    await handlers.message({source:n('frame').contentWindow,origin:'null',data,...eventPatch});
  }
  async function review() {click('inspect');await reply(sent.at(-1),'RECOVERY_READY','d'.repeat(64));}
  return {n,click,sent,timers,window,reply,review,handlers,setProof:v=>{proof=v;},copied:()=>copied};
}
test('initialization sends nothing and owner writes require a server review',()=>{
  const h=harness();assert.equal(h.sent.length,0);h.click('approve');h.click('reject');assert.equal(h.sent.length,0);
  assert.equal(h.n('approve').disabled,true);
});
test('submission creates random receipt only after explicit consent, then blocks duplicate taps',async()=>{
  const h=harness();h.window.confirm=()=>false;h.click('submit');assert.equal(h.sent.length,0);
  h.window.confirm=()=>true;h.click('submit');h.click('submit');assert.equal(h.sent.length,1);
  const r=h.sent[0];assert.match(r.receipt,/^[a-f0-9]{64}$/);assert.equal(r.employeeCode,'RCV001');
  assert.equal(h.n('user-receipt').readOnly,true);
  await h.reply(r,'RECOVERY_REQUESTED');h.click('submit');assert.equal(h.sent.length,1);
  await h.click('copy');assert.equal(h.copied(),r.receipt);
});
test('no LINE proof cannot lock a new request or generate a receipt',()=>{
  const h=harness();h.setProof('');h.click('submit');assert.equal(h.sent.length,0);assert.equal(h.n('user-receipt').value,'');
});
test('reply requires exact iframe source, origin, nonce, action, known code, revision shape and HMAC',async()=>{
  const h=harness();h.click('inspect');const r=h.sent[0];
  for(const [patch,eventPatch] of [[{}, {source:{}}],[{}, {origin:'https://attacker.test'}],
    [{mac:'0'.repeat(64)},{}],[{action:'bridgeRecoveryApprove'},{}],[{code:'UNKNOWN'},{}],[{revision:''},{}]]) {
    await h.reply(r,'RECOVERY_READY','d'.repeat(64),patch,eventPatch);assert.equal(h.n('approve').disabled,true);
  }
  await h.reply(r,'RECOVERY_READY','d'.repeat(64));h.n('verified').checked=true;h.n('method').value='VIDEO';
  h.n('verified').events.change();assert.equal(h.n('approve').disabled,false);
});
test('owner approval binds immutable target/revision and requires verification method plus confirmation',async()=>{
  const h=harness();await h.review();h.click('approve');assert.equal(h.sent.length,1);
  h.n('verified').checked=true;h.n('method').value='PHONE';h.n('verified').events.change();
  h.window.confirm=()=>false;h.click('approve');assert.equal(h.sent.length,1);
  h.window.confirm=()=>true;h.n('owner-name').value='DOM tampering without input event';h.click('approve');h.click('approve');
  assert.equal(h.sent.length,2);const r=h.sent[1];assert.equal(r.expectedName,'Fixture');assert.equal(r.revision,'d'.repeat(64));
  assert.equal(r.method,'PHONE');assert.equal(r.verificationConfirmed,'true');
  await h.reply(r,'RECOVERY_APPROVED');assert.equal(h.n('approve').disabled,true);
});
test('editing reviewed target invalidates approval and clears verification',async()=>{
  const h=harness();await h.review();h.n('verified').checked=true;h.n('method').value='PHONE';h.n('verified').events.change();
  h.n('owner-code').events.input();assert.equal(h.n('approve').disabled,true);assert.equal(h.n('verified').checked,false);
});
test('timed-out approval is not resent; status inspection cannot silently renew approval',async()=>{
  const h=harness();await h.review();h.n('verified').checked=true;h.n('method').value='OTHER';h.n('verified').events.change();
  h.click('approve');const original=h.sent.at(-1);[...h.timers.values()][0]();
  h.click('approve');assert.equal(h.sent.length,2);h.click('inspect');
  await h.reply(original,'RECOVERY_APPROVED');assert.equal(h.n('approve').disabled,true);
  await h.reply(h.sent.at(-1),'RECOVERY_READY','e'.repeat(64));
  h.n('verified').checked=true;h.n('method').value='PHONE';h.n('verified').events.change();
  h.click('approve');assert.equal(h.sent.length,3);assert.equal(h.n('approve').disabled,true);
});
test('timed-out submission keeps receipt and uses a read, not a new submission',async()=>{
  const h=harness();h.click('submit');const r=h.sent[0];[...h.timers.values()][0]();
  h.click('submit');assert.equal(h.sent.length,1);h.click('status-check');
  assert.equal(h.sent[1].receipt,r.receipt);assert.equal(h.sent[1].action,'bridgeRecoveryStatus');
  await h.reply(h.sent[1],'RECOVERY_REQUESTED');assert.equal(h.n('cancel').disabled,false);
});
test('cancel and reject are confirmed commands; review-required results never enable further writes',async()=>{
  const h=harness();h.click('submit');await h.reply(h.sent.at(-1),'RECOVERY_REQUESTED');
  h.window.confirm=()=>false;h.click('cancel');assert.equal(h.sent.length,1);
  h.window.confirm=()=>true;h.click('cancel');assert.equal(h.sent.at(-1).action,'bridgeRecoveryCancel');
  await h.reply(h.sent.at(-1),'RECOVERY_CANCELLED');
  await h.review();h.click('reject');assert.equal(h.sent.at(-1).action,'bridgeRecoveryReject');
  await h.reply(h.sent.at(-1),'WRITE_REVIEW_REQUIRED');assert.equal(h.n('approve').disabled,true);assert.equal(h.n('submit').disabled,true);
});
test('page departure clears secrets and rejects late responses without browser storage',async()=>{
  const h=harness();h.click('submit');const r=h.sent[0];h.handlers.pagehide();
  assert.equal(h.n('user-receipt').value,'');assert.equal(h.n('owner-receipt').value,'');assert.equal(h.n('owner-name').value,'');
  await h.reply(r,'RECOVERY_REQUESTED');assert.equal(h.n('submit').disabled,true);
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\.|location\.search|URLSearchParams/);
});
test('dedicated HTML has required unique controls, no embedded source changes, and matches existing public connection settings',()=>{
  const html=fs.readFileSync(new URL('../workforce/recovery.html',import.meta.url),'utf8');
  const main=fs.readFileSync(new URL('../workforce/index.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  const h=harness();assert.ok(main.includes(h.window.TlhAccountRecovery.config.gasUrl));
  assert.ok(main.includes(h.window.TlhAccountRecovery.config.liffId));
  for(const id of ['recovery-frame','recovery-approve','recovery-user-receipt','recovery-verified'])assert.ok(ids.includes(id));
  assert.match(html,/name="referrer" content="no-referrer"/);assert.match(html,/account-recovery\.js/);
  assert.match(html,/href="recovery\.css\?v=[^"]+"/);
});
