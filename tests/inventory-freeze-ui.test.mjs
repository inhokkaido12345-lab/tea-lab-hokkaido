import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {webcrypto,createHmac} from 'node:crypto';
const source=readFileSync(new URL('../account/inventory-freeze.js',import.meta.url),'utf8');
function fixture(){
 const sent=[],handlers={},timers=new Map();let token=null,id=0;
 class Element{constructor(){this.children=[];this.value='';}appendChild(n){this.children.push(n);}remove(){}submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}}
 const ns=Object.fromEntries(['login','probe','store','status','frame'].map(k=>[k,new Element()]));ns.frame.contentWindow={};ns.frame.name='freezeFrame';
 const g={location:{origin:'https://tealabhokkaido.com',pathname:'/account/inventory-freeze.html'},TlhInventoryConfig:{apiUrl:'https://script.google.com/macros/s/fixture_freeze/exec'},TlhInventoryLogin:{getToken:()=>token,login:async()=>{token='fixture.header.signature';},clearToken:()=>{token=null;}},addEventListener:(k,v)=>handlers[k]=v};g.top=g;
 vm.runInNewContext(source,{window:g,document:{getElementById:id=>ns[id.replace('freeze-','')],createElement:()=>new Element(),body:new Element()},crypto:webcrypto,Uint8Array,TextEncoder,setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const signed=(code,patch={})=>{const r=sent.at(-1),d={type:'TLH_INVENTORY_V1',action:'inventoryEmployeeV1',command:'TENANT',nonce:r.nonce,code,data:'',...patch};d.mac=createHmac('sha256',r.responseKey).update([d.type,d.action,d.command,d.nonce,d.code,d.data].join('\n')).digest('hex');return d;};
 const deliver=(d,patch={})=>handlers.message({source:ns.frame.contentWindow,origin:'https://script.google.com',data:d,...patch});
 const start=async()=>{await ns.login.onclick();ns.store.value='demo-shop';ns.probe.onclick();};return {ns,g,sent,handlers,timers,signed,deliver,start};
}
test('explicit login + store creates only one signed FREEZE_PROBE request, never mutation or automatic retry',async()=>{
 const x=fixture();assert.equal(x.sent.length,0);assert.equal(x.ns.probe.disabled,true);await x.start();x.ns.probe.onclick();assert.equal(x.sent.length,1);
 const r=x.sent[0],input=JSON.parse(r.input);assert.equal(r.command,'TENANT');assert.equal(input.action,'FREEZE_PROBE');assert.equal(input.storeId,'demo-shop');assert.deepEqual(Object.keys(input).sort(),['action','operationId','storeId']);assert.match(input.operationId,/^[a-z0-9-]+$/);assert.match(r.nonce,/^[a-f0-9]{32}$/);assert.match(r.responseKey,/^[a-f0-9]{64}$/);
 await x.deliver(x.signed('MEMBERSHIP_WRITE_FROZEN'));assert.match(x.ns.status.textContent,/対象 demo-shop：移行凍結による拒否を署名付き応答で確認/);assert.equal(x.sent.length,1);
});
test('invalid MAC, origin, frame, nonce, command, nonempty payload cannot prove freeze',async()=>{
 const x=fixture();await x.start();const valid=x.signed('MEMBERSHIP_WRITE_FROZEN');
 for(const [d,p] of [[{...valid,mac:'0'.repeat(64)},{}],[valid,{origin:'https://evil.invalid'}],[valid,{source:{}}],[x.signed('MEMBERSHIP_WRITE_FROZEN',{nonce:'0'.repeat(32)}),{}],[x.signed('MEMBERSHIP_WRITE_FROZEN',{command:'READ'}),{}],[x.signed('MEMBERSHIP_WRITE_FROZEN',{data:'{}'}),{}]]){await x.deliver(d,p);assert.equal(x.ns.probe.disabled,true);assert.doesNotMatch(x.ns.status.textContent,/署名付き応答で確認/);}
 await x.deliver(valid);assert.equal(x.ns.probe.disabled,false);
});
test('every non-FROZEN error and OK stay unconfirmed; no follow-up write is sent',async()=>{
 for(const code of ['OK','INVALID_REQUEST','FORBIDDEN','AUTH_REQUIRED','MEMBERSHIP_FREEZE_CONFIGURATION_INVALID','COMMON_MEMBERSHIP_MANAGEMENT_REQUIRED']){const x=fixture();await x.start();await x.deliver(x.signed(code));assert.match(x.ns.status.textContent,/凍結は未確認/);assert.doesNotMatch(x.ns.status.textContent,/署名付き応答で確認/);assert.equal(x.sent.length,1);}
});
test('timeout/page exit/invalid scope never retry or accept late evidence',async()=>{
 const x=fixture();await x.start();const d=x.signed('MEMBERSHIP_WRITE_FROZEN');[...x.timers.values()][0]();await x.deliver(d);assert.match(x.ns.status.textContent,/未確認/);assert.equal(x.sent.length,1);
 const y=fixture();await y.start();const late=y.signed('MEMBERSHIP_WRITE_FROZEN');y.handlers.pagehide();await y.deliver(late);assert.equal(y.ns.store.value,'');assert.match(y.ns.status.textContent,/終了/);
 const z=fixture();await z.ns.login.onclick();for(const value of ['', 'personal_abcd','bad id']){z.ns.store.value=value;z.ns.probe.onclick();}assert.equal(z.sent.length,0);
 assert.doesNotMatch(source,/localStorage|sessionStorage|console\.|innerHTML/);
});
test('dedicated page uses existing fixed authentication/config and rollout links to it',()=>{
 const html=readFileSync(new URL('../account/inventory-freeze.html',import.meta.url),'utf8');assert.match(html,/\/software\/inventory\/employee-login.js/);assert.match(html,/\/software\/inventory\/config.js/);assert.match(html,/移行凍結を確認（在庫変更なし）/);assert.doesNotMatch(html,/demo-shop|idToken|value=/);assert.match(readFileSync(new URL('../account/rollout.html',import.meta.url),'utf8'),/href="inventory-freeze.html"/);
});

export {fixture as freezeProbeUiFixture};
