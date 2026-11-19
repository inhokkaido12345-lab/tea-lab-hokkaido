import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../account/account.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../account/index.html',import.meta.url),'utf8');
export function harness({deferLogin=false,proof='fixture.jwt.proof',realBroker=false,overviewState='not_registered',overviewData=null,scopeStarted=true,activationBusy=false,search='',serviceCategory=null,launchers=[],catalog=[{serviceId:'INVENTORY',label:'在庫',path:'/software/inventory/'}]}={}){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let timerId=0,reads=0,refreshes=0,scopeReads=0,overviewReads=0,managementStates=[],enrollmentInits=0,loginCalls=0,clearCalls=0,release,verified;const order=[],opened=[],popup={closed:false,close(){this.closed=true;},postMessage(){}};
 function element(){return {hidden:false,disabled:false,textContent:'',attributes:{},children:[],events:{},contentWindow:{},
  setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},getAttributeNames(){return Object.keys(this.attributes);},
  addEventListener(k,v){this.events[k]=v;},appendChild(v){this.children.push(v);},remove(){},
  submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
 const n=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const document={getElementById:n,createElement:element,body:element()};
 n('account-tools').hidden=true;n('account-reload').hidden=true;
 const window={TlhAccountServiceCategory:serviceCategory,TlhAccountServiceLaunchers:launchers,TlhActivationServices:catalog,confirm:()=>true,location:{search,reload(){window.reloaded=true;}},addEventListener(k,v){const old=handlers[k];handlers[k]=old?e=>{old(e);v(e);}:v;},
  TlhInventoryLogin:{clearToken(){clearCalls++;order.push('clear');},async login(){loginCalls++;order.push('login');if(deferLogin)await new Promise(r=>{release=r;});},getToken:()=> proof},
  TlhAccountInfo:{config:{gasUrl:'https://script.google.com/macros/s/fixture/exec'},init(options){assert.equal(options.liff.getIDToken(),proof);return {load(){reads++;}};}},
  TlhAccountAccessOverview:{init(o){verified=o.onVerified;return {load(){overviewReads++;verified(overviewData,overviewState);},refresh(){refreshes++;}};}},
  TlhAccountTabs:{init(){return {ready(){},sync(){},roles(){},management(state,source){managementStates.push({state,source});}};}},
  TlhServiceActivation:{init(){return {busy:()=>activationBusy,syncRegistration(){}};}},
  TlhCommonAffiliation:{init(){return {busy:()=>false,syncPicker(){},checkManagement(){scopeReads++;return scopeStarted;}};}},
  TlhStaffEnrollment:{init(options){assert.equal(options.liff.getIDToken(),proof);enrollmentInits++;}},
  TlhCurrentWorkplace:{submit(form){form.submit();}}};window.top=window;
 const context={window,document,crypto:webcrypto,Uint8Array,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}};
 if(realBroker){window.open=url=>{opened.push(url);return popup;};vm.runInNewContext(fs.readFileSync(new URL('../software/inventory/employee-login.js',import.meta.url),'utf8'),context);}
 vm.runInNewContext(source,context);
 return {verify:(d,state)=>verified(d,state),n,handlers,sent,timers,window,order,opened,popup,get clearCalls(){return clearCalls;},login:()=>n('account-login').events.click(),create:()=>n('account-create').events.click(),
  releaseLogin:()=>release(),get reads(){return reads;},get refreshes(){return refreshes;},get scopeReads(){return scopeReads;},get managementStates(){return managementStates;},get overviewReads(){return overviewReads;},get enrollmentInits(){return enrollmentInits;},get loginCalls(){return loginCalls;},
  reply(code,overrides={},event={}){handlers.message({origin:'https://script.google.com',source:n('account-create-frame').contentWindow,
   data:{type:'TLH_BRIDGE_ACCOUNT_CREATED',nonce:sent.at(-1).nonce,code,...overrides},...event});}};
}
test('common account starts without automatic login, account writes or employment grants',()=>{
 const h=harness();assert.equal(h.loginCalls,0);assert.equal(h.reads,0);assert.equal(h.sent.length,0);
 assert.equal(h.n('account-tools').hidden,true);assert.equal(h.n('account-enrollment-lock').disabled,true);
 assert.doesNotMatch(html,/src="[^"]*(?:punch|layout|schedule|app\.js|liff\/edge)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|innerHTML|console\./);
});
test('explicit login defers legacy self reads and initializes existing enrollment without writing',async()=>{
 const h=harness();await h.login();await h.login();
 assert.equal(h.loginCalls,1);assert.equal(h.reads,0);assert.equal(h.enrollmentInits,1);assert.equal(h.sent.length,0);
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
 assert.equal(h.n('account-enrollment-lock').disabled,false);assert.equal(h.reads,0);assert.equal(h.refreshes,1);
});
test('forged origin, source, nonce, code and extra fields cannot resolve a registration',async()=>{
 const h=harness();await h.login();h.create();
 for(const [overrides,event]of [[{nonce:'0'.repeat(32)},{}],[{},{origin:'https://evil.test'}],[{},{source:{}}],[{code:'UNKNOWN'},{}],[{role:'ADMIN'},{}]]){
  h.reply('CREATED',overrides,event);assert.equal(h.n('account-enrollment-lock').disabled,true);assert.equal(h.reads,0);
 }
 h.reply('CREATED');assert.equal(h.reads,0);assert.equal(h.refreshes,1);assert.equal(h.n('account-enrollment-lock').disabled,false);
});
test('closed signup remains closed and employee invitation remains available',async()=>{
 const h=harness();await h.login();h.create();h.reply('SIGNUP_CLOSED');
 assert.match(h.n('account-create-status').textContent,/受付停止中/);assert.equal(h.n('account-enrollment-lock').disabled,false);
 assert.equal(h.reads,0);assert.equal(h.sent.length,1);
});
test('staff operation in progress blocks account creation; departure rejects late result',async()=>{
 const h=harness();await h.login();h.n('staff-status').setAttribute('aria-busy','true');h.create();assert.equal(h.sent.length,0);
 h.n('staff-status').setAttribute('aria-busy','false');h.create();h.handlers.pagehide();h.reply('CREATED');
 assert.equal(h.reads,0);assert.equal(h.n('account-tools').hidden,true);assert.equal(h.timers.size,0);
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
 assert.match(h.n('account-create-status').textContent,/新規登録が集中/);assert.equal(h.n('account-enrollment-lock').disabled,false);assert.equal(h.reads,0);assert.equal(h.sent.length,1);assert.equal(h.n('account-create').disabled,false);
});
test('BFCache return reloads a clean account page without replaying unresolved registration',async()=>{const h=harness();await h.login();h.create();const count=h.sent.length;h.handlers.pagehide();assert.equal(h.n('account-tools').hidden,true);h.handlers.pageshow({persisted:false});assert.equal(h.window.reloaded,undefined);h.handlers.pageshow({persisted:true});assert.equal(h.window.reloaded,true);assert.equal(h.sent.length,count);assert.equal(h.n('account-tools').hidden,true);});

