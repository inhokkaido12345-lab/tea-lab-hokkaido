/** 試験専用：実controllerと架空DOM/LIFF。通信・Storage・実データは使用禁止。連結試験も利用する。 */
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const catalog=(view='PLATFORM')=>({version:1,revision:1,view,permissions:{platform:view==='PLATFORM',bootstrap:false,organizationIds:view==='COMPANY'?['orgA']:[]},
 organizations:[{organizationId:'orgA',name:'架空A社'}],stores:[{organizationId:'orgA',storeId:'storeA',name:'架空A店',services:['WORKFORCE','INVENTORY','POS'].map(serviceId=>({serviceId,state:'NOT_CONNECTED',canLaunch:false}))}],grants:[],businessAuthorityConnected:false,remainingOperations:1999});
export function operationsUi({view='PLATFORM',loginRequired=false,token='admin.jwt.proof'}={}){
 const source=fs.readFileSync(new URL('../../workforce/operations.js',import.meta.url),'utf8'),nodes={},events={},sent=[],timers=new Map(),logins=[];let seq=0;
 function node(tag='div'){return {tag,children:[],events:{},attributes:{},textContent:'',value:'',disabled:false,hidden:false,contentWindow:{},
  addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},
  replaceChildren(){this.children=[];this.value='';},appendChild(n){this.children.push(n);if(this.tag==='select'&&this.children.length===1)this.value=n.value??'';},remove(){},
  submit(){sent.push(Object.fromEntries(this.children.map(x=>[x.name,x.value])));}};}
 const html=fs.readFileSync(new URL('../../workforce/'+(view==='PLATFORM'?'platform':'company')+'-operations.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/<([a-z]+)\b[^<>]*\bid="([^"]+)"[^<>]*>/g))nodes[m[2]]=node(m[1]);
 nodes['ops-enabled'].value='true';nodes['ops-service'].value='WORKFORCE';
 const c={crypto:webcrypto,Uint8Array,TextEncoder,URL,location:{origin:'https://tealabhokkaido.com',pathname:'/workforce/platform-operations.html'},
 document:{currentScript:null,getElementById:id=>nodes[id],createElement:node,body:{appendChild(){}}},
 addEventListener(k,f){(events[k]||=[]).push(f);},setTimeout(f){const id=++seq;timers.set(id,f);return id;},clearTimeout:id=>timers.delete(id),
 fetch(){throw Error('NO_NETWORK');},console:new Proxy({},{get(){throw Error('NO_LOG');}}),localStorage:new Proxy({},{get(){throw Error('NO_STORAGE');}})};
 c.window=c;c.top=c;vm.runInNewContext(source,c);
 const liff={getIDToken:()=>token,isLoggedIn:()=>!loginRequired,logout(){logins.push('logout');},login:o=>logins.push(o)};
 c.TlhOperations.init({view,liff,loginRequired});
 const n=k=>nodes['ops-'+k],click=k=>{if(!n(k).disabled&&!n(k).hidden)n(k).events.click?.();};
 async function deliverRaw(data,{origin='null',source=n('frame').contentWindow}={}){for(const f of events.message||[])await f({data,origin,source});}
 async function reply(r,code,payload,revision='',patch={},event={}){const d={type:'TLH_OPERATIONS_REPLY_V1',action:'bridgeOperationsV1',nonce:r.nonce,phase:r.phase,command:r.command,code,revision,payload:JSON.stringify(payload),mac:''};
 d.mac=createHmac('sha256',r.responseKey).update(JSON.stringify([d.type,d.action,d.nonce,d.phase,d.command,d.code,d.revision,d.payload])).digest('hex');await deliverRaw({...d,...patch},event);return d;}
 return{c,api:c.TlhOperations,n,nodes,sent,timers,logins,click,reply,deliverRaw,view,
  async ready(data=catalog(view)){await reply(sent[0],'OPERATIONS_READY',data);},
  choose(command){n('command').value=command;n('command').events.change();},
  set(values){for(const [k,v]of Object.entries(values))n(k).value=v;},
  timeout(){for(const f of [...timers.values()])f();},depart(){for(const f of events.pagehide||[])f();}};
}
