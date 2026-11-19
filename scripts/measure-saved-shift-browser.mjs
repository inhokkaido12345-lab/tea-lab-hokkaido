/** Dependency-free local Chromium benchmark; synthetic fixture only, no remote page/service.
 * Uses runner's installed Chrome + Node WebSocket. No npm install/auth/session/production writes.
 * apply-confirm measures synthetic reply delivery, never real GAS/LINE latency. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'tlh-synthetic-'));
const chrome=process.env.CHROMIUM_PATH||['google-chrome','chromium','chromium-browser'].find(x=>spawnSync('which',[x]).status===0);if(!chrome)throw Error('Installed trusted Chromium unavailable');
const files=['schedule-view.js','schedule-report.js','schedule.js','schedule-management-contract.js','schedule-saved-output.js','schedule-management.js'];
const base=fs.readFileSync(path.join(root,'workforce/admin-schedule.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/saved-shift-output.json')));
const markup=base+'<style>'+fs.readFileSync(path.join(root,'workforce/schedule.css'),'utf8')+'</style>'+files.map(f=>'<script>'+fs.readFileSync(path.join(root,'workforce',f),'utf8')+'</script>').join('');
fs.writeFileSync(path.join(dir,'proof.html'),markup);
const child=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'profile'),'about:blank']);
let stderr='';const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chromium startup timed out: '+stderr.slice(-500))),15000);child.stderr.on('data',b=>{stderr+=b;const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Chromium exited '+code+': '+stderr.slice(-500)));});});
let socket;try{
 socket=new WebSocket(endpoint);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let seq=0;const pending=new Map();socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);if(p){pending.delete(x.id);x.error?p.reject(Error(JSON.stringify(x.error))):p.resolve(x.result);}}};
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:false},sessionId);
 const samples=[];
 for(let i=0;i<30;i++){
  await call('Page.navigate',{url:pathToFileURL(path.join(dir,'proof.html')).href},sessionId);
  for(let n=0;n<100;n++){if(await evaluate('!!window.TlhScheduleManagement'))break;await new Promise(r=>setTimeout(r,20));if(n===99)throw Error('fixture scripts missing');}
  const result=await evaluate(`(async()=>{
   const fixture=${JSON.stringify(fixture)},sent=[],drawn=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){drawn.push(String(text));return original.call(this,text,...args);};
   HTMLAnchorElement.prototype.click=function(){};
   HTMLFormElement.prototype.submit=function(){const r=Object.fromEntries([...this.elements].map(n=>[n.name,n.value]));sent.push(r.command);const out=fixture[r.command==='batchRead'?'initial':r.command==='sheetRead'?'preview':'saved'];const data={type:'TLH_BRIDGE_SCHEDULE',action:'bridgeScheduleV1',command:r.command,nonce:r.nonce,code:out.code,data:JSON.stringify(out.data)};const enc=new TextEncoder();crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['sign']).then(k=>crypto.subtle.sign('HMAC',k,enc.encode([data.type,data.action,data.command,data.nonce,data.code,data.data].join('\\n')))).then(mac=>{data.mac=Array.from(new Uint8Array(mac),x=>x.toString(16).padStart(2,'0')).join('');window.dispatchEvent(new MessageEvent('message',{data,origin:'null',source:document.getElementById('schedule-management-frame').contentWindow}));});};
   const n=id=>document.getElementById('schedule-management-'+id),until=async fn=>{const end=performance.now()+5000;while(!fn()){if(performance.now()>end)throw Error('stage timeout');await new Promise(r=>setTimeout(r,1));}};
   n('month').value='2026-11';const app=TlhScheduleManagement.init({gasUrl:'https://offline.invalid',liff:{getIDToken:()=> 'fake.jwt.proof'}});await app.load();await until(()=>!n('publish').disabled);n('publish').click();await until(()=>!n('confirmed-apply').hidden);n('reason').value='synthetic confirmation';n('confirmed-apply').click();await until(()=>app.measurements().some(x=>x.phase==='confirm-paint'));n('saved-png').click();await until(()=>app.measurements().some(x=>x.phase==='png-ready'));
   return {samples:app.measurements(),sent,corrected:drawn.join('').includes('10–18'),privateLeak:drawn.join('').includes('PRIVATE')};
  })()`);
  if(JSON.stringify(result.sent)!==JSON.stringify(['batchRead','sheetRead','sheetImport'])||!result.corrected||result.privateLeak)throw Error('result/count/privacy mismatch '+JSON.stringify(result));samples.push(...result.samples);
 }
 const result={conditions:'30 fresh local Chromium runs; 430x932; 1 synthetic employee/1 corrected day/fully published month; real DOM/Canvas/toBlob/WebCrypto, system fonts; signed fixture produced by backend #109; NO network/GAS/LINE latency',requestsPerRun:3,applyRequests:1,displayAndPngRequests:0,stages:{}};
 for(const phase of ['apply-confirm','confirm-paint','png-ready']){const a=samples.filter(x=>x.phase===phase).map(x=>x.ms).sort((a,b)=>a-b);result.stages[phase]={n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};}console.log(JSON.stringify(result,null,2));
}finally{socket?.close();if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
