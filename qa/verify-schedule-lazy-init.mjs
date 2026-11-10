/** Offline real-DOM lifecycle smoke test. No LINE, Google, employee data or save calls.
 * Actual home HTML + schedule controllers; only visibility/read scheduling is simulated.
 * Removing it loses coverage that mock nodes cannot provide when initialization moves to first use.
 * Run with development Playwright; TLH_PLAYWRIGHT_MODULE/TLH_CHROME_EXECUTABLE select existing tools.
 */
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),{chromium}=require(process.env.TLH_PLAYWRIGHT_MODULE||'playwright');
const out=path.join(root,'.sandbox-work/lazy-init-smoke');await fs.mkdir(out,{recursive:true});
let html=await fs.readFile(path.join(root,'workforce/index.html'),'utf8');html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/href="([^"#]+\.css)(?:\?[^" ]*)?"/g,(_m,p)=>'href="'+pathToFileURL(path.join(root,'workforce',p)).href+'"');
for(const name of ['schedule-view.js','schedule-report.js','schedule.js','schedule-management-contract.js','schedule-management.js','schedule-workspace.js'])html=html.replace('</body>','<script>'+await fs.readFile(path.join(root,'workforce',name),'utf8')+'</script></body>');
const input=path.join(out,'fixture.html');await fs.writeFile(input,html);const browser=await chromium.launch({headless:true,...(process.env.TLH_CHROME_EXECUTABLE?{executablePath:process.env.TLH_CHROME_EXECUTABLE}:{}),args:['--allow-file-access-from-files']});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());await page.goto(pathToFileURL(input).href);
 const result=await page.evaluate(()=>{
  const calls={employee:0,management:0},reads=[],seen=new Set();let employee=false,manager=false,allowed=false;
  const originalEmployee=TlhSchedule.init,originalManager=TlhScheduleManagement.init;
  window.TlhSchedule={...TlhSchedule,init(o){calls.employee++;return originalEmployee(o);}};window.TlhScheduleManagement={...TlhScheduleManagement,init(o){calls.management++;return originalManager(o);}};
  document.getElementById('schedule-month').value='2026-11';
  const api=TlhScheduleWorkspace.init({gasUrl:'https://offline.invalid',liff:{getIDToken:()=>null},visible:()=>employee,adminVisible:()=>manager,adminAllowed:()=>allowed,autoReads:{once(key,guard){if(guard()&&!seen.has(key)){seen.add(key);reads.push(key);}},again(){throw Error('Unexpected refresh');},invalidate(keys){for(const k of keys)seen.delete(k);}}});
  const startup={...calls};api.activate();api.activateAdmin();const hidden={...calls};manager=true;api.activateAdmin();const denied={...calls};allowed=true;api.activateAdmin();const adminFirst={...calls};employee=true;manager=false;api.activate();
  for(let i=0;i<1000;i++){api.activate();manager=true;api.activateAdmin();manager=false;}
  return{startup,hidden,denied,adminFirst,final:{...calls},reads,employeeEditorDisabled:document.getElementById('schedule-editor').disabled};
 });
 assert.deepEqual(errors,[]);assert.deepEqual(result.startup,{employee:0,management:0});assert.deepEqual(result.hidden,result.startup);assert.deepEqual(result.denied,result.startup);assert.deepEqual(result.adminFirst,{employee:0,management:1});assert.deepEqual(result.final,{employee:1,management:1});assert.deepEqual(result.reads,['scheduleManagement','schedule']);assert.equal(result.employeeEditorDisabled,true);
 await fs.writeFile(path.join(out,'verified.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({code:'SCHEDULE_LAZY_INIT_REAL_DOM_VERIFIED',...result}));
}finally{await browser.close();}
