import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../account/account.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../account/index.html',import.meta.url),'utf8');
export function harness({deferLogin=false,proof='fixture.jwt.proof',realBroker=false}={}){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let timerId=0,reads=0,refreshes=0,enrollmentInits=0,loginCalls=0,clearCalls=0,release;const order=[],opened=[],popup={closed:false,close(){this.closed=true;},postMessage(){}};
 function element(){return {hidden:false,disabled:false,textContent:'',attributes:{},children:[],events:{},contentWindow:{},
  setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},getAttributeNames(){return Object.keys(this.attributes);},
  addEventListener(k,v){this.events[k]=v;},appendChild(v){this.children.push(v);},remove(){},
  submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
 const n=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const document={getElementById:n,createElement:element,body:element()};
 n('account-tools').hidden=true;n('account-reload').hidden=true;
 const window={confirm:()=>true,location:{reload(){window.reloaded=true;}},addEventListener(k,v){const old=handlers[k];handlers[k]=old?e=>{old(e);v(e);}:v;},
  TlhInventoryLogin:{clearToken(){clearCalls++;order.push('clear');},async login(){loginCalls++;order.push('login');if(deferLogin)await new Promise(r=>{release=r;});},getToken:()=> proof},
  TlhAccountInfo:{config:{gasUrl:'https://script.google.com/macros/s/fixture/exec'},init(options){assert.equal(options.liff.getIDToken(),proof);return {load(){reads++;}};}},
  TlhAccountAccessOverview:{init(){return {load(){},refresh(){refreshes++;}};}},
  TlhStaffEnrollment:{init(options){assert.equal(options.liff.getIDToken(),proof);enrollmentInits++;}},
  TlhCurrentWorkplace:{submit(form){form.submit();}}};window.top=window;
 const context={window,document,crypto:webcrypto,Uint8Array,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}};
 if(realBroker){window.open=url=>{opened.push(url);return popup;};vm.runInNewContext(fs.readFileSync(new URL('../software/inventory/employee-login.js',import.meta.url),'utf8'),context);}
 vm.runInNewContext(source,context);
 return {n,handlers,sent,timers,window,order,opened,popup,get clearCalls(){return clearCalls;},login:()=>n('account-login').events.click(),create:()=>n('account-create').events.click(),
  releaseLogin:()=>release(),get reads(){return reads;},get refreshes(){return refreshes;},get enrollmentInits(){return enrollmentInits;},get loginCalls(){return loginCalls;},
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
 assert.equal(h.n('account-enrollment-lock').disabled,false);assert.equal(h.reads,1);assert.equal(h.refreshes,1);
});
test('forged origin, source, nonce, code and extra fields cannot resolve a registration',async()=>{
 const h=harness();await h.login();h.create();
 for(const [overrides,event]of [[{nonce:'0'.repeat(32)},{}],[{},{origin:'https://evil.test'}],[{},{source:{}}],[{code:'UNKNOWN'},{}],[{role:'ADMIN'},{}]]){
  h.reply('CREATED',overrides,event);assert.equal(h.n('account-enrollment-lock').disabled,true);assert.equal(h.reads,1);
 }
 h.reply('CREATED');assert.equal(h.reads,1);assert.equal(h.refreshes,1);assert.equal(h.n('account-enrollment-lock').disabled,false);
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
test('BFCache return reloads a clean account page without replaying unresolved registration',async()=>{const h=harness();await h.login();h.create();const count=h.sent.length;h.handlers.pagehide();assert.equal(h.n('account-tools').hidden,true);h.handlers.pageshow({persisted:false});assert.equal(h.window.reloaded,undefined);h.handlers.pageshow({persisted:true});assert.equal(h.window.reloaded,true);assert.equal(h.sent.length,count);assert.equal(h.n('account-tools').hidden,true);});

test('explicit Account login clears rejected broker proof first, without automatic writes or repeated resets',async()=>{
 const h=harness();assert.equal(h.clearCalls,0);await h.login();assert.deepEqual(h.order,['clear','login']);assert.equal(h.clearCalls,1);assert.match(h.n('account-status').textContent,/本人確認情報を受け取り/);assert.doesNotMatch(h.n('account-status').textContent,/本人確認が完了/);await h.login();assert.equal(h.clearCalls,1);h.create();[...h.timers.values()][0]();await h.login();assert.equal(h.clearCalls,1);assert.equal(h.sent.length,1);
});
test('fresh Account page and reload both send real broker through reauth=1, never stale default popup',async()=>{
 for(let page=0;page<2;page++){const h=harness({realBroker:true});const done=h.login();assert.equal(h.opened.length,1);assert.match(h.opened[0],/\&reauth=1$/);const nonce=h.opened[0].match(/request=([a-f0-9]{32})/)[1];h.handlers.message({origin:'https://tealabhokkaido.com',source:h.popup,data:{type:'TLH_INVENTORY_LOGIN_RESULT',nonce,code:'OK',idToken:'fixture.jwt.proof'}});await done;assert.equal(h.reads,1);assert.equal(h.sent.length,0);}
});

test('registration success requests one self-overview refresh while unknown and forged results do not',async()=>{const h=harness();await h.login();h.create();h.reply('REGISTRATION_UNAVAILABLE');assert.equal(h.refreshes,0);h.reply('CREATED',{nonce:'0'.repeat(32)});assert.equal(h.refreshes,0);h.reply('CREATED');assert.equal(h.refreshes,1);assert.equal(h.reads,1);});

test('closed signup directs to administrator and never suggests workforce invitation as an alternative',async()=>{const h=harness();await h.login();h.create();h.reply('SIGNUP_CLOSED');assert.match(h.n('account-create-status').textContent,/管理者/);assert.doesNotMatch(h.n('account-create-status').textContent,/招待コードがある方/);assert.equal(h.refreshes,0);});
