/** 実HTMLのID・実controller・WebCryptoを使い、DOM/LINE/HTTP/時刻待ちだけを代替する。実データなし。 */
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';import assert from 'node:assert/strict';
import {bulkSnapshot} from './schedule-bulk-harness.mjs';
export function managementSnapshot(){const s=bulkSnapshot(1);s.inputSheetUrl='https://docs.google.com/spreadsheets/d/fixture/edit';for(const half of Object.values(s.halves)){half.inputMode='SHEET';half.phase='COLLECTING';half.monthRevision=1;half.deadline='2026-11-01T00:00:00.000Z';}return s;}
export function sheetReply(snapshot=managementSnapshot(),changes=[]){return{version:1,month:snapshot.month,csv:'',snapshot,sheet:{url:'https://docs.google.com/spreadsheets/d/fixture/edit#gid=1',created:false},authority:{sourceDigest:'a'.repeat(64),targetDigest:'b'.repeat(64),preview:{month:snapshot.month,changes,blanks:0,unchanged:0,eventChanges:0,eventDetails:[]}}};}
export function managementHarness(){
 const nodes=new Map(),events={},sent=[],timers=new Map(),loginCalls=[];let seq=0;
 function make(tag='div'){return{tagName:tag,children:[],attrs:{},events:{},value:'',disabled:false,hidden:false,textContent:'',
  addEventListener(k,f){this.events[k]=f;},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},focus(){},remove(){},
  appendChild(n){this.children.push(n);n.parentElement=this;return n;},replaceChildren(){this.children=[];},querySelectorAll(selector){assert.equal(selector,'button');return walk(this).filter(n=>n.tagName==='button');},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
 const walk=n=>[n,...n.children.flatMap(walk)];
 const html=fs.readFileSync(new URL('../../workforce/admin-schedule.html',import.meta.url),'utf8');for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],make());
 const n=id=>{const key='schedule-management-'+id;assert.ok(nodes.has(key),'missing actual DOM id: '+key);return nodes.get(key);};n('month').value='2026-11';n('period').value='FIRST';n('frame').contentWindow={};
 const window={top:null,location:{origin:'https://tealabhokkaido.com',pathname:'/workforce/'},addEventListener(k,f){(events[k]??=[]).push(f);}};window.top=window;
 const runtime={window,document:{currentScript:null,getElementById(id){assert.ok(nodes.has(id),'missing DOM: '+id);return nodes.get(id);},createElement:make,body:make()},crypto:webcrypto,Uint8Array,TextEncoder,Date,Intl,setTimeout(f){timers.set(++seq,f);return seq;},clearTimeout(id){timers.delete(id);}};
 for(const file of ['schedule-view.js','schedule.js','schedule-management-contract.js','schedule-management.js'])vm.runInNewContext(fs.readFileSync(new URL('../../workforce/'+file,import.meta.url),'utf8'),runtime,{filename:file});
 const liff={getIDToken:()=> 'fake.jwt.proof',isInClient:()=>false,logout(){loginCalls.push('logout');},login(o){loginCalls.push(o);}};
 const api=window.TlhScheduleManagement.init({gasUrl:'https://offline.invalid/exec',liff});
 async function dispatch(event){for(const fn of events.message||[])await fn(event);}
 return{api,n,window,liff,sent,events,timers,walk,loginCalls,contract:window.TlhScheduleManagementContract,click:id=>n(id).events.click(),depart(){for(const fn of events.pagehide||[])fn();},expire(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}},
 async reply(request,value=managementSnapshot(),code='SCHEDULE_READY',patch={},origin='null',source=n('frame').contentWindow){const d={type:'TLH_BRIDGE_SCHEDULE',action:'bridgeScheduleV1',command:request.command,nonce:request.nonce,code,data:value?JSON.stringify(value):''};d.mac=createHmac('sha256',request.responseKey).update([d.type,d.action,d.command,d.nonce,d.code,d.data].join('\n')).digest('hex');await dispatch({source,origin,data:{...d,...patch}});},
 deliver:dispatch};
}
