import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const source=fs.readFileSync(new URL('../../account/common-grants.js',import.meta.url),'utf8');
export function grantUi(onSuccess=()=>{}){const nodes=new Map(),handlers={},sent=[],timers=new Map();let seq=0,blocked=false;
 const el=()=>({value:'',checked:false,children:[],events:{},attributes:{},textContent:'',disabled:false,hidden:false,contentWindow:{},setAttribute(k,v){this.attributes[k]=v;},appendChild(v){this.children.push(v);},addEventListener(k,v){this.events[k]=v;},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(x=>[x.name,x.value])));}});
 const n=id=>{if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);};const prompts=[];const window={confirm:text=>{prompts.push(text);return true;},addEventListener(k,v){handlers[k]=v;}};window.top=window;
 vm.runInNewContext(source,{window,document:{getElementById:id=>n(id.replace('grant-','')),createElement:el,body:el()},crypto:webcrypto,TextEncoder,Uint8Array,Date,setTimeout(f){timers.set(++seq,f);return seq;},clearTimeout(k){timers.delete(k);}});
 const api=window.TlhCommonGrants.init({onSuccess,gasUrl:'https://script.google.com/macros/s/mock/exec',liff:{getIDToken:()=> 'company.jwt.proof'},blocked:()=>blocked});
 const act=(id,kind='click')=>n(id).events[kind]({preventDefault(){}});
 const summary=()=>({accountId:'usr_admin',organizationId:'orgA',storeId:'storeA',serviceId:'INVENTORY',beforePermissions:['inventory.read'],afterPermissions:['inventory.read','inventory.receive'],employmentChanged:false,operationsRolesChanged:false,serviceActivationChanged:false});
 function begin(empty=false){n('account').value='usr_admin';n('org').value='orgA';n('store').value='storeA';n('reason').value='管理者による明示変更';n('read').checked=!empty;n('receive').checked=!empty;act('form','submit');}
 function signed(code,dto,request=sent.at(-1)){const d={type:'TLH_COMMON_AFFILIATION_GRANT_V1',phase:request.phase,command:request.command,nonce:request.nonce,code,data:dto?JSON.stringify(dto):''};d.mac=createHmac('sha256',request.responseKey).update([d.type,d.phase,d.command,d.nonce,d.code,d.data].join('\n')).digest('hex');return d;}
 const deliver=(d,event={})=>handlers.message({origin:'https://script.google.com',source:n('frame').contentWindow,data:d,...event});
 const preview=()=>deliver(signed('COMMON_GRANTS_PREVIEW_READY',{code:'COMMON_GRANTS_PREVIEW_READY',revision:'d'.repeat(64),summary:summary()}));
 return {n,api,prompts,window,handlers,sent,timers,signed,deliver,act,begin,preview,summary,setBlocked:v=>{blocked=v;}};
}
