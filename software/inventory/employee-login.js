/**
 * 独立在庫PWAのLINE認証。明示クリックで既存Endpoint内の認証窓口を開く。
 * OAuth遷移でopenerを失っても、同一origin・要求固有BroadcastChannelで復帰する。
 * tokenはページメモリーだけ。URLへ載せるのは認証情報ではない要求nonceのみ。
 * source/origin/nonce（opener経路）、origin/固有channel/nonce（代替経路）を照合する。
 * 削除で本人確認不可。APIの毎操作Core認可とは別。auth.jsと拒否・復帰テストを同期。
 */
(function(global){
 'use strict';
 let token=null,pending=null,stopped=false,reauthenticate=false;
 const origin='https://tealabhokkaido.com';
 const finish=(error,value)=>{
  const current=pending;if(!current)return;
  pending=null;clearTimeout(current.timer);
  if(!error){
   token=value;
   reauthenticate=false;
   try{current.channel?.postMessage({type:'TLH_INVENTORY_LOGIN_ACK',nonce:current.nonce});}catch{}
  }
  current.channel?.close();
  if(error)current.reject(Error(error));else current.resolve();
  try{current.popup?.close();}catch{}
 };
 function receive(data,current,send){
  if(stopped||pending!==current||!data||data.nonce!==current.nonce)return;
  if(data.type==='TLH_INVENTORY_LOGIN_READY'){
   send({type:'TLH_INVENTORY_LOGIN_REQUEST',nonce:current.nonce});return;
  }
  if(data.type!=='TLH_INVENTORY_LOGIN_RESULT')return;
  if(data.code!=='OK'){finish('AUTH_REQUIRED');return;}
  if(typeof data.idToken!=='string'||data.idToken.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.idToken))return;
  finish(null,data.idToken);
 }
 global.addEventListener('message',event=>{
  const current=pending;
  if(!current||event.origin!==origin||event.source!==current.popup)return;
  receive(event.data,current,data=>current.popup.postMessage(data,origin));
 });
 global.TlhInventoryLogin=Object.freeze({
  getToken:()=>stopped?null:token,
  clearToken:()=>{token=null;reauthenticate=true;},
  login(){
   if(stopped)return Promise.reject(Error('PAGE_CLOSED'));
   if(pending?.popup?.closed)finish('LOGIN_UNAVAILABLE');
   if(pending)return Promise.reject(Error('BUSY'));
   return new Promise((resolve,reject)=>{
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
    let channel=null;
    try{if(global.BroadcastChannel)channel=new global.BroadcastChannel('tlh-inventory-login-'+nonce);}catch{}
    const current={nonce,channel,resolve,reject,popup:null,timer:null};pending=current;
    if(channel)channel.onmessage=event=>{
     if(event.origin===origin)receive(event.data,current,data=>channel.postMessage(data));
    };
    try{current.popup=global.open('/workforce/inventory/auth/?request='+nonce+(reauthenticate?'&reauth=1':''),'tlhInventoryLogin','popup,width=480,height=720');}
    catch{finish('LOGIN_POPUP_BLOCKED');return;}
    if(!current.popup){finish('LOGIN_POPUP_BLOCKED');return;}
    current.timer=setTimeout(()=>finish('LOGIN_UNAVAILABLE'),180000);
   });
  }
 });
 global.addEventListener('pagehide',()=>{stopped=true;token=null;finish('PAGE_CLOSED');});
})(window);
