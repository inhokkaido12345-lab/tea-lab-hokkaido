import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const uiSource=fs.readFileSync(new URL('../../account/common-affiliation.js',import.meta.url),'utf8');
export function uiHarness(){const nodes=new Map(),handlers={},sent=[],timers=new Map();let seq=0,blocked=false;
 const element=()=>({value:'',textContent:'',hidden:false,disabled:false,children:[],events:{},attributes:{},contentWindow:{},
 setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.events[k]=v;},appendChild(n){this.children.push(n);},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}});
 const n=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const window={addEventListener(k,v){handlers[k]=v;}};window.top=window;
 vm.runInNewContext(uiSource,{window,document:{getElementById:n,createElement:element,body:element()},crypto:webcrypto,TextEncoder,Uint8Array,setTimeout(f){timers.set(++seq,f);return seq;},clearTimeout(k){timers.delete(k);}});
 const api=window.TlhCommonAffiliation.init({gasUrl:'https://script.google.com/macros/s/mock/exec',liff:{getIDToken:()=> 'company.jwt.proof'},blocked:()=>blocked});
 const act=(id,kind='click')=>n('common-'+id).events[kind]({preventDefault(){}});
 const tick=()=>new Promise(r=>setTimeout(r,10));
 function signed(code,data='',overrides={}){const r=sent.at(-1),d={type:'TLH_COMMON_AFFILIATION_INVITE_V1',phase:r.phase,command:r.command,nonce:r.nonce,code,data:typeof data==='string'?data:JSON.stringify(data),...overrides};d.mac=createHmac('sha256',r.responseKey).update([d.type,d.phase,d.command,d.nonce,d.code,d.data].join('\n')).digest('hex');return d;}
 const deliver=(d,event={})=>handlers.message({origin:'https://script.google.com',source:n('common-frame').contentWindow,data:d,...event});
 const summary={organizationId:'orgA',storeId:'storeA',serviceId:'INVENTORY',permissions:[],employmentCreated:false};
 async function issue(){n('common-org').value='orgA';n('common-store').value='storeA';n('common-service').value='INVENTORY';act('issue-form','submit');await tick();}
 async function preview(){await deliver(signed('COMMON_INVITATION_PREVIEW_READY',{code:'COMMON_INVITATION_PREVIEW_READY',revision:'d'.repeat(64),summary}));}
 return {n,act,api,handlers,sent,timers,tick,issue,preview,deliver,signed,summary,setBlocked:v=>{blocked=v;}};
}
