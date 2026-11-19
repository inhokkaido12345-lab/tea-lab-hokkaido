/** Continuous UI journey with stateful fake Core and fake LINE broker. No real accounts. */
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.join(root,'qa-artifacts/account-journey'),require=createRequire(import.meta.url);
const {chromium}=require(path.join(root,'.qa-tools/node_modules/playwright'));
await fs.mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error('PATH');const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
import {createJourneyCore} from './account-journey-fixture.mjs';
import {replyHTML} from './account-visual-fixtures.mjs';
const browser=await chromium.launch({headless:true}),reports=[];let failed=false;
try{for(const recover of [false,true]){
 const name=recover?'recovery':'happy',core=createJourneyCore({recover}),context=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP',serviceWorkers:'block'}),blocked=[],errors=[],stages=[];
 let page;const report={name,realPhone:false,realOAuth:false,realCore:false,syntheticOriginAdapter:true,externalHttpPolicy:'local-and-synthetic-replies-only',passed:false};
 try{
  await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());
   if(u.origin===origin){
    if(u.pathname==='/software/inventory/employee-login.js'){const account=new URL(r.frame().url()).pathname==='/account/';return route.fulfill({contentType:'application/javascript',body:`window.TlhInventoryLogin={clearToken(){},login:async()=>{},getToken:()=>${account?"'synthetic.fixture.proof'":'null'}};`});}
    if(u.pathname==='/software/inventory/employee-transport.js'){const source=await fs.readFile(path.join(root,'software/inventory/employee-transport.js'),'utf8'),guard="global.location.origin !== 'https://tealabhokkaido.com'";assert.equal(source.split(guard).length,2);return route.fulfill({contentType:'application/javascript',body:source.replace(guard,'global.location.origin !== '+JSON.stringify(origin))});}
    return route.continue();
   }
   if(u.origin==='https://script.google.com'&&r.method()==='POST'){try{return route.fulfill({contentType:'text/html; charset=utf-8',body:replyHTML(core.reply(Object.fromEntries(new URLSearchParams(r.postData()))),origin)});}catch(e){errors.push(e.message);return route.abort();}}
   blocked.push(u.origin+u.pathname);return route.abort();
  });
  context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());});
  const inventory=await context.newPage();await inventory.goto(origin+'/software/inventory/',{waitUntil:'networkidle'});
  async function snap(p,stage){await p.evaluate(()=>document.fonts.ready);assert.equal(new URL(p.url()).search,new URL(p.url()).pathname==='/account/'?'?service=inventory':'','ONLY_REVIEWED_SERVICE_HINT_IN_URL');assert.equal(new URL(p.url()).hash,'','SECRET_IN_FRAGMENT');await p.screenshot({path:path.join(out,name+'-'+stage+'.png'),fullPage:true});stages.push(stage);}
  await snap(inventory,'01-inventory');await inventory.locator('#inventory-start>summary').click();const popup=context.waitForEvent('page');await inventory.locator('.entry-primary').click();page=await popup;await page.waitForLoadState('domcontentloaded');await page.clock.install();
  await page.locator('#account-login').click();await page.locator('#account-create').waitFor({state:'visible'});assert.equal(await page.locator('#activation-code-entry').isVisible(),false);await snap(page,'02-unregistered');
  await page.locator('#account-create').click();
  if(recover){await page.clock.fastForward(31000);await page.waitForFunction(()=>document.getElementById('account-create').textContent.includes('同じ登録'));assert.equal(core.summary().registrationAttempts,1);assert.equal(await page.locator('#activation-code-entry').isVisible(),false);assert.equal(await page.evaluate(()=>window.TlhAccountNavigation.canLeave()),false);await snap(page,'03-registration-unknown');await page.locator('#account-create').click();}
  await page.locator('#activation-code').waitFor({state:'visible'});assert.equal(await page.locator('#account-create').isVisible(),false);assert.equal(core.summary().createdAccountCount,1);await snap(page,'04-created-code-entry');
  const code='c'.repeat(64);await page.locator('#activation-code').fill(code);await page.locator('#activation-claim').click();
  if(recover){await page.waitForFunction(()=>document.getElementById('activation-status').textContent.includes('登録状態が変わりました'));assert.equal(await page.locator('#activation-code').inputValue(),code);assert.equal(core.summary().commitAttempts,0);await snap(page,'05-preview-error');await page.locator('#activation-claim').click();}
  await page.locator('#activation-preview').waitFor({state:'visible'});const summary=await page.locator('#activation-summary').textContent();assert.match(summary,/合成試験会社/);assert.match(summary,/合成試験店舗/);assert.match(summary,/閲覧/);assert.match(summary,/入荷/);assert.equal(await page.locator('#activation-inputs').isVisible(),false);await snap(page,'06-preview');await page.locator('#activation-commit').click();
  if(recover){await page.clock.fastForward(31000);await page.locator('#activation-retry').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.TlhAccountNavigation.canLeave()),false);assert.equal(await page.locator('#account-apps').isVisible(),false);assert.equal(core.summary().commitAttempts,1);await snap(page,'07-activation-unknown');await page.locator('#activation-retry').click();}
  await page.locator('#activation-open').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.TlhAccountNavigation.canLeave()),true);assert.equal(core.summary().appliedInvitationCount,1);await snap(page,'08-saved');
  await page.locator('#activation-open').click();await page.waitForURL(origin+'/software/inventory/');await page.locator('#line-login').waitFor({state:'visible'});await snap(page,'09-returned-inventory');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);report.fixture=core.summary();report.passed=true;
 }catch(e){failed=true;report.error=e.message;if(page)await page.screenshot({path:path.join(out,name+'-FAIL.png'),fullPage:true}).catch(()=>{});}finally{report.errors=errors;report.blockedExternalRequests=blocked;report.stages=stages;reports.push(report);await context.close();}
}}finally{await browser.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA||'local',reports},null,2));}
console.log(JSON.stringify({journeys:reports.length,passed:reports.filter(r=>r.passed).length}));if(failed)process.exitCode=1;
