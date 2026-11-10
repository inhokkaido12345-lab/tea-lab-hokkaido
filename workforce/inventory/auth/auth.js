/**
 * 共通LIFF Endpoint内の認証窓口（旧URLは互換転送を経由）。/software/inventory/のemployee-login.jsが明示操作で開く。
 * SDK初期化→本人ログイン→openerへREADY→nonce付き要求→結果1回返信。
 * 削除で独立PWAの本人確認不可。WorkTimeの打刻/社員データは扱わない。
 * 概念: authentication broker / auxiliary browsing context / challenge correlation。
 * 改造はemployee-login.js・生成先・employee-login.testを同期する。
 * tokenは固定originとopenerにだけ送り、URL/Storage/consoleへ記録しない。
 * 検証: 偽source/origin/nonceと二重返信の模擬検査。実機OAuth復帰は別途確認。
 */
(async function(global){
 'use strict';
 const origin='https://tealabhokkaido.com',status=document.getElementById('auth-status');
 let ready=false,done=false;
 if(global.location.origin!==origin||global.location.pathname!=='/software/worktime/inventory/auth/'||!global.opener){
  status.textContent='在庫アプリの「LINEでログイン」から開いてください。';return;
 }
 global.addEventListener('message',event=>{
  const data=event.data;
  if(!ready||done||event.origin!==origin||event.source!==global.opener||
    !data||data.type!=='TLH_INVENTORY_LOGIN_REQUEST'||!/^[a-f0-9]{32}$/.test(data.nonce||''))return;
  const token=global.liff.getIDToken();done=true;
  global.opener.postMessage({type:'TLH_INVENTORY_LOGIN_RESULT',nonce:data.nonce,
   code:token?'OK':'AUTH_REQUIRED',...(token?{idToken:token}:{})},origin);
  status.textContent='本人確認が完了しました。在庫画面へ戻ってください。';
 });
 try{
  await global.liff.init({liffId:'2011940133-JXUDzLnG'});
  if(!global.liff.isLoggedIn()){
   global.liff.login({redirectUri:origin+'/software/worktime/inventory/auth/'});return;
  }
  ready=true;status.textContent='在庫アプリへ本人確認の結果を返しています…';
  global.opener.postMessage({type:'TLH_INVENTORY_LOGIN_READY'},origin);
 }catch{status.textContent='LINE本人確認に接続できません。在庫画面からやり直してください。';}
 global.addEventListener('pagehide',()=>{ready=false;done=true;});
})(window);
