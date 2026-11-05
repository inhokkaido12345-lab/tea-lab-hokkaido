/** Fake DOM/LINE with actual controller and WebCrypto; no real roster or network. Also used by linked GAS tests. */
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const sampleOverview=()=>({version:1,employees:[{employeeCode:'DIR001',employeeName:'架空社員',status:'ACTIVE'}],pendingCount:2});
export function adminOverviewHarness({autoLoad=true}={}){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let tick=0,refreshAllowed=true;
 const el=()=>({children:[],events:{},textContent:'',value:'',attributes:{},hidden:false,disabled:false,contentWindow:{},get options(){return this.children;},
 setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){this.children=[];this.value='';},appendChild(n){this.children.push(n);},addEventListener(k,fn){this.events[k]=fn;},dispatchEvent(e){this.events[e.type]?.(e);},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}});
 const n=k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k);};const badges=[el(),el(),el()];
 const window={addEventListener(k,fn){handlers[k]=fn;}};window.top=window;
 const source=fs.readFileSync(new URL('../../workforce/admin-overview.js',import.meta.url),'utf8');vm.runInNewContext(source,{window,Date,crypto:webcrypto,Uint8Array,TextEncoder,Event,
 document:{getElementById:id=>n(id.replace('admin-overview-','')),querySelectorAll:()=>badges,createElement:el,body:el()},setTimeout(fn){timers.set(++tick,fn);return tick;},clearTimeout(id){timers.delete(id);}});
 const api=window.TlhAdminOverview.init({gasUrl:'https://offline.invalid',liff:{getIDToken:()=> 'fake.jwt.proof'},autoLoad,select:n('select'),canRefresh:()=>refreshAllowed});
 async function receive(data,event={}){await handlers.message({source:{parent:n('frame').contentWindow},origin:'null',data,...event});}
 async function reply(r,code='ADMIN_OVERVIEW_READY',review=sampleOverview(),patch={},event={}){const d={type:'TLH_BRIDGE_ADMIN_OVERVIEW',nonce:r.nonce,action:r.action,code,review:code==='ADMIN_OVERVIEW_READY'?JSON.stringify(review):''};d.mac=createHmac('sha256',r.responseKey).update([d.type,d.nonce,d.action,d.code,d.review].join('\n')).digest('hex');await receive({...d,...patch},event);}
 return{api,n,badges,sent,timers,handlers,receive,reply,source,click:()=>n('check').events.click(),lockRefresh:()=>{refreshAllowed=false;}};
}
