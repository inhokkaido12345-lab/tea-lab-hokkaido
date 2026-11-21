/** Exact published entry + login bundle, no live traffic or real credentials. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function checkInventoryLineRouting({browser,root,mime}){
 const origin='https://tealabhokkaido.com',entry='/software/inventory/',callback='/software/worktime/inventory/auth/return/';
 const pc='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';
 const cases=[{name:'standard desktop',ua:pc,mode:'browser',modern:true},{name:'mobile browser',ua:'Mozilla/5.0 (Linux; Android 15) Chrome/128 Mobile',mode:'browser',modern:false},{name:'standalone',ua:pc,mode:'standalone',modern:false},{name:'LINE in-app',ua:pc+' Line/15.11.0',mode:'browser',modern:false}];
 for(const item of cases){
  const context=await browser.newContext({userAgent:item.ua,viewport:{width:item.modern?1280:390,height:800},serviceWorkers:'block'});
  try{
   await context.addInitScript(mode=>{
    const previous=window.matchMedia.bind(window);
    window.matchMedia=query=>query.startsWith('(display-mode:')?{matches:query==='(display-mode: '+mode+')'}:previous(query);
    window.fixturePopup=[];
    window.open=(url)=>{window.fixturePopup.push(url);return null;};
   },item.mode);
   const page=await context.newPage(),seen=[],posts=[],errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname==='script.google.com'&&req.method()==='POST'){
     posts.push({fields:new URLSearchParams(req.postData()||''),path:page.url()});
     return route.abort();
    }
    if(u.href==='https://static.line-scdn.net/liff/edge/2/sdk.js')return route.fulfill({contentType:'application/javascript',body:`window.liff={init:async()=>{},isInClient:()=>false,isLoggedIn:()=>new URLSearchParams(location.search).has('code'),login:o=>location.assign(o.redirectUri+'&code=synthetic-local-only'),getIDToken:()=> 'synthetic.header.proof',logout:()=>{}};`});
    if(u.origin!==origin||req.method()!=='GET')return route.abort();
    if(!(u.pathname.startsWith(entry)||u.pathname===callback))return route.abort();
    seen.push(u.pathname);
    const file=path.join(root,u.pathname.replace(/^\//,''),u.pathname.endsWith('/')?'index.html':'');
    return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});
   });
   await page.goto(origin+entry);await page.locator('#line-login').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>window.TlhInventoryEntryMode.sameTab),item.modern,item.name);
   const desired=item.modern?'employee-login-same-tab.js':'employee-login.js',excluded=item.modern?'employee-login.js':'employee-login-same-tab.js';
   assert.ok(seen.includes(entry+desired),item.name+' missing expected bundle');
   assert.ok(!seen.includes(entry+excluded),item.name+' mixed bundles');
   await page.locator('#line-login').click();
   if(item.modern){
    await page.waitForFunction(()=>location.pathname==='/software/inventory/'&&window.TlhInventoryLogin?.getToken()==='synthetic.header.proof');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('在庫を読み込んで'));
    const deadline=Date.now()+6000;while(posts.length===0&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));
    assert.equal(posts.length,1);assert.equal(posts[0].fields.get('command'),'ACCOUNT');assert.equal(new URL(posts[0].path).pathname,entry);
    assert.deepEqual(await page.evaluate(()=>window.fixturePopup),[]);assert.ok(seen.filter(p=>p===callback).length>=2);
   }else{
    const popups=await page.evaluate(()=>window.fixturePopup);
    assert.equal(popups.length,1);assert.equal(new URL(popups[0],origin).pathname,'/software/worktime/inventory/auth/');
    assert.equal(posts.length,0);assert.ok(!seen.includes(callback));
   }
   assert.deepEqual(errors,[],item.name);
  }finally{await context.close();}
 }
 console.log('INVENTORY_LINE_ROUTING_OK '+cases.length+' synthetic desktop/mobile/standalone/LINE states');
}
