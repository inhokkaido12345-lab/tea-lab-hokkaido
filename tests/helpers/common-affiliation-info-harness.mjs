import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const source=fs.readFileSync(new URL('../../workforce/common-affiliation-info.js',import.meta.url),'utf8');
export const data=()=>({version:1,account:{accountId:'usr_other',status:'ACTIVE',linkedProviders:['LINE']},memberships:[],readAtUtc:'2026-11-17T05:00:00.000Z',authorityRevision:'a'.repeat(64)});
export function infoHarness(){const nodes=new Map(),handlers={},timers=new Map(),sent=[];let seq=0,proof='other.jwt.proof';
 const el=()=>({children:[],events:{},attributes:{},textContent:'',contentWindow:{},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);},addEventListener(k,v){this.events[k]=v;},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(x=>[x.name,x.value])));}});
 const n=id=>{if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);};const window={addEventListener(k,v){handlers[k]=v;}};window.top=window;
 vm.runInNewContext(source,{window,document:{getElementById:id=>n(id.replace('common-self-','')),createElement:el,body:el()},crypto:webcrypto,TextEncoder,Uint8Array,Date,setTimeout(f){timers.set(++seq,f);return seq;},clearTimeout(k){timers.delete(k);}});
 const api=window.TlhCommonAffiliationInfo.init({gasUrl:'https://script.google.com/macros/s/mock/exec',liff:{getIDToken:()=>proof}});
 function signed(code='COMMON_AFFILIATION_READY',dto=data()){const r=sent.at(-1),d={type:'TLH_COMMON_AFFILIATION_V1',phase:'READ_SELF',nonce:r.nonce,code,data:code==='COMMON_AFFILIATION_READY'?JSON.stringify(dto):''};d.mac=createHmac('sha256',r.responseKey).update([d.type,d.phase,d.nonce,d.code,d.data].join('\n')).digest('hex');return d;}
 const deliver=(d,event={})=>handlers.message({origin:'https://script.google.com',source:n('frame').contentWindow,data:d,...event});
 return {api,n,handlers,timers,sent,signed,deliver,setProof:v=>{proof=v;},parse:window.TlhCommonAffiliationInfo.parse};
}
