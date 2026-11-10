/**
 * 共通LIFF Endpoint内の認証窓口。opener切断後も要求固有BroadcastChannelで元PWAと再接続する。
 * SDK初期化→公式ログイン→READY→nonce付き要求→結果→受領確認の順。
 * 削除で本人確認不可。WorkTimeの打刻や業務データは変更しない。
 * 概念: redirect-safe rendezvous / origin isolation / challenge correlation。
 * tokenは固定originのopener、または同一originの要求固有channelだけへ返す。
 * URL/Storage/consoleへtokenを出さない。auth-returnの診断にも秘密を含めない。
 * 変更時はemployee-login.jsと復帰・拒否テストを同期。実端末のOAuth動作は別途確認する。
 */
(async function(global){
 'use strict';
 const origin='https://tealabhokkaido.com',path='/workforce/inventory/auth/';
 const status=document.getElementById('auth-status');
 const nonce=new URLSearchParams(global.location.search||'').get('request');
 let ready=false,done=false,stopped=false,channel=null,returnTimer=null;
 if(global.location.origin!==origin||global.location.pathname!==path||!/^[a-f0-9]{32}$/.test(nonce||'')){
  status.textContent='元の在庫画面を再読み込みし、「LINEでログイン」から開いてください。';return;
 }
 try{if(global.BroadcastChannel)channel=new global.BroadcastChannel('tlh-inventory-login-'+nonce);}catch{}
 if(!global.opener&&!channel){
  status.textContent='元の画面との接続が切れました。同じブラウザーで在庫画面を開き直してください。（AUTH_RETURN_UNAVAILABLE）';return;
 }
 function receive(data,send){
  if(stopped||!data||data.nonce!==nonce)return;
  if(data.type==='TLH_INVENTORY_LOGIN_ACK'&&done){
   clearTimeout(returnTimer);status.textContent='在庫画面へ本人確認の結果を渡しました。元の画面へ戻ってください。';
   try{global.close();}catch{}return;
  }
  if(!ready||done||data.type!=='TLH_INVENTORY_LOGIN_REQUEST')return;
  const token=global.liff.getIDToken();done=true;
  send({type:'TLH_INVENTORY_LOGIN_RESULT',nonce,code:token?'OK':'AUTH_REQUIRED',...(token?{idToken:token}:{})});
  // 受領確認が返る前に、この画面だけを「完了」としない。
 }
 global.addEventListener('message',event=>{
  if(event.origin!==origin||!global.opener||event.source!==global.opener)return;
  receive(event.data,data=>global.opener.postMessage(data,origin));
 });
 if(channel)channel.onmessage=event=>{
  if(event.origin===origin)receive(event.data,data=>channel.postMessage(data));
 };
 global.addEventListener('pagehide',()=>{stopped=true;ready=false;channel?.close();clearTimeout(returnTimer);});
 try{
  await global.liff.init({liffId:'2011940133-JXUDzLnG'});
  if(stopped)return;
  if(!global.liff.isLoggedIn()){
   // 要求の目印だけを維持。ID tokenやLINE subをredirectUriに載せない。
   global.liff.login({redirectUri:origin+path+'?request='+nonce});return;
  }
  ready=true;status.textContent='LINE本人確認が完了しました。在庫画面へ結果を返しています…';
  returnTimer=setTimeout(()=>{
   status.textContent='元の在庫画面へ自動で戻れませんでした。同じブラウザーの元画面に戻って状態を確認してください。（AUTH_RETURN_UNAVAILABLE）';
  },12000);
  const packet={type:'TLH_INVENTORY_LOGIN_READY',nonce};
  if(global.opener)try{global.opener.postMessage(packet,origin);}catch{}
  channel?.postMessage(packet);
 }catch{
  status.textContent='LINE本人確認に接続できません。元の在庫画面からやり直してください。（AUTH_INIT_FAILED）';
 }
})(window);
