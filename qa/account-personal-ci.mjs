/** Synthetic personal entry only. No real LINE/account or external HTTP. */
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {fixtureReply,replyHTML} from './account-visual-fixtures.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname),out=path.join(root,'qa-artifacts/account-personal');
const {chromium}=createRequire(import.meta.url)(path.join(root,'.qa-tools/node_modules/playwright'));
await fs.mkdir(out,{recursive:true});const mime={'.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.html':'text/html'};
const server=http.createServer(async(req,res)=>{try{let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('PATH');const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),reports=[];
try{for(const width of [390,1280])for(const scenario of ['signup','unknown-service','unsafe-path','registration-error']){
 const context=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block',locale:'ja-JP'}),page=await context.newPage(),errors=[],requests=[];let registered=scenario!=='signup',hold=false,waiting=null;
 const report={width,scenario,synthetic:true,realLINE:false,passed:false,screens:[]};
 async function shot(stage){await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const name=`${scenario}-${width}-${stage}.png`;await page.screenshot({path:path.join(out,name),fullPage:true});report.screens.push(name);}
 try{
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin){
 if(u.pathname==='/software/inventory/employee-login.js')return route.fulfill({contentType:'application/javascript',body:"window.TlhInventoryLogin={clearToken(){},login:async()=>{},getToken:()=> 'synthetic.fixture.proof'};"});
 if(u.pathname==='/account/activation-services.js'&&scenario==='unsafe-path')return route.fulfill({contentType:'application/javascript',body:"window.TlhActivationServices=[{serviceId:'INVENTORY',label:'在庫',path:'/\\\\evil.test/',permissions:[]}];"});
 return route.continue();}
 if(u.origin==='https://script.google.com'&&req.method()==='POST'){const p=Object.fromEntries(new URLSearchParams(req.postData()));requests.push(p.action);let reply;
 if(p.action==='bridgeCreateAccount'){assert.equal(scenario,'signup');registered=true;hold=true;reply={type:'TLH_BRIDGE_ACCOUNT_CREATED',nonce:p.nonce,code:'CREATED'};}
 else if(p.action==='bridgeAccountAccessOverviewV1'){if(hold){waiting={route,p};return;}reply=fixtureReply(p,scenario==='registration-error'?'error':registered?'existing':'unregistered');}
 else throw Error('UNEXPECTED_ACTION:'+p.action);
 return route.fulfill({contentType:'text/html',body:replyHTML(reply,origin)});}
 errors.push('BLOCKED_EXTERNAL:'+u.origin);return route.abort();});
 const query=scenario==='unknown-service'?'?purpose=personal&service=UNKNOWN':'?purpose=personal&service=INVENTORY';
 await page.goto(origin+'/account/'+query);assert.match(await page.locator('#account-login-intro').textContent(),/コードは不要/);assert.equal(requests.length,0);await shot('before-login');await page.locator('#account-login').click();
 if(scenario==='signup'){
 await page.locator('#account-create').waitFor({state:'visible'});assert.equal(await page.locator('#activation-code').isVisible(),false);await shot('unregistered');await page.locator('#account-create').click();await page.waitForFunction(()=>document.getElementById('account-create-status').textContent.includes('再確認'));assert.equal(await page.locator('#account-personal-ready').isVisible(),false);await shot('awaiting-verification');
 for(let i=0;i<100&&!waiting;i++)await new Promise(r=>setTimeout(r,20));assert.ok(waiting);await waiting.route.fulfill({contentType:'text/html',body:replyHTML(fixtureReply(waiting.p,'existing'),origin)});hold=false;
 await page.locator('#account-personal-ready').waitFor({state:'visible'});assert.equal(await page.locator('#account-personal-return').getAttribute('href'),'/software/inventory/');assert.equal(await page.locator('#account-personal-return').evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.top>=0&&r.bottom<innerHeight&&getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)';}),true,'RETURN_NOT_PRIMARY_IN_VIEWPORT');assert.equal(requests.filter(x=>x==='bridgeCreateAccount').length,1);assert.equal(requests.some(x=>x.includes('Activation')),false);await shot('registered-return');
 }else{await page.waitForFunction(()=>/登録済み|確認できません/.test(document.getElementById('account-status').textContent));assert.equal(await page.locator('#account-personal-ready').isVisible(),false);if(scenario==='registration-error')assert.equal(await page.locator('#account-read-retry').isVisible(),true);await shot('no-return');}
 assert.deepEqual(errors,[]);report.passed=true;
 }catch(e){report.error=e.message;await shot('FAIL').catch(()=>{});}finally{report.errors=errors;report.requests=requests;reports.push(report);await context.close();}
}}finally{await browser.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA||'local',reports},null,2));}
console.log(JSON.stringify({cases:reports.length,passed:reports.filter(x=>x.passed).length}));if(reports.some(x=>!x.passed))process.exitCode=1;
