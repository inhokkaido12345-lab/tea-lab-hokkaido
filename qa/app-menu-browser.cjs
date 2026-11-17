/** Real Chromium, synthetic pages only. All requests are intercepted; production is never contacted.
 * Run: node qa/app-menu-browser.cjs [output-directory]
 * Optional PLAYWRIGHT_MODULE/BROWSER_EXECUTABLE. A host may import run() and supply its browser.
 */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function run({browser,root=path.resolve(__dirname,'..'),output=path.resolve(root,'qa-output/app-menu')}={}){
 await fs.mkdir(output,{recursive:true});const results=[];
 for(const width of [320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600}),errors=[],requests=[];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());requests.push({method:req.method(),path:url.pathname});
   assert.equal(req.method(),'GET');assert.equal(url.origin,'https://tealabhokkaido.com');
   if(['/account/','/software/inventory/','/software/worktime/'].includes(url.pathname))return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Destination stub</title><p>Test destination. No login or data access.</p>'});
   const name=url.pathname==='/prototypes/app-menu/'?'prototypes/app-menu/index.html':url.pathname.slice(1);
   assert.ok(name.startsWith('prototypes/app-menu/')||name.startsWith('shared/app-menu/'));
   const contentType=name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html';
   return route.fulfill({contentType,body:await fs.readFile(path.join(root,name))});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  // Sensitive source parameters must never be carried into a destination.
  await page.goto('https://tealabhokkaido.com/prototypes/app-menu/?idToken=source-fixture&organizationId=private-scope#draft');
  const trigger=page.getByRole('button',{name:'アプリ',exact:true}),dialog=page.getByRole('dialog');
  await page.locator('#demo-draft').fill('保持する下書き');if(width<600)await trigger.tap();else await trigger.click();await dialog.waitFor({state:'visible'});
  assert.equal(await trigger.getAttribute('aria-expanded'),'true');
  assert.equal(await dialog.locator('[data-app-id]').count(),4);assert.equal(await dialog.locator('a').count(),2);
  assert.equal(await dialog.locator('[data-app-id=inventory]').getAttribute('aria-current'),'page');
  assert.equal(await dialog.locator('[data-app-id=pos]').getAttribute('href'),null);
  assert.match(await dialog.locator('[data-app-id=worktime]').innerText(),/移動先で確認/);
  assert.equal(requests.length,6,'opening the menu must not fetch permissions or extra assets');
  for(const a of await dialog.locator('a').all()){
   assert.equal(await a.getAttribute('target'),'_blank');assert.equal(await a.getAttribute('rel'),'noopener noreferrer');
   assert.equal(await a.getAttribute('referrerpolicy'),'no-referrer');assert.match(await a.getAttribute('href'),/^\/(account|software\/(worktime|inventory))\/$/);
  }
  const bb=await dialog.boundingBox();assert.ok(bb.x>=0&&bb.x+bb.width<=width+1);assert.ok(bb.y>=0&&bb.y+bb.height<=901);
  assert.ok((await trigger.boundingBox()).height>=44);
  // Native modal traps focus; Escape closes and restores the initiating control.
  for(let i=0;i<7;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)),true);}
  for(let i=0;i<5;i++){await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)),true);}
  await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(n=>document.activeElement===n),true);
  await trigger.click();await dialog.locator('[data-app-id=account]').click();assert.match(await page.locator('#demo-destination').innerText(),/TLHアカウント.*\/account\//);
  assert.equal(context.pages().length,1);assert.equal(await page.locator('#demo-draft').inputValue(),'保持する下書き');
  await page.keyboard.press('Escape');await page.locator('#demo-current').selectOption('account');await page.locator('#demo-scenario').selectOption('inventory-only');await trigger.click();
  assert.match(await dialog.locator('[data-app-id=worktime]').innerText(),/利用権限なし/);assert.equal(await dialog.locator('[data-app-id=worktime]').getAttribute('href'),null);
  assert.match(await dialog.locator('[data-app-id=inventory]').innerText(),/確認済み/);
  await page.screenshot({path:path.join(output,'menu-'+width+'.png'),fullPage:false});
  await page.keyboard.press('Escape');await page.locator('#demo-saving').check();await trigger.click();await dialog.locator('[data-app-id=inventory]').click();assert.match(await page.locator('#demo-destination').innerText(),/保存結果が未確認/);assert.equal(context.pages().length,1);
  await page.keyboard.press('Escape');await page.locator('#demo-saving').uncheck();
  // Exercise the reusable component directly (not the demo's intentionally blocked links).
  await page.evaluate(()=>{
   window.testSlot=document.createElement('div');document.body.append(window.testSlot);
   window.testNavigationDecision=true;window.testMenu=TlhAppMenu.mount(window.testSlot,{currentApp:'account',beforeNavigate:()=>window.testNavigationDecision});
   window.testMenu.setAccessHints({inventory:'available',worktime:'available'});window.testSlot.querySelector('button').click();
  });
  const liveDialog=page.locator('dialog[open]');await liveDialog.locator('[data-app-id=inventory]').focus();
  await page.evaluate(()=>window.testMenu.setAccessHints({inventory:'unavailable'}));assert.equal(await liveDialog.getByRole('button',{name:'アプリ一覧を閉じる'}).evaluate(n=>n===document.activeElement),true);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(()=>window.testSlot.querySelector('button').click());assert.match(await page.locator('dialog[open] [data-app-id=inventory]').innerText(),/移動先で確認/);
  // Async guards cannot preserve a synchronous user navigation decision; deny without throwing.
  await page.evaluate(()=>window.testNavigationDecision=Promise.resolve(true));await page.locator('dialog[open] [data-app-id=inventory]').click();assert.equal(context.pages().length,1);assert.match(await page.locator('dialog[open] [role=status]').innerText(),/保存結果が未確認/);
  await page.locator('dialog[open] [data-app-id=inventory]').click({button:'middle'});assert.equal(context.pages().length,1);
  await page.evaluate(()=>window.testNavigationDecision=true);
  const popupPromise=page.waitForEvent('popup');await page.locator('dialog[open] [data-app-id=inventory]').click();const popup=await popupPromise;await popup.waitForLoadState();
  assert.equal(popup.url(),'https://tealabhokkaido.com/software/inventory/');assert.equal(await popup.evaluate(()=>window.opener===null),true);assert.equal(await popup.evaluate(()=>document.referrer),'');await popup.close();
  await page.evaluate(()=>{window.testMenu.destroy();window.testSlot.remove();});assert.equal(await page.locator('dialog').count(),1);
  // Registry scalability: no more buttons in the header; list scrolls inside its bounded sheet.
  await page.evaluate(()=>{
   window.testSlot=document.createElement('div');document.body.append(window.testSlot);
   const extra=Array.from({length:20},(_,i)=>({id:'future'+i,title:'将来アプリ'+i,description:'追加例',mark:'＋',path:'/software/app-'+i+'/'}));
   window.testMenu=TlhAppMenu.mount(window.testSlot,{catalog:[...TlhAppCatalog.entries,...extra]});window.testSlot.querySelector('button').click();
  });
  assert.equal(await page.locator('dialog[open] [data-app-id]').count(),24);assert.equal(await page.locator('dialog[open]').evaluate(n=>n.scrollHeight>n.clientHeight),true);
  await page.evaluate(()=>{window.testMenu.destroy();window.testSlot.remove();});
  // 200% text scaling without horizontal clipping or fixed-height cards.
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');await trigger.click();
  assert.equal(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.keyboard.press('Escape');await page.evaluate(()=>document.documentElement.style.fontSize='');
  await trigger.click();if(width<600)await page.touchscreen.tap(5,5);else await page.mouse.click(5,5);assert.equal(await dialog.count(),0,'backdrop tap closes the dialog');
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'));await context.close();results.push({width,status:'PASS',sourceParametersNotForwarded:true,errors,requests:requests.length});
 }
 await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify({browser:browser.version(),mode:'all routes mocked; no production network',results},null,2));return results;
}
module.exports={run};
if(require.main===module)(async()=>{const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});try{console.log(JSON.stringify(await run({browser,output:process.argv[2]}),null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
