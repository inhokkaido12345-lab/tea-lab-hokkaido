/**
 * 共通Accountのブラウザー受入れ検査。全HTTPSを模擬応答に置換し、実登録/実打刻はしない。
 * npm install --no-save playwright → npx playwright install chromium → node qa/common-account-browser.cjs
 * 任意指定: PLAYWRIGHT_MODULE（既存依存の絶対パス）、BROWSER_EXECUTABLE（ブラウザーの絶対パス）。
 * sourceと署名の拒否はtests/common-account/account-info/staff-enrollmentで別途検査する。
 */
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
async function verify(options={}){
 const chromium=options.chromium||require(process.env.PLAYWRIGHT_MODULE||'playwright').chromium;
 const executablePath=options.executablePath||process.env.BROWSER_EXECUTABLE;
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'tlh-account-'));
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const reports=[];
 try{for(const width of [320,390,1280]){
  let registered=false,invitation='',actions=[],errors=[],proof='fake.admin.proof';
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin==='https://tealabhokkaido.com'){
    if(url.pathname==='/software/inventory/employee-login.js')return route.fulfill({contentType:'application/javascript; charset=utf-8',body:options.loginSource||await fs.readFile(path.join(root,'software/inventory/employee-login.js'))});
    if(['/software/worktime/inventory/auth/','/workforce/inventory/auth/'].includes(url.pathname))return route.fulfill({contentType:'text/html; charset=utf-8',body:options.authHTML||await fs.readFile(path.join(root,'workforce/inventory/auth/index.html'))});
    if(['/software/worktime/inventory/auth/auth.js','/workforce/inventory/auth/auth.js'].includes(url.pathname))return route.fulfill({contentType:'application/javascript; charset=utf-8',body:options.authSource||await fs.readFile(path.join(root,'workforce/inventory/auth/auth.js'))});
    const name=url.pathname==='/account/'?'account/index.html':url.pathname.slice(1);
    if(!name.startsWith('account/')&&!name.startsWith('workforce/'))throw Error('UNEXPECTED_SITE_ROUTE');
    const mime=name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'text/html';
    return route.fulfill({contentType:mime+'; charset=utf-8',body:await fs.readFile(path.join(root,name))});
   }
   if(url.origin==='https://static.line-scdn.net')return route.fulfill({contentType:'application/javascript; charset=utf-8',body:'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>false,getIDToken:()=>'+JSON.stringify(proof)+'};'});
   if(url.origin!=='https://script.google.com')throw Error('UNEXPECTED_EXTERNAL_ROUTE');
   const p=Object.fromEntries(new URLSearchParams(req.postData()));actions.push(p.action);let d;
   if(p.action==='bridgeCreateAccount')d={type:'TLH_BRIDGE_ACCOUNT_CREATED',nonce:p.nonce,code:'SIGNUP_CLOSED'};
   else if(p.action==='bridgeGetAccountInfo'){
    const ready=p.idToken==='fake.admin.proof'||registered;
    const info={version:1,tlhAccountId:'usr_fixture',accountStatus:'ACTIVE',currentLoginProvider:'LINE',linkedProviders:['LINE'],
     employee:registered?{employeeCode:'INV900',name:'架空の在庫スタッフ',status:'ACTIVE',hireDate:'',terminationDate:''}:null,
     permissions:{workforceEmployee:registered,globalAdmin:p.idToken==='fake.admin.proof'}};
    d={type:'TLH_BRIDGE_ACCOUNT_INFO',nonce:p.nonce,action:p.action,code:ready?'ACCOUNT_INFO_READY':'ACCOUNT_INFO_NOT_REGISTERED',info:ready?JSON.stringify(info):''};
    d.mac=crypto.createHmac('sha256',p.responseKey).update([d.type,d.nonce,d.action,d.code,d.info].join('\n')).digest('hex');
   }else{
    let code='INVALID_REQUEST';
    if(p.action==='bridgeCheckStaffEnrollment')code='STAFF_ADMIN_READY';
    if(p.action==='bridgeIssueStaffInvitation'){invitation=p.inviteToken;code='STAFF_INVITATION_READY';}
    if(p.action==='bridgeClaimStaffInvitation'){if(p.inviteToken!==invitation)throw Error('WRONG_INVITATION');registered=true;code='STAFF_REGISTERED';}
    d={type:'TLH_BRIDGE_STAFF_ENROLLMENT',nonce:p.nonce,action:p.action,code};
    d.mac=crypto.createHmac('sha256',p.responseKey).update([d.type,d.nonce,d.action,d.code].join('\n')).digest('hex');
   }
   return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+JSON.stringify(d).replaceAll('<','\\u003c')+',"https://tealabhokkaido.com")</script>'});
  });
  const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));admin.on('dialog',d=>d.accept());
  await admin.addInitScript(()=>{window.fixtureProof='fake.admin.proof';});await admin.goto('https://tealabhokkaido.com/account/');
  if(actions.length)throw Error('AUTOMATIC_REQUEST');
  await admin.screenshot({path:path.join(output,'initial-'+width+'.png'),fullPage:true});
  await admin.locator('#account-login').click();await admin.waitForFunction(()=>!document.getElementById('account-info-result').hidden);
  await admin.getByText('この勤務先の管理者の方',{exact:true}).click();await admin.locator('#staff-check').click();await admin.locator('#staff-admin').waitFor({state:'visible'});
  await admin.locator('#staff-employee-code').fill('INV900');await admin.locator('#staff-name').fill('架空の在庫スタッフ');
  await admin.locator('#staff-issue').click();await admin.locator('#staff-invite-box').waitFor({state:'visible'});
  const code=await admin.locator('#staff-issued-code').inputValue();if(code!==invitation)throw Error('INVITATION_MISMATCH');
  const worker=await context.newPage();worker.on('pageerror',e=>errors.push(e.message));worker.on('dialog',d=>d.accept());
  proof='fake.worker.proof';await worker.goto('https://tealabhokkaido.com/account/');
  await worker.locator('#account-login').click();await worker.waitForFunction(()=>document.getElementById('account-info-status').textContent.includes('まだ登録されていません'));
  await worker.getByText('TLHアカウントをまだ持っていない方',{exact:true}).click();await worker.locator('#account-create').click();
  await worker.waitForFunction(()=>document.getElementById('account-create-status').textContent.includes('受付停止中'));
  await worker.locator('#staff-claim-code').fill(code);await worker.locator('#staff-claim').click();
  await worker.waitForFunction(()=>document.getElementById('staff-status').textContent==='従業員登録が完了しました。');
  await worker.locator('#account-info-check').click();await worker.waitForFunction(()=>!document.getElementById('account-info-result').hidden);
  if(!(await worker.locator('#account-info-fields').textContent()).includes('架空の在庫スタッフ'))throw Error('EMPLOYEE_NOT_SHOWN');
  if(await worker.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('HORIZONTAL_OVERFLOW');
  if(errors.length)throw Error('BROWSER_ERRORS');
  await worker.screenshot({path:path.join(output,'registered-'+width+'.png'),fullPage:true});
  reports.push({width,registered,actions,errors:0});await context.close();
 }}finally{await browser.close();}
 return {output,reports};
}
module.exports={verify};
if(require.main===module)verify().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