test('explicit Account login clears rejected broker proof first, without automatic writes or repeated resets',async()=>{
 const h=harness();assert.equal(h.clearCalls,0);await h.login();assert.deepEqual(h.order,['clear','login']);assert.equal(h.clearCalls,1);assert.match(h.n('account-status').textContent,/未登録/);assert.doesNotMatch(h.n('account-status').textContent,/本人確認が完了/);await h.login();assert.equal(h.clearCalls,1);h.create();[...h.timers.values()][0]();await h.login();assert.equal(h.clearCalls,1);assert.equal(h.sent.length,1);
});
test('fresh Account page and reload both send real broker through reauth=1, never stale default popup',async()=>{
 for(let page=0;page<2;page++){const h=harness({realBroker:true});const done=h.login();assert.equal(h.opened.length,1);assert.match(h.opened[0],/\&reauth=1$/);const nonce=h.opened[0].match(/request=([a-f0-9]{32})/)[1];h.handlers.message({origin:'https://tealabhokkaido.com',source:h.popup,data:{type:'TLH_INVENTORY_LOGIN_RESULT',nonce,code:'OK',idToken:'fixture.jwt.proof'}});await done;assert.equal(h.reads,0);assert.equal(h.sent.length,0);}
});

test('registration success requests one self-overview refresh while unknown and forged results do not',async()=>{const h=harness();await h.login();h.create();h.reply('REGISTRATION_UNAVAILABLE');assert.equal(h.refreshes,0);h.reply('CREATED',{nonce:'0'.repeat(32)});assert.equal(h.refreshes,0);h.reply('CREATED');assert.equal(h.refreshes,1);assert.equal(h.reads,0);});

test('closed signup directs to administrator and never suggests workforce invitation as an alternative',async()=>{const h=harness();await h.login();h.create();h.reply('SIGNUP_CLOSED');assert.match(h.n('account-create-status').textContent,/管理者/);assert.doesNotMatch(h.n('account-create-status').textContent,/招待コードがある方/);assert.equal(h.refreshes,0);});

