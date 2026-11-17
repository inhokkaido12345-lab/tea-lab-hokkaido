/** Isolated initial-entry QA: actual static app, fresh unauthenticated context.
 * No login click, no live API, no production data; viewport emulation is not a phone.
 */
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.join(root,'qa-artifacts/inventory-entry'),require=createRequire(import.meta.url);
const {chromium}=require(path.join(root,'.qa-tools/node_modules/playwright'));
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error('PATH');const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),reports=[];let failed=false;
try{for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
 const context=await browser.newContext({viewport,locale:'ja-JP',serviceWorkers:'block'}),page=await context.newPage(),blocked=[],errors=[];
 const report={viewport,realPhone:false,realOAuth:false,externalHttpPolicy:'block-non-local',networkObservation:'Playwright route interception; not packet capture',passed:false};
 try{
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();blocked.push({origin:u.origin,method:route.request().method()});return route.abort();});
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)errors.push('LOCAL_ASSET_MISSING:'+new URL(r.url()).pathname);});
  await page.goto(origin+'/software/inventory/',{waitUntil:'networkidle'});await page.locator('#line-login').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);
  for(const selector of ['.entry-primary','.entry-personal','#line-login'])assert.equal(await page.locator(selector).isVisible(),true,selector+' missing');
  assert.match(await page.locator('.entry-primary').textContent(),/招待コード/);assert.match(await page.locator('.entry-personal').textContent(),/コード不要/);assert.match(await page.locator('#line-login').textContent(),/利用中/);
  for(const selector of ['.entry-primary','.entry-personal'])assert.equal(await page.locator(selector).getAttribute('href'),'/account/');
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:['.entry-primary','.entry-personal','#line-login'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),css=getComputedStyle(e);return {selector:s,label:e.textContent.trim(),top:r.top,bottom:r.bottom,height:r.height,width:r.width,background:css.backgroundColor};}),openDetails:[...document.querySelectorAll('.inventory-entry details')].filter(e=>e.open).length}));
  assert.ok(metrics.scrollWidth<=metrics.width,'HORIZONTAL_OVERFLOW');assert.equal(metrics.openDetails,0);assert.ok(metrics.controls.every(x=>x.height>=44),'SMALL_ENTRY_TARGET');assert.ok(metrics.controls[0].top<metrics.controls[1].top&&metrics.controls[1].top<metrics.controls[2].top,'ENTRY_ORDER');assert.ok(metrics.controls[0].bottom<=viewport.height,'PRIMARY_BELOW_FOLD');assert.notEqual(metrics.controls[0].background,'rgba(0, 0, 0, 0)','PRIMARY_UNSTYLED');
  assert.deepEqual(errors,[],'BROWSER_OR_ASSET_ERROR');assert.deepEqual(blocked,[],'UNAUTHENTICATED_PAGE_ATTEMPTED_EXTERNAL_REQUEST');
  report.metrics=metrics;await page.screenshot({path:path.join(out,viewport.width+'-viewport.png')});await page.screenshot({path:path.join(out,viewport.width+'-full.png'),fullPage:true});report.passed=true;
 }catch(e){failed=true;report.error=e.message;await page.screenshot({path:path.join(out,viewport.width+'-FAIL.png'),fullPage:true}).catch(()=>{});}finally{report.blockedExternalRequestCount=blocked.length;report.blockedExternalRequests=blocked;report.errors=errors;reports.push(report);await context.close();}
}}finally{await browser.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA||'local',syntheticEnvironment:true,reports},null,2));}
console.log(JSON.stringify({cases:reports.length,passed:reports.filter(r=>r.passed).length}));if(failed)process.exitCode=1;
