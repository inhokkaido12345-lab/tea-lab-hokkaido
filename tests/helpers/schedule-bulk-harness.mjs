/** Fake DOM/LINE/timers, actual monthly model/controller and WebCrypto. No live HTTP/people. */
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
export function bulkSnapshot(count=5,month='2026-11'){
 const halves={};for(const part of ['FIRST','SECOND']){
 const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
 halves[part]={version:1,month,period:part,rangeStart:month+(part==='FIRST'?'-01':'-16'),rangeEnd:month+'-'+(part==='FIRST'?'15':String(last)),legacyAvailable:false,monthRevision:0,phase:'NOT_OPEN',deadline:'',serverNow:'2026-11-04T03:00:00.000Z',admin:true,employeeCode:'',publishedAt:'',employees:Array.from({length:count},(_,i)=>({employeeCode:'EMP'+String(i+1).padStart(3,'0'),employeeName:'架空社員'+(i+1),registrationStatus:'REGISTERED'})),plans:[],ownPlans:[],drafts:[],requests:[],events:[],draftEvents:[]};}
 return{version:1,month,admin:true,halves};
}
export function scheduleBulkHarness(){
 const nodes=new Map(),events={},timers=new Map(),sent=[],questions=[];let seq=0,confirm=true;
 function make(tag='div'){return{tagName:tag,children:[],events:{},attrs:{},value:'',textContent:'',disabled:false,hidden:false,
  addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},focus(){this.events.focus?.();},
  appendChild(n){this.children.push(n);n.parentElement=this;return n;},replaceChildren(...children){this.children=children;},remove(){},
  submit(){sent.push(Object.fromEntries(this.children.map(c=>[c.name,c.value])));}};}
 const n=k=>{if(!nodes.has(k))nodes.set(k,make());return nodes.get(k);};n('month').value='2026-11';n('frame').contentWindow={};
 const window={top:null,confirm(text){questions.push(text);return confirm;},addEventListener(k,fn){events[k]=fn;}};window.top=window;
 const runtime={window,document:{currentScript:null,getElementById:id=>n(id.replace('bulk-','')),createElement:make,body:make()},crypto:webcrypto,Uint8Array,TextEncoder,Date,Intl,setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);}};
 for(const file of ['schedule-view.js','schedule-report.js','schedule.js','schedule-bulk-model.js','schedule-bulk.js'])vm.runInNewContext(fs.readFileSync(new URL('../../workforce/'+file,import.meta.url),'utf8'),runtime,{filename:file});
 const api=window.TlhScheduleBulk.init({gasUrl:'https://offline.invalid/exec',liff:{getIDToken:()=> 'fake.jwt.proof'}});
 function walk(node){return[node,...node.children.flatMap(walk)];}
 function cell(code,day){const value=walk(n('rows')).find(x=>x.tagName==='textarea'&&x.attrs['aria-label']?.includes('（'+code+'） '+day));if(!value)throw Error('missing cell '+code+' '+day);return value;}
 return{api,n,sent,events,timers,questions,window,model:window.TlhScheduleBulkModel,cell,
  confirm(value){confirm=value;},edit(code,day,value){const c=cell(code,day);c.value=value;c.events.input();},click(id){return n(id).events.click();},
  async reply(request,data=bulkSnapshot(),code='SCHEDULE_READY',patch={},origin='null',source=n('frame').contentWindow){const d={type:'TLH_BRIDGE_SCHEDULE',action:'bridgeScheduleV1',command:request.command,nonce:request.nonce,code,data:data?JSON.stringify(data):''};d.mac=createHmac('sha256',request.responseKey).update([d.type,d.action,d.command,d.nonce,d.code,d.data].join('\n')).digest('hex');await events.message({source,origin,data:{...d,...patch}});},
 };
}
