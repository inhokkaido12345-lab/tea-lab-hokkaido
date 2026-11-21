/** Real generated account/callback in Chromium, synthetic LIFF and signed Core only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fixtureReply,replyHTML} from './account-visual-fixtures.mjs';

export async function checkAccountLineReturn({browser,root,mime}){
 const origin='https://tealabhokkaido.com',entry='/account/',callback='/software/worktime/inventory/auth/account-return/';
 const desktop='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';
 const cases=[
  {name:'personal signup',q:'?purpose=personal&service=INVENTORY',mode:'browser',reply:'unregistered',modern:true},
  {name:'store invitation',q:'?service=inventory',mode:'browser',reply:'existing',modern:true},
  {name:'installed fallback',q:'?service=inventory',mode:'standalone',modern:false},
  {name:'mobile fallback',q:'?service=inventory',ua:'Mozilla/5.0 (Linux; Android 15) Chrome/128 Mobile',mode:'browser',modern:false},
  {name:'LINE fallback',q:'?service=inventory',ua:desktop+' Line/15.1.0',mode:'browser',modern:false},
 ];
 for(const c of cases){
  const ctx=await browser.newContext({userAgent:c.ua||desktop,viewport:{width:c.modern?1280:390,height:850},serviceWorkers:'block'});
  try{
   await ctx.addInitScript(mode=>{
    const media=window.matchMedia.bind(window);
    window.matchMedia=q=>q.startsWith('(display-mode:')?{matches:q==='(display-mode: '+mode+')'}:media(q);
    window.syntheticPopups=[];
    window.open=(url)=>{window.syntheticPopups.push(url);return null;};
   },c.mode);
   const page=await ctx.newPage(),seen=[],actions=[],errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await ctx.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname==='script.google.com'&&req.method()==='POST'){
     const fields=Object.fromEntries(new URLSearchParams(req.postData()||''));
     actions.push({command:fields.action,phase:fields.phase});
     if(fields.action!=='bridgeAccountAccessOverviewV1'||fields.phase!=='READ_SELF')return route.abort();
     return route.fulfill({contentType:'text/html; charset=utf-8',body:replyHTML(fixtureReply(fields,c.reply),origin)});
    }
    if(u.href==='https://static.line-scdn.net/liff/edge/2/sdk.js')return route.fulfill({contentType:'application/javascript',body:`window.liff={init:async()=>{},isInClient:()=>false,isLoggedIn:()=>new URLSearchParams(location.search).has('code'),login:o=>location.assign(o.redirectUri+'&code=synthetic-only'),logout:()=>{},getIDToken:()=> 'synthetic.fixture.proof'};`});
    if(u.origin!==origin||req.method()!=='GET')return route.abort();
    if(!u.pathname.startsWith('/account/')&&!u.pathname.startsWith('/workforce/')&&u.pathname!==callback&&u.pathname!=='/software/inventory/employee-login.js')return route.abort();
    seen.push(u.pathname);
    const file=path.join(root,u.pathname.replace(/^\//,''),u.pathname.endsWith('/')?'index.html':'');
    try{return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
    catch{return route.fulfill({status:404,body:''});}
   });
   const target=origin+entry+c.q;await page.goto(target);
   assert.equal(await page.evaluate(()=>window.TlhAccountLogin.usePopup),!c.modern,c.name);
   assert.equal(actions.length,0);
   await page.locator('#account-login').click();
   if(c.modern){
    if(c.reply==='unregistered'){
     await page.locator('#account-create').waitFor({state:'visible'});
     assert.equal(await page.locator('#account-create').isEnabled(),true);
     assert.match(await page.locator('#account-login-intro').textContent(),/コードは不要/);
    }else{
     await page.locator('#activation-code').waitFor({state:'visible'});
     assert.equal(await page.locator('#activation-claim').isEnabled(),true);
     assert.match(await page.locator('#activation-heading').textContent(),/店舗の在庫管理/);
    }
    assert.equal(page.url(),target);
    assert.equal(await page.locator('body').getAttribute('data-account-auth-return'),null);
    assert.deepEqual(await page.evaluate(()=>window.syntheticPopups),[]);
    assert.ok(seen.filter(p=>p===callback).length>=2);
    assert.deepEqual(actions,[{command:'bridgeAccountAccessOverviewV1',phase:'READ_SELF'}]);
   }else{
    const legacy=await page.evaluate(()=>window.syntheticPopups);assert.equal(legacy.length,1);
    assert.equal(new URL(legacy[0],origin).pathname,'/software/worktime/inventory/auth/');
    assert.equal(page.url(),target);assert.equal(actions.length,0);assert.ok(!seen.includes(callback));
   }
   assert.deepEqual(errors,[],c.name);
  }finally{await ctx.close();}
 }
 console.log('ACCOUNT_LINE_RETURN_OK '+cases.length+' synthetic context/legacy cases; no mutations');
}
