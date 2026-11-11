/** Isolated DOM/LINE transport, real WebCrypto and real schedule.js. No browser, network or storage. */
import fs from 'node:fs';import vm from 'node:vm';import{webcrypto,createHmac}from'node:crypto';
export function scheduleUiHarness(audience='employee',options={}){
 const nodes=new Map(),events={},timers=new Map(),sent=[];let seq=0;
 function make(tag='div'){return{tagName:tag,children:[],events:{},attrs:{},dataset:{},value:'',textContent:'',disabled:false,hidden:false,
 addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},focus(){},
 appendChild(n){this.children.push(n);n.parent=this;return n;},replaceChildren(...n){this.children=n;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},
 submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
 const n=k=>{if(!nodes.has(k))nodes.set(k,make());return nodes.get(k);};n('month').value='2026-11';n('day').value='2026-11-05';n('kind').value='SHIFT_PREFERENCE';n('leave').value='PUBLIC_OFF';n('frame').contentWindow={};
 const window={top:null,confirm:()=>true,prompt:()=> '判断を確認',addEventListener(k,fn){const previous=events[k];events[k]=previous?(...args)=>{previous(...args);return fn(...args);}:fn;}};window.top=window;
 const document={currentScript:null,getElementById:id=>n(id.replace(options.idPrefix||'schedule-','')),createElement:make,body:make('body')};
 const runtime={window,document,crypto:webcrypto,Uint8Array,TextEncoder,Date,Intl,Blob,URL,setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(fs.readFileSync(new URL('../../workforce/schedule-view.js',import.meta.url),'utf8'),runtime);
 vm.runInNewContext(fs.readFileSync(new URL('../../workforce/schedule-report.js',import.meta.url),'utf8'),runtime);
 vm.runInNewContext(fs.readFileSync(new URL('../../workforce/schedule.js',import.meta.url),'utf8'),runtime);
 const liff={getIDToken:()=> 'fake.jwt.proof'},api=window.TlhSchedule.init({audience,...options,gasUrl:'https://offline.invalid/exec',liff});
 async function reply(request,data,code='SCHEDULE_READY',patch={},source=n('frame').contentWindow){
  const d={type:'TLH_BRIDGE_SCHEDULE',action:'bridgeScheduleV1',command:request.command,nonce:request.nonce,code,data:typeof data==='string'?data:JSON.stringify(data)};d.mac=createHmac('sha256',request.responseKey).update([d.type,d.action,d.command,d.nonce,d.code,d.data].join('\n')).digest('hex');await events.message({source,origin:'null',data:{...d,...patch}});
 }
 const descend=node=>[node,...node.children.flatMap(descend)];
 return{api,n,sent,events,timers,window,liff,reply,calendarDays:()=>descend(n('calendar')).filter(node=>node.tagName==='th'&&node.dataset.day),click:k=>n(k).events.click(),snapshot:()=>snapshot(audience),module:window.TlhSchedule};
}
export function snapshot(audience='employee'){return{version:1,month:'2026-11',monthRevision:1,phase:'COLLECTING',deadline:'2026-11-20T00:00:00.000Z',serverNow:'2026-11-04T03:00:00.000Z',admin:audience==='admin',employeeCode:audience==='employee'?'SCH001':'',employees:audience==='admin'?[{employeeCode:'SCH001',employeeName:'架空社員'}]:[],plans:[],ownPlans:[],drafts:[],requests:[],events:[],draftEvents:[]};}
