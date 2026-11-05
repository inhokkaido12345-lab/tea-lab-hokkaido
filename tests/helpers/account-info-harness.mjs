/** Fake DOM/LINE/timers with actual UI and WebCrypto. Shared with linked real-GAS tests; no network. */
import vm from 'node:vm';import fs from 'node:fs';import {webcrypto,createHmac} from 'node:crypto';
export function sampleAccountInfo(){return{version:1,tlhAccountId:'usr_fixture',accountStatus:'ACTIVE',currentLoginProvider:'LINE',linkedProviders:['LINE'],
 employee:{employeeCode:'INFO001',name:'架空スタッフ',status:'ACTIVE',hireDate:'2026-01-01',terminationDate:''},permissions:{workforceEmployee:true,globalAdmin:false}};}
export function accountInfoHarness({proof='fake.jwt.proof',embedded=false,throwSubmit=false,inClient=false,loginFailure=false,bootstrap=false,loggedIn=true,initFailure=false,deferInit=false}={}){
 const nodes=new Map(),handlers={},listeners={},sent=[],timers=new Map(),loginCalls=[],navigations=[];let timer=0,logoutCalls=0,completeInit;
 const initPromise=new Promise(resolve=>{completeInit=resolve;});
 function el(){return{value:'',textContent:'',hidden:false,disabled:false,children:[],events:{},contentWindow:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){this.children=[];},
  appendChild(child){this.children.push(child);},addEventListener(type,fn){this.events[type]=fn;},remove(){},submit(){if(throwSubmit)throw Error('submit');sent.push(Object.fromEntries(this.children.map(c=>[c.name,c.value])));}};}
 const n=k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k);};
 const window={location:{origin:'https://tealabhokkaido.com',pathname:'/workforce/account-info.html',assign:u=>navigations.push(u)},addEventListener(type,fn){(listeners[type]??=[]).push(fn);handlers[type]=(...args)=>Promise.all(listeners[type].map(listener=>listener(...args)));}};window.top=embedded?{}:window;
 window.liff={init:()=>initFailure?Promise.reject(Error('fixture init failure')):deferInit?initPromise:Promise.resolve(),getIDToken:()=>proof,isInClient:()=>inClient,isLoggedIn:()=>loggedIn,logout(){logoutCalls++;},login(p){loginCalls.push(p);if(loginFailure)throw Error('fixture login failure');}};
 vm.runInNewContext(fs.readFileSync(new URL('../../workforce/auto-read.js',import.meta.url),'utf8'),{window});
 const source=fs.readFileSync(new URL('../../workforce/account-info.js',import.meta.url),'utf8');
 vm.runInNewContext(source,{window,crypto:webcrypto,Uint8Array,TextEncoder,Date,document:{currentScript:bootstrap?{dataset:{bootstrap:'true'}}:null,getElementById:id=>n(id.replace('account-info-','')),createElement:el,body:el()},
  setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout(id){timers.delete(id);}});
 if(!bootstrap)window.TlhAccountInfo.init({gasUrl:window.TlhAccountInfo.config.gasUrl,liff:window.liff});
 async function receive(data,event={}){await handlers.message({source:{parent:n('frame').contentWindow},origin:'null',data,...event});}
 async function reply(r,code='ACCOUNT_INFO_READY',info=sampleAccountInfo(),patch={},event={}){
  const data={type:'TLH_BRIDGE_ACCOUNT_INFO',nonce:r.nonce,action:r.action,code,info:code==='ACCOUNT_INFO_READY'?JSON.stringify(info):''};
  data.mac=createHmac('sha256',r.responseKey).update([data.type,data.nonce,data.action,data.code,data.info].join('\n')).digest('hex');await receive({...data,...patch},event);
 }
 return{n,window,sent,timers,handlers,receive,reply,source,loginCalls,navigations,completeInit,logoutCalls:()=>logoutCalls,login:()=>n('login').events.click(),click:()=>n('check').events.click()};
}
