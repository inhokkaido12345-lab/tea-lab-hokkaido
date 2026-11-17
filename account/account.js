/**
 * 共通アカウントの入口。LINE証明→既存本人情報・登録・従業員招待へ接続する。
 * account/index.htmlから呼ぶ。打刻・シフト・在庫の業務controllerは初期化しない。
 * 削除影響: この入口だけ停止。既存アプリ・ID・原簿には変更しない。
 * 概念: composition root（既存機能を組み合わせる起点）とidentity/authorizationの分離。
 * 改造: 認証はInventoryの固定popup broker、本人情報・招待はworkforceのcontrollerと契約を共有。
 * 秘密はページメモリとPOST bodyだけ。一般登録の受付・権限はサーバーが判断する。
 * 検証: tests/common-account.test.mjs、既存account-info/staff-enrollment試験。実登録は模擬試験に使わない。
 */
(function(global){
 'use strict';
 const $=id=>document.getElementById(id),login=$('account-login'),status=$('account-status');
 const create=$('account-create'),createStatus=$('account-create-status'),enrollment=$('account-enrollment-lock');
 let common=null,grants=null,access=null,staff=null;
 const endpoint=global.TlhAccountInfo.config.gasUrl;
 const messages=Object.freeze({CREATED:'登録処理の応答を受け取りました。本人情報を再確認しています。確認できたアカウントIDを管理者へ共有してください。',
  ALREADY_REGISTERED:'登録済みの応答を受け取りました。最新の本人情報を再確認しています。',
  SIGNUP_RATE_LIMITED:'新規登録が集中しています。時間を置いて再試行してください。',
  SIGNUP_CLOSED:'一般アカウントの新規登録は受付停止中です。管理者に受付再開・登録方法を確認してください。在庫利用のために勤怠登録へ進む必要はありません。',
  IDENTITY_REVIEW_REQUIRED:'登録状態の確認が必要です。管理者に連絡してください。',
  INVALID_NONCE:'登録リクエストを確認できませんでした。',INVALID_ID_TOKEN_FORMAT:'本人確認情報を確認できませんでした。',
  LINE_VERIFY_REJECTED:'本人確認が拒否されました。保存状態を確認してから、画面を開き直してください。',
  REGISTRATION_UNAVAILABLE:'登録結果を確認できません。同じ登録の結果を確認してください。',
  REGISTRATION_ERROR:'登録結果を確認できません。同じ登録の結果を確認してください。'});
 let stopped=false,loggingIn=false,ready=false,viewer=null,request=null;
 const tabs=global.TlhAccountTabs?.init({busy:()=>!!request||!!common?.busy()||!!grants?.busy()||!!staff?.busy(),check:()=>common?.checkManagement(),checkRoles:()=>access?.refresh()});
 const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 // GAS応答は入れ子iframeから届く。別iframeの同名メッセージを受け付けない。
 function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch{}return false;}
 function refreshSelf(){if(!stopped)access?.refresh();}
 function controls(){
  login.disabled=stopped||loggingIn||ready;
  create.disabled=stopped||!ready||!!request?.timer||!!common?.busy()||!!grants?.busy();
  enrollment.disabled=stopped||!ready||!!request||!!common?.busy()||!!grants?.busy();
  $('common-lock').disabled=stopped||!ready||!!request||!!grants?.busy();
  $('grant-lock').disabled=stopped||!ready||!!request||!!common?.busy();
  createStatus.setAttribute('aria-busy',String(!!request?.timer));
  // A sibling operation can finish after this picker discarded an in-flight read.
  common?.syncPicker?.();grants?.syncPicker?.();tabs?.sync();
 }
 login.addEventListener('click',async()=>{
  if(stopped||loggingIn||ready||global!==global.top)return;
  loggingIn=true;controls();status.textContent='LINEで本人確認しています…';
  try{
   // Explicit user login must use the broker's reauthentication path, not replay LIFF's
   // possibly rejected cached proof after a page reload. Never run this on a save retry.
   global.TlhInventoryLogin.clearToken();
   await global.TlhInventoryLogin.login();if(stopped)return;
   if(!global.TlhInventoryLogin.getToken())throw Error('AUTH_REQUIRED');
   const proof=Object.freeze({getIDToken:()=>stopped?null:global.TlhInventoryLogin.getToken()});
   viewer=global.TlhAccountInfo.init({gasUrl:endpoint,liff:proof});
   staff=global.TlhStaffEnrollment.init({gasUrl:endpoint,liff:proof,onState:controls});
   common=global.TlhCommonAffiliation?.init({gasUrl:endpoint,liff:proof,blocked:()=>!!request||!!grants?.busy()||$('staff-status').getAttribute('aria-busy')==='true',onState:controls,onSuccess:refreshSelf,onManagement:state=>tabs?.management(state,'common')});
   grants=global.TlhCommonGrants?.init({gasUrl:endpoint,liff:proof,blocked:()=>!!request||!!common?.busy()||$('staff-status').getAttribute('aria-busy')==='true',onState:controls,onSuccess:refreshSelf,onManagement:state=>tabs?.management(state,'grant')});
   access=global.TlhAccountAccessOverview?.init({gasUrl:endpoint,liff:proof,onVerified:(d,state)=>{tabs?.roles(d,state);const root=d?.operatingRoles.some(r=>r.role==='PLATFORM_OPERATOR'&&r.effective);$('account-platform-link').hidden=!root;$('account-platform-reason').textContent=root?'Platform運営ロールを確認しました。個々の操作には追加の会社権限確認があります。':d?'Platform全体の運営権限はありません。会社・店舗管理とは別です。':'Platform運営権限は未確認です。利用条件を更新して確認してください。';}});
   ready=true;tabs?.ready();$('account-tools').hidden=false;login.hidden=true;$('account-reload').hidden=false;
   status.textContent='LINEから本人確認情報を受け取りました。登録状態を確認しています。';viewer.load();access?.load();
  }catch{
   if(!stopped)status.textContent='本人確認を開始できませんでした。ポップアップの許可と通信状態を確認し、もう一度お試しください。';
  }finally{loggingIn=false;controls();}
 });
 /** 一般登録だけを明示POST。結果不明時は同じnonceと本人で照会し、他の保存を開始させない。 */
 function submitRegistration(){
  if(stopped||!ready||common?.busy()||grants?.busy()||request?.timer||$('staff-status').getAttribute('aria-busy')==='true'||global!==global.top)return;
  const proof=global.TlhInventoryLogin.getToken();if(!proof)return;
  if(!request){
   if(!global.confirm('このLINEにTLHアカウントを作成します。従業員・管理者の権限は付きません。続けますか？'))return;
   request={nonce:random(),timer:null};
  }
  const current=request;
  current.timer=setTimeout(()=>{
   if(stopped||request!==current)return;current.timer=null;
   createStatus.textContent='登録結果を確認できません。同じ登録の結果を確認してください。画面を離れる前に結果を確認してください。';
   create.textContent='同じ登録の結果を確認';controls();
  },30000);
  controls();createStatus.textContent='アカウントの登録結果を確認しています…';
  const form=document.createElement('form');form.method='POST';form.action=endpoint;form.target='tlhCommonAccountCreateFrame';form.hidden=true;
  for(const [name,value] of Object.entries({action:'bridgeCreateAccount',nonce:current.nonce,idToken:proof})){
   const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
  }
  document.body.appendChild(form);
  try{global.TlhCurrentWorkplace.submit(form);}catch{
   clearTimeout(current.timer);current.timer=null;create.textContent='同じ登録の結果を確認';
   createStatus.textContent='送信結果を確認できません。同じ登録の結果を確認してください。';controls();
  }finally{form.remove();}
 }
 create.addEventListener('click',submitRegistration);
 global.addEventListener('message',event=>{
  const current=request,d=event.data;
  if(stopped||!current||!related(event.source,$('account-create-frame').contentWindow)||
   !(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin))||
   !d||Object.keys(d).sort().join(',')!=='code,nonce,type'||d.type!=='TLH_BRIDGE_ACCOUNT_CREATED'||d.nonce!==current.nonce||!Object.hasOwn(messages,d.code))return;
  clearTimeout(current.timer);current.timer=null;createStatus.textContent=messages[d.code];
  if(['REGISTRATION_UNAVAILABLE','REGISTRATION_ERROR'].includes(d.code)){create.textContent='同じ登録の結果を確認';controls();return;}
  request=null;create.textContent='自分のTLHアカウントを作成';controls();
  if(['CREATED','ALREADY_REGISTERED'].includes(d.code))refreshSelf();
 });
 global.addEventListener('pagehide',()=>{
  stopped=true;ready=false;if(request)clearTimeout(request.timer);request=null;viewer=null;
  $('account-tools').hidden=true;createStatus.textContent='';status.textContent='画面を離れたため本人確認情報を消去しました。';controls();
 });
 // 戻るキャッシュに以前の本人・招待情報を復活させない。保存の自動再送はしない。
 global.addEventListener('pageshow',event=>{if(event.persisted)global.location.reload();});
 controls();
})(window);