test('signup appears only after verified unregistered, never existing, loading or error; detail read is explicit',async()=>{
 for(const [overviewData,overviewState] of [[{operatingRoles:[]},undefined],[null,undefined],[null,'error']]){const h=harness({overviewData,overviewState});await h.login();if(overviewData===null&&overviewState===undefined)h.verify(null);assert.equal(h.n('account-signup').hidden,true);h.create();assert.equal(h.sent.length,0);h.verify(null,'not_registered');assert.equal(h.n('account-signup').hidden,false);h.verify({operatingRoles:[]});assert.equal(h.n('account-signup').hidden,true);}
 const h=harness();await h.login();assert.equal(h.reads,0);h.n('account-details').open=true;h.n('account-details').events.toggle();assert.equal(h.reads,1);
});

test('initial overview precedes exactly one scoped read only for relevant managers, with no legacy fanout',async()=>{
 for(const [role,serviceId,expected] of [['ORGANIZATION_OPERATOR','',1],['STORE_SERVICE_ADMIN','INVENTORY',1],['STORE_SERVICE_ADMIN','WORKFORCE',0],['PLATFORM_OPERATOR','',0]]){const h=harness({overviewData:{operatingRoles:[{role,serviceId,effective:true}]}});await h.login();assert.equal(h.overviewReads,1);assert.equal(h.scopeReads,expected);assert.equal(h.reads,0);assert.equal(h.sent.length,0);}
});

test('automatic scope blocked or pending terminates in retryable error rather than eternal loading',async()=>{const h=harness({scopeStarted:false,overviewData:{operatingRoles:[{role:'ORGANIZATION_OPERATOR',effective:true}]}});await h.login();assert.equal(h.scopeReads,1);assert.deepEqual(h.managementStates.at(-1),{state:'error',source:'overview'});h.verify(null);h.verify({operatingRoles:[{role:'ORGANIZATION_OPERATOR',effective:true}]});assert.equal(h.scopeReads,2);assert.deepEqual(h.managementStates.at(-1),{state:'error',source:'overview'});});

test('activation unknown blocks signup, sibling forms and cross-app navigation',async()=>{const h=harness({activationBusy:true});await h.login();h.create();assert.equal(h.sent.length,0);assert.equal(h.window.TlhAccountNavigation.canLeave(),false);assert.equal(h.n('common-lock').disabled,true);assert.equal(h.n('grant-lock').disabled,true);});


test('failed registration read replaces loading text; app navigation stays out of unknown state',async()=>{const h=harness({overviewState:'error'});await h.login();assert.match(h.n('account-status').textContent,/確認できませんでした/);assert.doesNotMatch(h.n('account-status').textContent,/確認しています/);assert.equal(h.n('account-apps').hidden,true);h.verify({operatingRoles:[]});assert.equal(h.n('account-apps').hidden,true);const u=harness({overviewData:{operatingRoles:[]},activationBusy:true});await u.login();assert.equal(u.n('account-apps').hidden,true);assert.equal(u.window.TlhAccountNavigation.canLeave(),false);});
test('success destination precedes secondary invitation and management errors are optional',()=>{assert.ok(html.indexOf('id="activation-open"')<html.indexOf('id="activation-cancel"'));assert.match(html,/id="activation-open" class="activation-primary-link"/);assert.match(html,/<details id="account-management-details"><summary>管理情報を読み込めませんでした（再確認）<\/summary>/);assert.ok(html.indexOf('id="account-management-details"')>html.indexOf('id="activation-code"'));assert.match(html,/<details id="account-apps" hidden><summary>サービス管理<\/summary>/);});

