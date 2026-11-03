/** 実一覧controllerを架空DOM/LINE/通信と実WebCryptoで動かす。外部送信しない。 */
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export function pendingApprovalsHarness({onSelect=()=>true}={}){
 const nodes=new Map(),handlers={},sent=[],timers=new Map();let tick=0;
 const el=()=>({children:[],events:{},hidden:false,disabled:false,textContent:'',contentWindow:{},appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];},addEventListener(k,fn){this.events[k]=fn;},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(e=>[e.name,e.value])));}});
 const n=k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k);},window={addEventListener:(k,fn)=>handlers[k]=fn};window.top=window;
 vm.runInNewContext(fs.readFileSync(new URL('../../workforce/pending-approvals.js',import.meta.url),'utf8'),{window,crypto:webcrypto,Uint8Array,TextEncoder,Date,document:{getElementById:id=>n(id.replace('pending-','')),createElement:el,body:el()},setTimeout(fn){timers.set(++tick,fn);return tick;},clearTimeout:k=>timers.delete(k)});
 const api=window.TlhPendingApprovals.init({liff:{getIDToken:()=> 'fake.jwt.token'},gasUrl:'https://offline.invalid/exec',onSelect});
 async function receive(data,event={}){await handlers.message({origin:'null',source:{parent:n('frame').contentWindow},data,...event});}
 async function reply(page,patch={},event={}){const r=sent.at(-1),d={type:'TLH_BRIDGE_ATTENDANCE_DAY_CHANGE',action:r.action,nonce:r.nonce,command:'pending',groupId:'',code:'CHANGE_PENDING_READY',revision:'',summary:JSON.stringify(page)};
 d.mac=createHmac('sha256',r.responseKey).update([d.type,d.action,d.nonce,d.command,d.groupId,d.code,d.revision,d.summary].join('\n')).digest('hex');Object.assign(d,patch);await receive(d,event);return d;}
 return{n,api,sent,timers,handlers,window,receive,reply,click:k=>n(k).events.click()};
}
