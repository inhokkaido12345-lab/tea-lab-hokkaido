/**
 * 独立PWAの共通LINE認証窓口。/inventory/はWorkTimeのscope外で動く。
 * 明示クリック→既存LIFF Endpoint内の専用popup→source/origin/nonce照合→メモリー保持。
 * 削除で独立PWAのログイン不可。APIの本人検証・従業員認可はサーバー側で毎回行う。
 * 改造時はauth.js/employee-transport.jsと拒否テストを同期。tokenをURL/Storage/ログへ出さない。
 */
(function(global){
 'use strict';
 let token=null,pending=null,stopped=false;
 const origin='https://tealabhokkaido.com';
 const finish=(error,value)=>{
  const current=pending;if(!current)return;pending=null;clearTimeout(current.timer);
  if(error)current.reject(Error(error));else {token=value;current.resolve();}
  try{current.popup.close();}catch{}
 };
 global.addEventListener('message',event=>{
  const current=pending;
  if(stopped||!current||event.origin!==origin||event.source!==current.popup)return;
  const data=event.data;if(!data||typeof data!=='object')return;
  if(data.type==='TLH_INVENTORY_LOGIN_READY'){
   current.popup.postMessage({type:'TLH_INVENTORY_LOGIN_REQUEST',nonce:current.nonce},origin);return;
  }
  if(data.type!=='TLH_INVENTORY_LOGIN_RESULT'||data.nonce!==current.nonce)return;
  if(data.code!=='OK'){finish('AUTH_REQUIRED');return;}
  if(typeof data.idToken!=='string'||data.idToken.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.idToken))return;
  finish(null,data.idToken);
 });
 global.TlhInventoryLogin=Object.freeze({
  getToken:()=>stopped?null:token,
  login(){
   if(stopped)return Promise.reject(Error('PAGE_CLOSED'));
   if(pending)return Promise.reject(Error('BUSY'));
   const popup=global.open('/workforce/inventory/auth/','tlhInventoryLogin','popup,width=480,height=720');
   if(!popup)return Promise.reject(Error('LOGIN_POPUP_BLOCKED'));
   return new Promise((resolve,reject)=>{
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
    pending={popup,nonce,resolve,reject,timer:setTimeout(()=>finish('LOGIN_UNAVAILABLE'),180000)};
   });
  }
 });
 global.addEventListener('pagehide',()=>{stopped=true;token=null;finish('PAGE_CLOSED');});
})(window);
