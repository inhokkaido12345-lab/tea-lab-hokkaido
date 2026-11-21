import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto as crypto,createHmac} from 'node:crypto';
const root=new URL('../',import.meta.url),origin='https://tealabhokkaido.com',entry='/account/',preview='/account/line-preview/',callback='/software/worktime/inventory/auth/account-return/';
const proof='test.header.proof',key='tlh.account.line.v1',testKey='tlh.account.line.preview.v1';
const load=p=>fs.readFileSync(new URL(p.replace(/^\//,''),root),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function page(url,{storage=new Map(),trial=false,liff={},ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',mode='browser',badFrame=false,skipSet=false,checks=false}={}){
 let target=new URL(url,origin),scripts=[],forms=[],handlers={},navigation=[],shown=false,sdkCalls=0,popups=0,logout=0;
 const element=()=>({textContent:'',hidden:true,disabled:false,children:[],events:{},appendChild(n){this.children.push(n);},remove(){},addEventListener(k,f){this.events[k]=f;}});
 const names=new Map();const get=id=>{if(!names.has(id))names.set(id,element());return names.get(id);};const frame=get('preview-frame');frame.name='tlhAccountAccessOverviewFrame';frame.contentWindow={};
 const body=element();body.removeAttribute=()=>{shown=true;};
 const doc={body,currentScript:{dataset:trial?{preview:'true'}:{}},getElementById:get,createElement(tag){const el=element();if(tag==='form')el.submit=()=>forms.push(Object.fromEntries(el.children.map(f=>[f.name,f.value])));return el;}};
 const events=(k,...args)=>Promise.all((handlers[k]||[]).map(f=>f(...args)));
 const window={crypto,location:{get pathname(){return target.pathname;},get origin(){return target.origin;},get search(){return target.search;},assign(s){navigation.push(s);}},
  history:{replaceState(_a,_b,p){target=new URL(p,origin);}},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(!skipSet)storage.set(k,v);},removeItem:k=>storage.delete(k)},
  navigator:{userAgent:ua,maxTouchPoints:0},matchMedia:q=>({matches:q==='(display-mode: '+mode+')'}),
  TlhInventoryLogin:{clearToken(){},getToken:()=>null,login(){popups++;}},
  setTimeout:()=>1,clearTimeout(){},addEventListener:(k,f)=>(handlers[k]||=[]).push(f),open:()=>assert.fail('must not use a new window'),
  liff:{init:async()=>{sdkCalls++;},isLoggedIn:()=>true,isInClient:()=>false,logout(){logout++;},login(o){navigation.push(o.redirectUri);},getIDToken:()=>proof,...liff}};
 window.top=badFrame?{}:window;const context={window,document:doc,URLSearchParams,Uint8Array,TextEncoder,crypto};
 const run=p=>{scripts.push(p);vm.runInNewContext(load(p),context);};
 run('account/line-login.js');if(checks)for(const p of ['workforce/account-info.js','account/access-overview.js','account/line-preview/check.js'])run(p);
 const verified=(r,{code='ACCOUNT_ACCESS_OVERVIEW_READY',data='',good=true,source=frame.contentWindow}={})=>{
  const d={type:'TLH_ACCOUNT_ACCESS_OVERVIEW_V1',phase:'READ_SELF',nonce:r.nonce,code,data};
  d.mac=good?createHmac('sha256',r.responseKey).update(Object.values(d).join('\n')).digest('hex'):'a'.repeat(64);
  return events('message',{source,origin:'https://script.google.com',data:d});
 };
 return {api:window.TlhAccountLogin,forms,storage,events,navigation,visible:()=>shown,get,verified,get sdkCalls(){return sdkCalls;},get popups(){return popups;},get logout(){return logout;},get path(){return target.pathname+target.search;}};
}
test('two-stage same-tab return restores only known signup/invite hints and never stores the proof',async()=>{
 for(const [q,result] of [['?service=inventory','?service=inventory'],['?purpose=personal&service=INVENTORY','?purpose=personal&service=INVENTORY'],['?service=worktime','?service=worktime'],['?service=inventory&invite=very-secret&return=https://else.invalid','']]){
  const a=page(entry+q);a.api.clearToken();assert.equal(await a.api.login(),'redirecting');
  assert.equal(new URL(a.navigation[0]).pathname,callback);
  assert.deepEqual([...new URL(a.navigation[0]).searchParams.keys()],['request']);
  assert.equal(a.popups,0);await assert.rejects(a.api.login(),/ACCOUNT_LOGIN_BUSY/);
  assert.ok(!a.storage.get(key).includes('very-secret'));
  const start=page(a.navigation[0],{storage:a.storage});assert.equal(await start.api.resume(),'redirecting');assert.equal(start.logout,1);assert.equal(start.navigation[0],a.navigation[0]);
  const back=page(start.navigation[0]+'&code=sentinel-line-code&state=sentinel',{storage:a.storage});
  assert.equal(await back.api.resume(),'ready');assert.equal(back.path,entry+result);assert.equal(back.api.getToken(),proof);assert.equal(a.storage.has(key),false);
  assert.equal(await page(start.navigation[0],{storage:a.storage}).api.resume(),'failed');
  await back.events('pagehide');assert.equal(back.api.getToken(),null);
 }
});
test('unverified mobile/standalone/LINE-in-app stay on legacy broker; storage does not fake success',async()=>{
 for(const options of [{ua:'Android Mobile'},{ua:'Windows NT Line/15'},{mode:'standalone'},{mode:'minimal-ui'},{ua:'unknown'}]){
  const f=page(entry,options);assert.equal(f.api.usePopup,true);await f.api.login();assert.equal(f.popups,1);assert.equal(f.navigation.length,0);
 }
 const blocked=page(entry,{skipSet:true});await assert.rejects(blocked.api.login(),/ACCOUNT_LOGIN_UNAVAILABLE/);assert.equal(blocked.navigation.length,0);
});
test('cancellation known correct intent, wrong page/duplicate/frame/replay never authenticate',async()=>{
 const a=page(entry+'?service=inventory');await a.api.login();const url=a.navigation[0];
 for(const b of [page(url),page(url+'&request='+'a'.repeat(32),{storage:a.storage}),page(url,{storage:a.storage,badFrame:true}),page(url.replace(origin,'https://other.invalid'),{storage:a.storage})]){
  assert.equal(await b.api.resume(),'failed');assert.equal(b.sdkCalls,0);assert.equal(b.api.getToken(),null);
 }
 const c=page(url+'&error=cancelled',{storage:a.storage});assert.equal(await c.api.resume(),'failed');assert.equal(c.api.retryPath(),entry+'?service=inventory');assert.equal(a.storage.has(key),false);
});
test('preview authenticates only its own request and sends one signed read with no identity visibility or writes',async()=>{
 const a=page(preview+'?purpose=personal&service=INVENTORY',{trial:true,checks:true});assert.equal(a.forms.length,0);await a.get('preview-login').events.click();
 const first=page(a.navigation[0],{trial:true,checks:true,storage:a.storage});await tick();assert.equal(first.forms.length,0);
 const ret=page(first.navigation[0]+'&code=synthetic',{trial:true,checks:true,storage:a.storage});await tick();
 assert.equal(ret.path,preview+'?purpose=personal&service=INVENTORY');assert.equal(ret.visible(),true);assert.equal(ret.forms.length,1);assert.equal(ret.get('preview-intent').textContent,'個人での在庫利用');
 const [r]=ret.forms;assert.equal(r.action,'bridgeAccountAccessOverviewV1');assert.equal(r.phase,'READ_SELF');
 assert.deepEqual(Object.keys(r).sort(),['action','idToken','nonce','phase','responseKey']);
 const payload=JSON.stringify({version:1,accountId:'private-reader-id',organizations:[],operatingRoles:[],personalInventory:{applicationAccess:'NOT_VERIFIED',reason:'ADAPTER_NOT_QUERIED'},authorityRevision:'b'.repeat(64),checkedAtUtc:'2026-11-21T00:00:00Z'});
 await ret.verified(r,{data:payload,good:false});await ret.verified(r,{data:payload,source:{}});
 assert.doesNotMatch(ret.get('preview-status').textContent,/確認できました/);
 await ret.verified(r,{data:payload});assert.match(ret.get('preview-status').textContent,/LINEログインとアカウントの読み取りを確認できました/);
 assert.doesNotMatch(ret.get('preview-status').textContent,/private/);
 assert.equal(a.storage.has(testKey),false);assert.equal(ret.forms.length,1);
});
