/** Read-only preview of the exact Account LIFF return. No registration, invitation or account data UI. */
(function(g){
 'use strict';
 const broker=g.TlhAccountLogin,endpoint=g.TlhAccountInfo?.config?.gasUrl;
 const overview=g.TlhAccountAccessOverview,preview='/account/line-preview/';
 const login=document.getElementById('preview-login'),status=document.getElementById('preview-status'),authStatus=document.getElementById('preview-auth-status'),back=document.getElementById('preview-back');
 const frame=document.getElementById('preview-frame'),intent=document.getElementById('preview-intent');
 let pending=null,stopped=false;
 function showIntent(){intent.textContent=({'?service=inventory':'店舗での在庫利用','?service=worktime':'店舗での勤怠利用','?purpose=personal&service=INVENTORY':'個人での在庫利用','?purpose=personal':'個人利用'})[g.location.search]||'アカウントの基本画面';}
 const random=n=>Array.from(g.crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
 function related(source){try{for(let n=0;source&&n<8;n++){if(source===frame.contentWindow)return true;const up=source.parent;if(!up||up===source)return false;source=up;}}catch{}return false;}
 function done(copy){if(pending)g.clearTimeout(pending.timer);pending=null;status.textContent=copy;}
 async function read(){
  if(pending||stopped||g!==g.top||g.location.pathname!==preview||!overview||!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint||'')||!broker?.getToken())return;
  const r={nonce:random(16),responseKey:random(32),proof:broker.getToken()};pending=r;
  status.textContent='本人確認とアカウントの読み取りを照合しています…';
  r.timer=g.setTimeout(()=>{if(pending===r)done('読み取りを確認できませんでした。通常のアカウント画面は変更していません。');},30000);
  const form=document.createElement('form');form.method='POST';form.action=endpoint;form.target=frame.name;form.hidden=true;
  for(const [name,value] of Object.entries({action:'bridgeAccountAccessOverviewV1',phase:'READ_SELF',nonce:r.nonce,responseKey:r.responseKey,idToken:r.proof})){
   const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);
  }
  document.body.appendChild(form);
  try{form.submit();}catch{done('読み取りに接続できませんでした。');}finally{form.remove();}
 }
 g.addEventListener('message',async e=>{
  const r=pending;if(stopped||!r||!related(e.source)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
  let ok=false;try{ok=await overview.verify(e.data,r);}catch{}
  if(!ok||stopped||pending!==r||broker.getToken()!==r.proof)return;
  if(e.data.code==='ACCOUNT_ACCESS_OVERVIEW_READY'&&overview.parse(e.data.data))done('LINEログインとアカウントの読み取りを確認できました。保存はしていません。');
  else if(e.data.code==='COMMON_ACCOUNT_NOT_REGISTERED')done('LINEログインと未登録の確認ができました。作成・保存はしていません。');
  else done('アカウントの読み取りを確認できませんでした。通常のアカウント画面は変更していません。');
 });
 g.addEventListener('pagehide',()=>{stopped=true;done('');});
 if(broker?.version!==1){authStatus.textContent='ログイン試験を開始できません。';return;}
 if(!broker.isReturning()){
  showIntent();login.hidden=false;
  login.addEventListener('click',async()=>{login.disabled=true;status.textContent='LINEで本人確認しています…';try{broker.clearToken();await broker.login();}catch{login.disabled=false;status.textContent='LINEに接続できませんでした。';}});
  return;
 }
 broker.resume().then(result=>{
  if(stopped)return;
  back.href=broker.retryPath();
  if(result!=='ready'){authStatus.textContent=result==='redirecting'?'LINEで本人確認を続けてください。':'本人確認を完了できませんでした。試験画面へ戻ってください。';return;}
  showIntent();document.body.removeAttribute('data-account-auth-return');read();
 });
})(window);