test('self read failure has one explicit retry and checking spinner; unknown saves block retry',async()=>{const h=harness({overviewState:'error'});await h.login();assert.equal(h.n('account-read-retry').hidden,false);assert.equal(h.n('account-status').attributes['aria-busy'],'false');h.n('account-read-retry').events.click();assert.equal(h.refreshes,1);h.verify(null);assert.equal(h.n('account-read-retry').hidden,true);assert.equal(h.n('account-status').attributes['aria-busy'],'true');h.verify({operatingRoles:[]});assert.equal(h.n('account-read-retry').hidden,true);const u=harness({overviewState:'error',activationBusy:true});await u.login();u.n('account-read-retry').events.click();assert.equal(u.refreshes,0);assert.equal(u.n('account-read-retry').disabled,true);});

 test('personal purpose is presentation only and return waits for verified registration',async()=>{const h=harness({search:'?purpose=personal&service=INVENTORY'});assert.match(h.n('account-login-intro').textContent,/コードは不要/);assert.equal(h.n('account-personal-ready').hidden,true);await h.login();h.create();h.reply('CREATED');assert.equal(h.n('account-personal-ready').hidden,true);h.verify(null,'error');assert.equal(h.n('account-personal-ready').hidden,true);h.verify({operatingRoles:[]},'registered');assert.equal(h.n('account-personal-ready').hidden,false);assert.equal(h.n('account-personal-return').getAttribute('href'),'/software/inventory/');h.handlers.pagehide();assert.equal(h.n('account-personal-ready').hidden,true);});
 test('personal return cannot escape unknown registration or activation',async()=>{for(const activationBusy of [false,true]){const h=harness({search:'?purpose=personal&service=INVENTORY',activationBusy});await h.login();if(!activationBusy){h.create();h.reply('REGISTRATION_UNAVAILABLE');}let prevented=false;h.n('account-personal-return').events.click({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.n('account-personal-ready').hidden,true);}});
 test('unknown purpose and arbitrary return never change default invitation entry',()=>{for(const search of ['', '?purpose=company','?purpose=personal&return=https://evil.test','?purpose=personal&purpose=company']){const h=harness({search});assert.equal(h.n('account-login-intro').textContent,'');assert.equal(h.n('account-personal-ready').hidden,true);assert.equal(h.sent.length,0);}});
 test('personal closed signup remains closed and does not offer registered return',async()=>{const h=harness({search:'?purpose=personal&service=INVENTORY'});await h.login();h.create();h.reply('SIGNUP_CLOSED');assert.match(h.n('account-create-status').textContent,/受付停止中/);assert.equal(h.n('account-personal-ready').hidden,true);});

test('personal service hint uses only one reviewed safe catalog destination',async()=>{for(const path of ['//evil.test/','/\\evil.test/','/%2f/','/%5c/','/app/%0a/','/app/\n','https://evil.test/','/app/../']){const h=harness({search:'?purpose=personal&service=INVENTORY',catalog:[{serviceId:'INVENTORY',label:'在庫',path}],overviewData:{operatingRoles:[]},overviewState:'registered'});await h.login();assert.equal(h.n('account-personal-ready').hidden,true);assert.equal(h.n('account-personal-return').getAttribute('href'),null);}});
test('missing unknown duplicate or arbitrary service query cannot select a return URL',async()=>{for(const search of ['?purpose=personal','?purpose=personal&service=OTHER','?purpose=personal&service=INVENTORY&service=OTHER','?purpose=personal&purpose=personal','?purpose=personal&return=/software/inventory/']){const h=harness({search,overviewData:{operatingRoles:[]},overviewState:'registered'});await h.login();assert.equal(h.n('account-personal-ready').hidden,true);assert.equal(h.n('account-personal-return').getAttribute('href'),null);}const h=harness({search:'?purpose=personal&service=OTHER',catalog:[{serviceId:'OTHER',label:'別アプリ',path:'/another/app/'}],overviewData:{operatingRoles:[]},overviewState:'registered'});await h.login();assert.equal(h.n('account-personal-return').getAttribute('href'),'/another/app/');assert.equal(h.n('account-personal-ready').hidden,false);});

test('display-only service hint waits for registered explicit entry and ignores personal, unknown, duplicate queries',async()=>{for(const search of ['?service=inventory','?service=unknown','?service=inventory&service=worktime','?purpose=personal&service=INVENTORY']){const calls=[],serviceCategory={init(){return {busy:()=>false,verified(){},openService(id){calls.push(id);return true;}};}};const h=harness({search,serviceCategory,launchers:[{serviceId:'inventory',path:'/software/inventory/'}]});await h.login();h.n('account-request-entry').events.click();assert.equal(calls.length,0);h.verify({accountId:'actor',operatingRoles:[]});assert.equal(calls.length,0);h.n('account-tab-services').click=()=>{};h.n('account-request-entry').events.click();assert.deepEqual(calls,search==='?service=inventory'?['inventory']:[]);assert.equal(h.sent.length,0);}});

test('entry wording distinguishes inventory, personal and general intent without initiating auth',()=>{
 for(const [search,expected] of [['?service=inventory','店舗の在庫管理の利用手続き'],['','店舗アプリの利用手続き'],['?service=unreviewed','店舗アプリの利用手続き']]){
  const h=harness({search,launchers:[{serviceId:'inventory',path:'/software/inventory/'}]});assert.equal(h.n('activation-heading').textContent,expected);assert.equal(h.loginCalls,0);assert.equal(h.sent.length,0);
 }
 const h=harness({search:'?purpose=personal&service=INVENTORY'});assert.match(h.n('account-login-intro').textContent,/コードは不要/);assert.equal(h.n('account-request-entry').hidden,true);
 assert.match(html,/コードの内容を確認/);assert.match(html,/発行するコードの内容を確認/);assert.match(html,/まだ利用は確定しません/);
});
