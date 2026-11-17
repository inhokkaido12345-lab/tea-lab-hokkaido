import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const uiSource=fs.readFileSync(new URL('../../account/service-activation.js',import.meta.url),'utf8');
export function uiHarness({clipboard,onSuccess=()=>{},registrationState='registered',singleRegistration=false,services=null,managementLabels=null,onRegister=()=>{}}={}){const nodes=new Map(),handlers={},sent=[],timers=new Map();let seq=0,blocked=false,registration=registrationState,proof='company.jwt.proof';
 const element=()=>({value:'',textContent:'',hidden:false,disabled:false,children:[],events:{},attributes:{},contentWindow:{},
 setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.events[k]=v;},replaceChildren(){this.children=[];},appendChild(n){this.children.push(n);},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}});
 const n=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const window={navigator:{clipboard},addEventListener(k,v){handlers[k]=v;}};window.top=window;if(managementLabels)window.TlhManagementPicker={init:()=>({sync(){},label:(kind,id)=>managementLabels[kind]?managementLabels[kind]+'（'+id+'）':id})};
 vm.runInNewContext(uiSource,{window,document:{getElementById:n,createElement:element,body:element()},crypto:webcrypto,TextEncoder,Uint8Array,setTimeout(f){timers.set(++seq,f);return seq;},clearTimeout(k){timers.delete(k);}});
 vm.runInNewContext(fs.readFileSync(new URL('../../account/activation-services.js',import.meta.url),'utf8'),{window});
 const api=window.TlhServiceActivation.init({singleRegistration,onSuccess,onRegister,registrationState:()=>registration,services:services||window.TlhActivationServices,gasUrl:'https://script.google.com/macros/s/mock/exec',liff:{getIDToken:()=>proof},blocked:()=>blocked});
 const act=(id,kind='click')=>n('activation-'+id).events[kind]({preventDefault(){}});
 const tick=()=>new Promise(r=>setTimeout(r,10));
 function signed(code,data='',overrides={}){const r=sent.at(-1),d={type:'TLH_COMMON_SERVICE_ACTIVATION_V2',phase:r.phase,command:r.command,nonce:r.nonce,code,data:typeof data==='string'?data:JSON.stringify(data),...overrides};d.mac=createHmac('sha256',r.responseKey).update([d.type,d.phase,d.command,d.nonce,d.code,d.data].join('\n')).digest('hex');return d;}
 const deliver=(d,event={})=>handlers.message({origin:'https://script.google.com',source:n('activation-frame').contentWindow,data:d,...event});
 const summary={organizationId:'orgA',organizationName:'架空会社',storeId:'storeA',storeName:'架空店舗',serviceId:'INVENTORY',permissions:['inventory.read','inventory.receive'],employmentCreated:false,validityMinutes:30,addedPermissions:['inventory.read','inventory.receive'],unchangedPermissions:[]};
 async function issue(selected=['inventory.read','inventory.receive']){n('activation-org').value='orgA';n('activation-store').value='storeA';n('activation-service').value='INVENTORY';n('activation-permissions').children.forEach((l,i)=>{l.children[0].checked=selected.includes(['inventory.read','inventory.receive','inventory.order','inventory.manage'][i]);});const before=sent.length;act('issue-form','submit');for(let i=0;i<100&&api.busy()&&sent.length===before;i++)await tick();}
 async function preview(){await deliver(signed('COMMON_ACTIVATION_PREVIEW_READY',{code:'COMMON_ACTIVATION_PREVIEW_READY',revision:'d'.repeat(64),summary}));}
 return {setRegistration:v=>{registration=v;api.syncRegistration();},setProof:v=>{proof=v;},n,act,api,handlers,sent,timers,tick,issue,preview,deliver,signed,summary,setBlocked:v=>{blocked=v;}};
}
