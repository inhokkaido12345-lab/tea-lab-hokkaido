/** Offline DOM/LINE/timers only. Shared UI and cross-repo integration tests; never network or storage. */
import vm from 'node:vm';import fs from 'node:fs';import {webcrypto,createHmac} from 'node:crypto';
export function dayChangeHarness(){
  const source=fs.readFileSync(new URL('../../workforce/day-change.js',import.meta.url),'utf8'),nodes=new Map(),handlers={},sent=[],timers=new Map();let tick=0;
  function el(){return{value:'',textContent:'',hidden:false,disabled:false,events:{},children:[],contentWindow:{},
    addEventListener(k,fn){this.events[k]=fn;},appendChild(e){this.children.push(e);},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(e=>[e.name,e.value])));}};}
  const n=k=>{if(!nodes.has(k))nodes.set(k,el());return nodes.get(k);},window={confirm:()=>true,addEventListener(k,fn){handlers[k]=fn;}};window.top=window;
  vm.runInNewContext(source,{window,Intl,Date,crypto:webcrypto,Uint8Array,TextEncoder,navigator:{clipboard:{writeText:async()=>{}}},
    document:{currentScript:null,getElementById:id=>n(id.replace('change-','')),body:el(),createElement:el},
    setTimeout(fn){timers.set(++tick,fn);return tick;},clearTimeout(id){timers.delete(id);}});
  n('mode').value='DIRECT';n('employee').value='EMP030';n('day').value='2026-11-01';n('in').value='2026-11-01T09:00';n('out').value='2026-11-01T18:00';
  n('break-start').value='2026-11-01T12:00';n('break-end').value='2026-11-01T13:00';n('reason').value='Fixture reason';
  window.TlhDayChange.init({gasUrl:window.TlhDayChange.config.gasUrl,liff:{getIDToken:()=> 'fake.jwt.proof'}});
  async function receive(data,eventPatch={}){await handlers.message({source:{parent:n('frame').contentWindow},origin:'null',data,...eventPatch});}
  async function reply(r,code='CHANGE_READY',patch={},eventPatch={}){
    const s={employeeCode:'EMP030',employeeName:'Fixture Worker',groupId:r.groupId,day:r.day||'2026-11-01',reason:r.reason||'Fixture reason',clockIn:r.clockIn||'2026-11-01T00:00:00.000Z',clockOut:r.clockOut||'2026-11-01T09:00:00.000Z',breakStart:r.breakStart||'',breakEnd:r.breakEnd||''};
    const d={type:'TLH_BRIDGE_ATTENDANCE_DAY_CHANGE',action:r.action,nonce:r.nonce,command:r.command,groupId:r.groupId,code,revision:code==='CHANGE_READY'?'a'.repeat(64):'',summary:code==='CHANGE_READY'?JSON.stringify(s):''};
    d.mac=createHmac('sha256',r.responseKey).update([d.type,d.action,d.nonce,d.command,d.groupId,d.code,d.revision,d.summary].join('\n')).digest('hex');Object.assign(d,patch);await receive(d,eventPatch);
  }
  return{n,window,sent,timers,handlers,source,receive,reply,click:k=>n(k).events.click()};
}
