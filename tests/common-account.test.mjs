import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../account/account.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../account/index.html',import.meta.url),'utf8');
function harness({deferLogin=false}={}){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let timerId=0,reads=0,enrollmentInits=0,loginCalls=0,release;
 function element(){return {hidden:false,disabled:false,textContent:'',attributes:{},children:[],events:{},contentWindow:{},
  setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},getAttributeNames(){return Object.keys(this.attributes);},
  addEventListener(k,v){this.events[k]=v;},appendChild(v){this.children.push(v);},remove(){},
  submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
 const n=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const document={getElementById:n,createElement:element,body:element()};
 n('account-tools').hidden=true;n('account-reload').hidden=true;
 const window={confirm:()=>true,location:{reload(){window.reloaded=true;}},addEventListener(k,v){handlers[k]=v;},
  TlhInventoryLogin:{async login(){loginCalls++;if(deferLogin)await new Promise(r=>{release=r;});},getToken:()=> 'fixture.jwt.proof'},
  TlhAccountInfo:{config:{gasUrl:'https://script.google.com/macros/s/fixture/exec'},init(options){assert.equal(options.liff.getIDToken(),'fixture.jwt.proof');return {load(){reads++;}};}},
  TlhStaffEnrollment:{init(options){assert.equal(options.liff.getIDToken(),'fixture.jwt.proof');enrollmentInits++;}},
  TlhCurrentWorkplace:{submit(form){form.submit();}}};window.top=window;
 vm.runInNewContext(source,{window,document,crypto:webcrypto,Uint8Array,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}});
 return {n,handlers,sent,timers,window,login:()=>n('account-login').events.click(),create:()=>n('account-create').events.click(),
  releaseLogin:()=>release(),get reads(){return reads;},get enrollmentInits(){return enrollmentInits;},get loginCalls(){return loginCalls;},
  reply(code,overrides={},event={}){handlers.message({origin:'https://script.google.com',source:n('account-create-frame').contentWindow,
   data:{type:'TLH_BRIDGE_ACCOUNT_CREATED',nonce:sent.at(-1).nonce,code,...overrides},...event});}};
}
test('common account starts without automatic login, account writes or employment grants',()=>{
 const h=harness();assert.equal(h.loginCalls,0);assert.equal(h.reads,0);assert.equal(h.sent.length,0);
 assert.equal(h.n('account-tools').hidden,true);assert.equal(h.n('account-enrollment-lock').disabled,true);
 assert.doesNotMatch(html,/src="[^"]*(?:punch|layout|schedule|app\.js|liff\/edge)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|innerHTML|console\./);
});
test('explicit login reads self once and initializes existing enrollment without writing',async()=>{
 const h=harness();await h.login();await h.login();
 assert.equal(h.loginCalls,1);assert.equal(h.reads,1);assert.equal(h.enrollmentInits,1);assert.equal(h.sent.length,0);
 assert.equal(h.n('account-enrollment-lock').disabled,false);assert.equal(h.n('account-tools').hidden,false);
});
test('late login completion after departure cannot initialize registration or read identity',async()=>{
 const h=harness({deferLogin:true}),login=h.login();h.handlers.pagehide();h.releaseLogin();await login;
 assert.equal(h.reads,0);assert.equal(h.enrollmentInits,0);assert.equal(h.n('account-tools').hidden,true);
});
test('create requires confirmation and sends only proof, action and a random nonce',async()=>{
 const h=harness();await h.login();h.window.confirm=()=>false;h.create();assert.equal(h.sent.length,0);
 h.window.confirm=()=>true;h.create();h.create();assert.equal(h.sent.length,1);
 assert.deepEqual(Object.keys(h.sent[0]).sort(),['action','idToken','nonce']);assert.equal(h.sent[0].action,'bridgeCreateAccount');
 assert.match(h.sent[0].nonce,/^[a-f0-9]{32}$/);assert.equal(h.n('account-enrollment-lock').disabled,true);
});
test('unknown result retains the nonce and blocks enrollment while retrying the same identity',async()=>{
 const h=harness();await h.login();h.create();const nonce=h.sent[0].nonce;
 [...h.timers.values()][0]();assert.equal(h.n('account-enrollment-lock').disabled,true);assert.equal(h.n('account-create').disabled,false);
 h.create();assert.equal(h.sent.length,2);assert.equal(h.sent[1].nonce,nonce);
 h.reply('REGISTRATION_UNAVAILABLE');assert.equal(h.n('account-enrollment-lock').disabled,true);
 h.create();assert.equal(h.sent[2].nonce,nonce);h.reply('ALREADY_REGISTERED');
 assert.equal(h.n('account-enrollment-lock').disabled,false);assert.equal(h.reads,2);
});
test('forged origin, source, nonce, code and extra fields cannot resolve a registration',async()=>{
 const h=harness();await h.login();h.create();
 for(const [overrides,event]of [[{nonce:'0'.repeat(32)},{}],[{},{origin:'https://evil.test'}],[{},{source:{}}],[{code:'UNKNOWN'},{}],[{role:'ADMIN'},{}]]){
  h.reply('CREATED',overrides,event);assert.equal(h.n('account-enrollment-lock').disabled,true);assert.equal(h.reads,1);
 }
 h.reply('CREATED');assert.equal(h.reads,2);assert.equal(h.n('account-enrollment-lock').disabled,false);
});
test('closed signup remains closed and employee invitation remains available',async()=>{
 const h=harness();await h.login();h.create();h.reply('SIGNUP_CLOSED');
 assert.match(h.n('account-create-status').textContent,/受付停止中/);assert.equal(h.n('account-enrollment-lock').disabled,false);
 assert.equal(h.reads,1);assert.equal(h.sent.length,1);
});
test('staff operation in progress blocks account creation; departure rejects late result',async()=>{
 const h=harness();await h.login();h.n('staff-status').setAttribute('aria-busy','true');h.create();assert.equal(h.sent.length,0);
 h.n('staff-status').setAttribute('aria-busy','false');h.create();h.handlers.pagehide();h.reply('CREATED');
 assert.equal(h.reads,1);assert.equal(h.n('account-tools').hidden,true);assert.equal(h.timers.size,0);
 h.handlers.pageshow({persisted:true});assert.equal(h.window.reloaded,true);
});
test('all existing enrollment and self-info DOM contracts exist on the standalone page',()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 assert.equal([...html.matchAll(/\bid="([^"]+)"/g)].length,ids.size);
 for(const id of ['staff-check','staff-admin','staff-issue-form','staff-claim-form','staff-fields','staff-employee-code','staff-name','staff-hire-date',
  'staff-claim-code','staff-issue','staff-claim','staff-invite-box','staff-issued-code','staff-copy','staff-revoke','staff-reset','staff-status',
  'account-info-check','account-info-status','account-info-result','account-info-fields','account-info-frame'])assert.ok(ids.has(id),id);
 assert.match(html,/name="tlhStaffFrame"/);assert.match(html,/name="tlhAccountInfoFrame"/);
});
test('signup rate limit is a known refusal, shows retry guidance without claiming creation or blocking old invitations',async()=>{
 const h=harness();await h.login();h.create();h.reply('SIGNUP_RATE_LIMITED');
 assert.match(h.n('account-create-status').textContent,/新規登録が集中/);assert.equal(h.n('account-enrollment-lock').disabled,false);assert.equal(h.reads,1);assert.equal(h.sent.length,1);assert.equal(h.n('account-create').disabled,false);
});
