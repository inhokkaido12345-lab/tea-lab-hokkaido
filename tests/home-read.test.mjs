/** Actual transport/crypto with fake iframe/POST, never real login or records. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const handlers={},sent=[],timers=new Map(),frame={name:'tlhHomeReadFrame',contentWindow:{}};let seq=0;
 const window={addEventListener(k,fn){handlers[k]=fn;},TlhCurrentWorkplace:{submit(form){form.submit();}}};
 const context={window,crypto:webcrypto,Uint8Array,TextEncoder,setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);},document:{body:{appendChild(){}},createElement(){return {children:[],appendChild(n){this.children.push(n);},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}}};
 vm.runInNewContext(fs.readFileSync(new URL('../workforce/home-read.js',import.meta.url),'utf8'),context);
 const api=window.TlhHomeRead.init({gasUrl:'https://script.google.com/fake',frame});
 const input=(action='bridgeGetPunchReadiness',n='1')=>({action,idToken:'fake.jwt.proof',nonce:n.repeat(32),responseKey:n.repeat(64)});
 function response(request,code='READ_HOME_READY',children){const d={type:'TLH_BRIDGE_READ_HOME_V1',nonce:request.nonce,action:request.action,code,replies:JSON.stringify(children??JSON.parse(request.requests).map(r=>({action:r.action,nonce:r.nonce,mac:'child-is-verified-by-controller'})))};d.mac=createHmac('sha256',request.responseKey).update(Object.values(d).join('\n')).digest('hex');return d;}
 return {api,input,sent,timers,frame,handlers,response,deliver:data=>handlers.message({origin:'null',source:frame.contentWindow,data})};
}
test('same-turn reads share a POST, keep original child keys and no write/admin-target read can enter',async()=>{
 const h=setup(),a=h.input(),b=h.input('bridgeGetDailySummary','2');const pa=h.api.request(a),pb=h.api.request(b);await tick();assert.equal(h.sent.length,1);
 assert.deepEqual(JSON.parse(h.sent[0].requests),[a,b].map(({idToken,...r})=>r));await h.deliver(h.response(h.sent[0]));assert.equal((await pa).nonce,a.nonce);assert.equal((await pb).nonce,b.nonce);
 for(const r of [{...a,action:'bridgeRecordPunch'},{...a,action:'bridgeGetAttendanceJournalV2',mode:'admin',month:'2026-11',employeeCode:'OTHER'},{...a,role:'TLH_ADMIN'}])await assert.rejects(h.api.request(r),/READ_HOME_INVALID/);
 assert.equal(h.sent.length,1);assert.equal(h.timers.size,0);
});
test('wrong iframe/origin/nonce/MAC, reordered or missing children never resolve a pending read',async()=>{
 const h=setup();let resolved=false;const p=h.api.request(h.input()).then(()=>{resolved=true;});await tick();const d=h.response(h.sent[0]);
 await h.handlers.message({origin:'https://evil.test',source:h.frame.contentWindow,data:d});await h.handlers.message({origin:'null',source:{},data:d});await h.deliver({...d,mac:'0'.repeat(64)});await tick();assert.equal(resolved,false);
 await h.deliver(h.response(h.sent[0],'READ_HOME_READY',[]));await tick();assert.equal(resolved,false);
 await h.deliver(d);await p;assert.equal(resolved,true);
});
test('verified LINE rejection is preserved for explicit relogin; timeout/pagehide never resend or retain data',async()=>{
 const h=setup(),p=h.api.request(h.input());await tick();const rejected=assert.rejects(p,e=>e.code==='LINE_VERIFY_REJECTED');await h.deliver(h.response(h.sent[0],'LINE_VERIFY_REJECTED',[]));await rejected;
 const timeout=h.api.request(h.input());const expired=assert.rejects(timeout,/UNAVAILABLE/);await tick();for(const fn of [...h.timers.values()])fn();await expired;assert.equal(h.sent.length,2);
 const departing=h.api.request(h.input());const closed=assert.rejects(departing,/UNAVAILABLE/);h.handlers.pagehide();await closed;await tick();assert.equal(h.sent.length,2);await assert.rejects(h.api.request(h.input()),/INVALID/);
});
test('different proof and duplicate action never borrow another request identity or overwrite results',async()=>{
 const h=setup(),p1=h.api.request(h.input()),p2=h.api.request({...h.input('bridgeGetDailySummary','2'),idToken:'other.jwt.proof'}),p3=h.api.request(h.input('bridgeGetPunchReadiness','3'));await tick();assert.equal(h.sent.length,3);
 for(const request of h.sent)await h.deliver(h.response(request));await Promise.all([p1,p2,p3]);assert.equal(h.timers.size,0);
});
