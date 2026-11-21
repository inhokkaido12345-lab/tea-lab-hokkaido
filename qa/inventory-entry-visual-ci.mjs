/** Isolated initial-entry QA: actual static app, fresh unauthenticated context.
 * No login click, no live API, no production data; viewport emulation is not a phone.
 */
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {checkInventoryLineRouting} from './inventory-line-router-visual.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.join(root,'qa-artifacts/inventory-entry'),require=createRequire(import.meta.url);
const {chromium}=require(path.join(root,'.qa-tools/node_modules/playwright'));
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error('PATH');const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),reports=[];let failed=false;
try{for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
 const context=await browser.newContext({viewport,locale:'ja-JP',serviceWorkers:'block'}),page=await context.newPage(),blocked=[],errors=[];
 const report={viewport,realPhone:false,realOAuth:false,syntheticOriginAdapter:'employee-transport fixed origin mapped to localhost in test response only',externalHttpPolicy:'block-non-local',networkObservation:'Playwright route interception; not packet capture',passed:false};
 try{
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin&&u.pathname==='/software/inventory/employee-transport.js'){const source=await fs.readFile(path.join(root,'software/inventory/employee-transport.js'),'utf8'),guard="global.location.origin !== 'https://tealabhokkaido.com'";assert.equal(source.split(guard).length,2,'ORIGIN_FIXTURE_CONTRACT_CHANGED');return route.fulfill({contentType:'application/javascript',body:source.replace(guard,'global.location.origin !== '+JSON.stringify(origin))});}if(u.origin===origin)return route.continue();blocked.push({origin:u.origin,method:route.request().method()});return route.abort();});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)errors.push('LOCAL_ASSET_MISSING:'+new URL(r.url()).pathname);});
  await page.goto(origin+'/software/inventory/',{waitUntil:'networkidle'});await page.locator('#line-login').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#line-login').isVisible(),true);
  assert.equal(await page.locator('header a').count(),0);
  for(const selector of ['.entry-primary','.entry-personal'])assert.equal(await page.locator(selector).isVisible(),false);
  await page.locator('#inventory-start>summary').click();
  for(const selector of ['.entry-primary','.entry-personal'])assert.equal(await page.locator(selector).isVisible(),true);
  assert.match(await page.locator('#line-login').textContent(),/LINEでログインして在庫を開く/);
  assert.equal(await page.locator('.entry-primary').getAttribute('href'),'/account/?service=inventory');assert.equal(await page.locator('.entry-personal').getAttribute('href'),'/account/?purpose=personal&service=INVENTORY');
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:['.entry-primary','.entry-personal','#line-login'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),css=getComputedStyle(e);return {selector:s,label:e.textContent.trim(),top:r.top,bottom:r.bottom,height:r.height,width:r.width,background:css.backgroundColor};}),openDetails:[...document.querySelectorAll('.inventory-entry details')].filter(e=>e.open).length}));
  assert.ok(metrics.scrollWidth<=metrics.width,'HORIZONTAL_OVERFLOW');assert.equal(metrics.openDetails,1);assert.ok(metrics.controls.every(x=>x.height>=44),'SMALL_ENTRY_TARGET');assert.ok(metrics.controls[2].top<metrics.controls[0].top&&metrics.controls[0].top<metrics.controls[1].top,'ENTRY_ORDER');assert.ok(metrics.controls[2].bottom<=viewport.height,'PRIMARY_BELOW_FOLD');assert.notEqual(metrics.controls[2].background,'rgba(0, 0, 0, 0)','PRIMARY_UNSTYLED');
  assert.deepEqual(errors,[],'BROWSER_OR_ASSET_ERROR');assert.deepEqual(blocked,[],'UNAUTHENTICATED_PAGE_ATTEMPTED_EXTERNAL_REQUEST');
  report.metrics=metrics;
  await page.locator('#inventory-start>summary').click();
  // The initial state above is actual startup. Following states project DOM only,
  // never authenticate, create a receipt, or claim that server recovery succeeded.
  const shellSelectors=['#stock','#refresh','body > nav'];
  for(const selector of shellSelectors)assert.equal(await page.locator(selector).isVisible(),false,'IDLE_SHELL_VISIBLE:'+selector);
  assert.equal(await page.locator('#operation-recovery').isVisible(),false,'EMPTY_RECOVERY_VISIBLE');
  assert.equal(await page.locator('#inventory-stores').isVisible(),false,'EMPTY_STORE_HOST_VISIBLE');
  await page.locator('#inventory-stores').evaluate(e=>{const p=document.createElement('p');p.textContent='QA合成：選択した店舗';e.append(p);});assert.equal(await page.locator('#inventory-stores').isVisible(),true,'POPULATED_STORE_HOST_HIDDEN');await page.screenshot({path:path.join(out,viewport.width+'-projected-store-host.png')});await page.locator('#inventory-stores').evaluate(e=>e.replaceChildren());assert.equal(await page.locator('#inventory-stores').isVisible(),false,'EMPTIED_STORE_HOST_VISIBLE');
  const original=await page.evaluate(()=>{const ids=['line-login','status','status-detail','recovery'];return Object.fromEntries(ids.map(id=>{const e=document.getElementById(id);return [id,{hidden:e.hidden,className:e.className,busy:e.getAttribute('aria-busy'),text:id==='status'?e.textContent:null}];}));});
  report.projectedStates=[];
  async function project(state){await page.evaluate(({state,original})=>{
   for(const [id,s]of Object.entries(original)){const e=document.getElementById(id);e.hidden=s.hidden;e.className=s.className;if(s.busy===null)e.removeAttribute('aria-busy');else e.setAttribute('aria-busy',s.busy);if(s.text!==null)e.textContent=s.text;}
   document.getElementById('operation-recovery').replaceChildren();
   if(state==='receipt'||state==='invalid-receipt'){const p=document.createElement('p');p.textContent=state==='receipt'?'QA合成：保存結果の確認が必要です':'QA合成：復旧情報を確認できません';document.getElementById('operation-recovery').append(p);}
   if(state==='busy')document.getElementById('status').setAttribute('aria-busy','true');
   if(state==='error'){document.getElementById('status').classList.add('status-needs-action');document.getElementById('status').textContent='QA合成：読込に失敗しました';}
   if(state==='detail')document.getElementById('status-detail').hidden=false;
   if(state==='legacy-recovery')document.getElementById('recovery').hidden=false;
   if(state==='login-hidden')document.getElementById('line-login').hidden=true;
  },{state,original});}
  async function checkProjection(state,restored){
   for(const selector of shellSelectors)assert.equal(await page.locator(selector).isVisible(),restored,state+':'+selector);
   for(const selector of ['#status','#inventory-help','.inventory-entry'])assert.equal(await page.locator(selector).isVisible(),true,state+':HID_REQUIRED_UI');
   for(const selector of ['#receiving','#history','#catalog'])assert.equal(await page.locator(selector).isVisible(),false,state+':UNSELECTED_PANEL_REVEALED');
   report.projectedStates.push({state,syntheticDOMOnly:true,shellRestored:restored});await page.screenshot({path:path.join(out,viewport.width+'-projected-'+state+'.png'),fullPage:true});
  }
  for(const state of ['receipt','invalid-receipt','busy','error','detail','legacy-recovery','login-hidden']){await project(state);await checkProjection(state,true);await project('idle-again');await checkProjection('idle-again-'+state,false);}
  const removed=await page.evaluate(()=>{const out=[];for(const sheet of document.styleSheets){for(let i=sheet.cssRules.length-1;i>=0;i--){const rule=sheet.cssRules[i];if(rule.selectorText?.includes('body:has(#line-login')){out.push({href:sheet.href,index:i,text:rule.cssText});sheet.deleteRule(i);}}}return out;});
  assert.ok(removed.length>0,'IDLE_CSS_RULE_MISSING');await checkProjection('no-has-rule-fallback',true);
  await page.evaluate(rules=>{for(const r of rules.reverse()){const sheet=[...document.styleSheets].find(s=>s.href===r.href);sheet.insertRule(r.text,r.index);}},removed);await checkProjection('restored-idle-rule',false);
  // Successful-read appearance is a DOM projection, not authenticated service evidence.
  const savedReadDom=await page.evaluate(()=>({stores:document.getElementById('inventory-stores').innerHTML,overview:document.getElementById('overview').innerHTML}));
  async function successfulRead(state){
   await project(state);
   await page.evaluate(()=>{document.getElementById('line-login').hidden=true;document.getElementById('inventory-stores').innerHTML='<label>QA合成店舗<select><option>合成店舗</option></select></label>';document.getElementById('overview').innerHTML='<div>QA合成：在庫読取後の表示</div>';});
  }
  async function checkRead(state,entryVisible){
   assert.equal(await page.locator('.inventory-entry').isVisible(),entryVisible,state+':ENTRY_VISIBILITY');
   for(const selector of ['#inventory-stores','#inventory-stores select','#overview','#stock','#refresh','body > nav','#inventory-help','#status'])assert.equal(await page.locator(selector).isVisible(),true,state+':REQUIRED_UI_HIDDEN:'+selector);
   report.projectedStates.push({state,syntheticDOMOnly:true,entryVisible});await page.screenshot({path:path.join(out,viewport.width+'-projected-'+state+'.png'),fullPage:true});
  }
  await successfulRead('idle');await checkRead('successful-read',false);
  for(const state of ['busy','error','detail','legacy-recovery','receipt','invalid-receipt']){await successfulRead(state);await checkRead('read-then-'+state,true);if(state==='receipt'||state==='invalid-receipt')assert.equal(await page.locator('#operation-recovery').isVisible(),true);}
  await successfulRead('idle');await page.locator('#line-login').evaluate(e=>e.hidden=false);assert.equal(await page.locator('.inventory-entry').isVisible(),true,'REAUTH_MUST_RESTORE_ENTRY');await page.screenshot({path:path.join(out,viewport.width+'-projected-read-then-reauth.png'),fullPage:true});
  await page.evaluate(saved=>{document.getElementById('inventory-stores').innerHTML=saved.stores;document.getElementById('overview').innerHTML=saved.overview;},savedReadDom);await project('idle');await checkProjection('unregistered-after-read',false);
  assert.deepEqual(blocked,[],'PROJECTED_STATE_ATTEMPTED_EXTERNAL_REQUEST');assert.deepEqual(errors,[],'PROJECTED_STATE_BROWSER_ERROR');
  await page.screenshot({path:path.join(out,viewport.width+'-viewport.png')});await page.screenshot({path:path.join(out,viewport.width+'-full.png'),fullPage:true});report.passed=true;
 }catch(e){failed=true;report.error=e.message;await page.screenshot({path:path.join(out,viewport.width+'-FAIL.png'),fullPage:true}).catch(()=>{});}finally{report.blockedExternalRequestCount=blocked.length;report.blockedExternalRequests=blocked;report.errors=errors;reports.push(report);await context.close();}
}await checkInventoryLineRouting({browser,root,mime});}finally{await browser.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA||'local',syntheticEnvironment:true,reports},null,2));}
console.log(JSON.stringify({cases:reports.length,passed:reports.filter(r=>r.passed).length}));if(failed)process.exitCode=1;
