/** Fake DOM/LINE/timers with actual UI and WebCrypto. Shared with linked real-GAS tests; no network. */
import vm from 'node:vm';import fs from 'node:fs';import {webcrypto,createHmac} from 'node:crypto';
export function sampleAccountInfo(){return{version:1,tlhAccountId:'usr_fixture',accountStatus:'ACTIVE',currentLoginProvider:'LINE',linkedProviders:['LINE'],
 employee:{employeeCode:'INFO001',name:'架空スタッフ',status:'ACTIVE',hireDate:'2026-01-01',terminationDate:''},permissions:{workforceEmployee:true,globalAdmin:false}};}
export function accountInfoHarness({proof='fake.jwt.proof',embedded=false,throwSubmit=false}={}){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let timer=0;
 function el(){return{value:'',textContent:'',hidden:false,disabled:false,children:[],events:{},contentWindow:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){this.children=[];},
  appendChild(child){this.children.push(child);},addEventListener(type,fn){this.events[type]=fn;},remove(){},submit(){if(throwSubmit)throw Error('submit');sent.push(Object.fromEntries(this.children.map(c=>[c.name,c.value])));}};}
 const n=k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k);};
 const window={addEventListener(type,fn){handlers[type]=fn;}};window.top=embedded?{}:window;
 const source=fs.readFileSync(new URL('../../workforce/account-info.js',import.meta.url),'utf8');
 vm.runInNewContext(source,{window,crypto:webcrypto,Uint8Array,TextEncoder,Date,document:{currentScript:null,getElementById:id=>n(id.replace('account-info-','')),createElement:el,body:el()},
  setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout(id){timers.delete(id);}});
 window.TlhAccountInfo.init({gasUrl:window.TlhAccountInfo.config.gasUrl,liff:{getIDToken:()=>proof}});
 async function receive(data,event={}){await handlers.message({source:{parent:n('frame').contentWindow},origin:'null',data,...event});}
 async function reply(r,code='ACCOUNT_INFO_READY',info=sampleAccountInfo(),patch={},event={}){
  const data={type:'TLH_BRIDGE_ACCOUNT_INFO',nonce:r.nonce,action:r.action,code,info:code==='ACCOUNT_INFO_READY'?JSON.stringify(info):''};
  data.mac=createHmac('sha256',r.responseKey).update([data.type,data.nonce,data.action,data.code,data.info].join('\n')).digest('hex');await receive({...data,...patch},event);
 }
 return{n,window,sent,timers,handlers,receive,reply,source,click:()=>n('check').events.click()};
}
