/** Fake DOM/LINE/transport with actual read-only UI and real WebCrypto; reusable by private integration tests. */
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export const sampleReview=()=>({version:1,asOf:'2026-01-01',source:'OWNER_STATEMENT_UNVERIFIED',reviewStatus:'URGENT_ACTION_REQUIRED',urgentCount:1,statutoryCalculationReady:false,timeRecordingMustRemainAvailable:true,
 issues:[{id:'TEST_SETTING',priority:'URGENT',state:'UNCONFIRMED',title:'架空設定：至急確定',action:'架空の資料を確認',completionEvidence:'確認した資料と決定内容'}]});
export function laborPolicyHarness(){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let tick=0;
 const el=()=>({children:[],events:{},textContent:'',hidden:false,disabled:false,contentWindow:{},replaceChildren(){this.children=[];},appendChild(node){this.children.push(node);},addEventListener(k,fn){this.events[k]=fn;},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}});
 const n=k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k);};
 const window={addEventListener(k,fn){handlers[k]=fn;}};window.top=window;
 const source=fs.readFileSync(new URL('../../workforce/labor-policy.js',import.meta.url),'utf8');vm.runInNewContext(source,{window,Date,crypto:webcrypto,Uint8Array,TextEncoder,
 document:{getElementById:id=>n(id.replace('labor-policy-','')),createElement:el,body:el()},setTimeout(fn){timers.set(++tick,fn);return tick;},clearTimeout(id){timers.delete(id);}});
 const api=window.TlhLaborPolicy.init({gasUrl:'https://offline.invalid',liff:{getIDToken:()=> 'fake.jwt.proof'}});
 async function receive(data,event={}){await handlers.message({source:{parent:n('frame').contentWindow},origin:'null',data,...event});}
 async function reply(r,code='LABOR_POLICY_READY',review=sampleReview(),patch={},event={}){const d={type:'TLH_BRIDGE_LABOR_POLICY',nonce:r.nonce,action:r.action,code,review:code==='LABOR_POLICY_READY'?JSON.stringify(review):''};d.mac=createHmac('sha256',r.responseKey).update([d.type,d.nonce,d.action,d.code,d.review].join('\n')).digest('hex');await receive({...d,...patch},event);}
 return{api,n,sent,timers,handlers,receive,reply,source,click:()=>n('check').events.click()};
}
