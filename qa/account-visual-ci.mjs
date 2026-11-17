/** CI-only synthetic browser QA; not real-phone or real-LINE acceptance.
 * Run: npm install --prefix .qa-tools --no-save playwright@1.56.1
 * .qa-tools/node_modules/.bin/playwright install chromium
 * node qa/account-visual-ci.mjs
 * All non-local requests are either fulfilled with synthetic contract replies
 * or aborted before transport. Service workers are disabled. No real accounts.
 */
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {fixtureReply,replyHTML,scenarios,collectViewportButtons} from './account-visual-fixtures.mjs';
const require=createRequire(import.meta.url),root=path.resolve(new URL('..',import.meta.url).pathname),output=path.join(root,'qa-artifacts/account-visual');
const {chromium}=require(path.join(root,'.qa-tools/node_modules/playwright'));
await fs.mkdir(output,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('BAD_PATH');const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const reports=[],browser=await chromium.launch({headless:true});let failed=false;
const spinner=()=>{const e=document.getElementById('account-tab-manage'),s=getComputedStyle(e,'::after');return e.getAttribute('aria-busy')==='true'&&s.content!=='none'&&s.animationName!=='none'&&parseFloat(s.width)>0;};
try{for(const viewport of [{width:390,height:844},{width:1280,height:900}])for(const scenario of scenarios){
 const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'ja-JP'}),page=await context.newPage(),requests=[],blocked=[],errors=[],name=scenario+'-'+viewport.width;
 let holdRetry=false;
 const report={scenario,viewport,synthetic:true,realPhone:false,realOAuth:false,externalNetworkSent:0,passed:false};
 try{
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&r.status()>=400&&/\.(?:js|css|woff2?)(?:$)/.test(u.pathname))errors.push('LOCAL_ASSET_MISSING:'+u.pathname);});await page.clock.install();
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
   if(url.origin===origin){
    if(url.pathname==='/software/inventory/employee-login.js')return route.fulfill({contentType:'application/javascript',body:"window.TlhInventoryLogin={clearToken(){},login:async()=>{},getToken:()=> 'synthetic.fixture.proof'};"});
    return route.continue();
   }
   if(url.origin==='https://script.google.com'&&req.method()==='POST'){
    const p=Object.fromEntries(new URLSearchParams(req.postData()));requests.push({action:p.action,phase:p.phase||'',command:p.command||''});
    try{return route.fulfill({contentType:'text/html; charset=utf-8',body:replyHTML(holdRetry&&p.action==='bridgeAccountAccessOverviewV1'?null:fixtureReply(p,scenario),origin)});}catch(e){errors.push(e.message);return route.abort();}
   }
   blocked.push(url.origin+url.pathname);return route.abort();
  });
  await page.goto(origin+'/account/',{waitUntil:'domcontentloaded'});await page.locator('#account-login').click();
  if(scenario==='checking'){
   await page.waitForFunction(()=>document.getElementById('account-tab-manage').getAttribute('aria-busy')==='true');assert.equal(await page.evaluate(spinner),true,'SPINNER_MISSING');
   // Mutation check: this assertion must detect a removed visual spinner.
   const mutation=await page.addStyleTag({content:'.account-tabs [aria-busy=true]::after{animation:none!important;content:none!important}'});assert.equal(await page.evaluate(spinner),false,'SPINNER_MUTATION_NOT_DETECTED');await mutation.evaluate(e=>e.remove());report.spinnerMutationDetected=true;
  }else if(scenario==='unregistered'){
   await page.locator('#account-create').waitFor({state:'visible'});assert.equal(await page.locator('#activation-register').isVisible(),false,'DUPLICATE_REGISTER_CTA');assert.equal(await page.locator('#activation-code-entry').isVisible(),false,'CODE_SHOWN_BEFORE_REGISTRATION');assert.equal(await page.locator('#activation-lock').isVisible(),false,'EMPTY_ACTIVATION_FIELDSET');
  }else if(scenario==='error'){
   await page.waitForFunction(()=>document.getElementById('account-tab-manage').getAttribute('data-state')==='error');assert.equal(await page.locator('#account-create').isVisible(),false,'ERROR_IS_NOT_UNREGISTERED');
   assert.equal(await page.locator('#account-management-details > summary').isVisible(),true,'ERROR_SUMMARY_MISSING');assert.equal(await page.locator('#account-management-details').evaluate(e=>e.open),false,'ERROR_DETAILS_AUTO_OPEN');assert.equal(await page.locator('#account-role-check').isVisible(),false,'RETRY_NOT_COLLAPSED');assert.match(await page.locator('#account-status').textContent(),/確認できません/,'ERROR_STILL_SHOWS_PENDING');assert.equal(await page.locator('#activation-code').isVisible(),false,'UNKNOWN_REGISTRATION_CODE_VISIBLE');assert.equal(await page.locator('#activation-claim').isVisible(),false,'UNKNOWN_REGISTRATION_CLAIM_VISIBLE');assert.equal(await page.locator('#account-read-retry').isVisible(),true,'SELF_RETRY_MISSING');
  }else{
   await page.waitForFunction(()=>document.getElementById('account-status').textContent.includes('登録済み'));
   assert.equal(await page.locator('#account-create').isVisible(),false,'REGISTER_SHOWN_FOR_EXISTING');
   if(scenario==='management-error'){await page.waitForFunction(()=>document.getElementById('account-tab-manage').getAttribute('data-state')==='error');assert.equal(await page.locator('#activation-code').isVisible(),true,'MANAGEMENT_FAILURE_HIDES_VALID_CLAIM');assert.equal(await page.locator('#activation-claim').isEnabled(),true);assert.equal(await page.locator('#account-read-retry').isVisible(),false,'MANAGEMENT_FAILURE_INVALIDATES_REGISTRATION');}
   if(['unknown','success'].includes(scenario)){
    await page.locator('#activation-code').fill('a'.repeat(64));await page.locator('#activation-claim').click();await page.locator('#activation-preview').waitFor({state:'visible'});
    assert.equal(await page.locator('#activation-inputs').isVisible(),false,'PREVIEW_DUPLICATES_INPUT');await page.locator('#activation-commit').click();
    if(scenario==='unknown'){
     await page.clock.fastForward(31000);await page.locator('#activation-retry').waitFor({state:'visible'});assert.equal(await page.locator('#activation-inputs').isVisible(),false);assert.equal(await page.locator('#activation-cancel').isEnabled(),false);assert.equal(await page.evaluate(()=>window.TlhAccountNavigation.canLeave()),false);assert.equal(await page.locator('#account-apps').isVisible(),false,'UNKNOWN_OFFERS_APP_EXIT');assert.equal(requests.filter(r=>r.phase==='COMMIT').length,1,'AUTOMATIC_COMMIT_RETRY');
    }else{await page.locator('#activation-open').waitFor({state:'visible'});assert.equal(await page.locator('#activation-open').evaluate(e=>{const other=document.getElementById('activation-cancel'),s=getComputedStyle(e);return !!(e.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING)&&e.getBoundingClientRect().height>=44&&s.backgroundColor!=='rgba(0, 0, 0, 0)';}),true,'SUCCESS_APP_NOT_PRIMARY');assert.equal(await page.evaluate(()=>window.TlhAccountNavigation.canLeave()),true);assert.equal(requests.filter(r=>r.phase==='COMMIT').length,1);}
   }
  }
  if(scenario==='checking'){assert.equal(await page.locator('#account-create').isVisible(),false,'CHECKING_IS_NOT_UNREGISTERED');assert.equal(await page.locator('#activation-code').isVisible(),false,'CHECKING_OFFERS_CLAIM');assert.equal(await page.locator('#account-status').getAttribute('aria-busy'),'true','SELF_SPINNER_MISSING');}
  await page.evaluate(()=>document.fonts.ready);assert.deepEqual(errors,[],'BROWSER_OR_UNEXPECTED_CONTRACT_ERROR');
  const metrics=await page.evaluate(()=>({fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,tabStates:[...document.querySelectorAll('.account-tabs button')].map(e=>({id:e.id,state:e.dataset.state,busy:e.getAttribute('aria-busy')}))}));
  metrics.visibleButtons=await page.evaluate(collectViewportButtons);
  assert.ok(metrics.scrollWidth<=metrics.width,'HORIZONTAL_OVERFLOW');report.metrics=metrics;report.requests=requests;report.blockedExternalResources=blocked;
  await page.screenshot({path:path.join(output,name+'-viewport.png')});await page.screenshot({path:path.join(output,name+'-full.png'),fullPage:true});
  if(scenario==='checking'){await page.clock.fastForward(31000);await page.waitForFunction(()=>document.getElementById('account-tab-manage').getAttribute('data-state')==='error');assert.equal(await page.evaluate(spinner),false,'TIMEOUT_SPINNER_STUCK');report.timeoutSettled=true;await page.screenshot({path:path.join(output,name+'-timeout.png')});}
  if(scenario==='error'){
   // Capture the initial collapsed error above, then verify its explicit recovery path.
   await page.locator('#account-management-details > summary').click();assert.equal(await page.locator('#account-role-check').isVisible(),true,'EXPANDED_RETRY_MISSING');
   holdRetry=true;const retried=page.waitForRequest(r=>r.method()==='POST'&&new URLSearchParams(r.postData()).get('action')==='bridgeAccountAccessOverviewV1');await page.locator('#account-read-retry').click();await retried;
   await page.waitForFunction(()=>document.getElementById('account-tab-manage').getAttribute('aria-busy')==='true');assert.equal(await page.evaluate(spinner),true,'RETRY_SPINNER_MISSING');
   await page.waitForFunction(()=>document.getElementById('account-status').textContent.includes('確認しています'));
   report.explicitRetrySpinner=true;await page.screenshot({path:path.join(output,name+'-retry.png')});
  }
  report.passed=true;
 }catch(e){failed=true;report.error=e.message;report.errors=errors;report.requests=requests;report.blockedExternalResources=blocked;await page.screenshot({path:path.join(output,name+'-FAIL.png'),fullPage:true}).catch(()=>{});}
 finally{reports.push(report);await context.close();}
}
}finally{await browser.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(output,'report.json'),JSON.stringify({browser:'official Playwright Chromium',sourceSha:process.env.GITHUB_SHA||'local-uncommitted',reports},null,2));}
console.log(JSON.stringify({synthetic:true,cases:reports.length,passed:reports.filter(x=>x.passed).length,artifacts:'qa-artifacts/account-visual'}));if(failed)process.exitCode=1;
