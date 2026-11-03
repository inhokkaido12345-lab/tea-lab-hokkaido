/** 起動時確認の実controllerを架空DOM/LINE/時計/通信で試す。実tokenや外部通信は使わない。 */
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export function adminAccessHarness({proof='fake.worker.proof',embedded=false,onState=()=>{},throwSubmit=false}={}){
  const sent=[],states=[],handlers={},timers=new Map(),frame={contentWindow:{}},status={textContent:''};let tick=0;
  const window={addEventListener:(type,fn)=>handlers[type]=fn};window.top=embedded?{}:window;
  const create=()=>({children:[],appendChild(n){this.children.push(n);},remove(){},submit(){if(throwSubmit)throw Error('offline');sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}});
  vm.runInNewContext(fs.readFileSync(new URL('../../workforce/admin-access.js',import.meta.url),'utf8'),{
    window,crypto:webcrypto,Uint8Array,TextEncoder,document:{body:{appendChild(){}},createElement:create},
    setTimeout(fn){timers.set(++tick,fn);return tick;},clearTimeout(id){timers.delete(id);}});
  const api=window.TlhAdminAccess.init({liff:{getIDToken:()=>proof},gasUrl:'https://offline.invalid/exec',frame,status,onState:(allowed,reason)=>{states.push({allowed,reason});onState(allowed,reason);}});
  async function receive(data,event={}){await handlers.message({origin:'null',source:{parent:frame.contentWindow},data,...event});}
  async function reply(code='STAFF_ADMIN_READY',patch={},event={}){
    const request=sent.at(-1),data={type:'TLH_BRIDGE_STAFF_ENROLLMENT',action:request.action,nonce:request.nonce,code};
    data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,data.code].join('\n')).digest('hex');Object.assign(data,patch);await receive(data,event);return data;
  }
  return {api,sent,states,frame,status,timers,handlers,reply,receive};
}
