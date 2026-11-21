/** LINE authentication stays in this tab; the LIFF landing document becomes Inventory.
 * Only short-lived routing state is stored across redirects. The ID token never leaves this
 * document's memory except for a normal authorized Inventory request over the existing transport. */
(function(global){
 'use strict';
 const origin='https://tealabhokkaido.com',entry='/software/inventory/line-preview/';
 const callback='/software/worktime/inventory/auth/return/';
 const key='tlh.inventory.login-preview.v1',ttl=10*60*1000;
 const allowedEntry=new Set([entry,entry+'index.html']);
 const returning=[callback,callback+'index.html'].includes(global.location.pathname);
 const trusted=()=>global===global.top&&global.location.origin===origin;
 let token=null,stopped=false,reauthenticate=false,started=false,resumed=null;
 const removeIntent=(nonce)=>{try{
  if(nonce&&JSON.parse(global.sessionStorage.getItem(key))?.nonce!==nonce)return;
  global.sessionStorage.removeItem(key);
 }catch{}};
 const storeIntent=intent=>{
  const text=JSON.stringify(intent);global.sessionStorage.setItem(key,text);
  if(global.sessionStorage.getItem(key)!==text)throw Error('LOGIN_STORAGE_UNAVAILABLE');
 };
 const callbackUrl=nonce=>origin+callback+'?request='+nonce;
 const readIntent=nonce=>{
  const raw=global.sessionStorage.getItem(key);
  const intent=raw&&raw.length<=240?JSON.parse(raw):null,now=Date.now();
  if(!intent||Object.keys(intent).sort().join(',')!=='issuedAt,nonce,reauth,step'||
    intent.nonce!==nonce||!['start','oauth'].includes(intent.step)||typeof intent.reauth!=='boolean'||
    !Number.isSafeInteger(intent.issuedAt)||intent.issuedAt>now||now-intent.issuedAt>ttl)return null;
  return intent;
 };
 const requestId=()=>{
  const requests=new URLSearchParams(global.location.search||'').getAll('request');
  return requests.length===1&&/^[a-f0-9]{32}$/.test(requests[0])?requests[0]:null;
 };
 async function resumeOnce(){
  if(!trusted()||!returning||stopped)return 'failed';
  let finishTimer;const nonce=requestId();
  try{
   const intent=nonce&&readIntent(nonce);
   if(!intent)return 'failed'; // An unrelated, expired, or direct URL never initializes the SDK.
   const query=new URLSearchParams(global.location.search||'');
   if(query.has('error')){removeIntent(nonce);return 'failed';}
   if(!global.liff){removeIntent(nonce);return 'failed';}
   await Promise.race([global.liff.init({liffId:'2011940133-JXUDzLnG'}),new Promise((_,reject)=>{
    finishTimer=global.setTimeout(()=>reject(Error('AUTH_INIT_FAILED')),15000);
   })]);
   if(stopped)return 'failed';
   const current=readIntent(nonce);
   if(!current||current.step!==intent.step||current.issuedAt!==intent.issuedAt||current.reauth!==intent.reauth)return 'failed';
   const force=current.step==='start'&&current.reauth&&!global.liff.isInClient();
   if(force||!global.liff.isLoggedIn()){
    if(current.step!=='start'){removeIntent(nonce);return 'failed';} // Never loop on a failed return.
    storeIntent({...current,step:'oauth',reauth:false});
    if(force&&global.liff.isLoggedIn())global.liff.logout();
    global.liff.login({redirectUri:callbackUrl(nonce)});
    return 'redirecting';
   }
   const proof=global.liff.getIDToken();
   if(typeof proof!=='string'||proof.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(proof)){removeIntent(nonce);return 'failed';}
   // Consume once before enabling regular app calls. Keep the same JS document/memory.
   removeIntent(nonce);
   if(global.sessionStorage.getItem(key)!==null)return 'failed';
   global.history.replaceState(null,'',entry);
   if(global.location.pathname!==entry||!trusted())return 'failed';
   token=proof;reauthenticate=false;
   return 'ready';
  }catch{if(nonce)removeIntent(nonce);return 'failed';}
  finally{if(finishTimer!==undefined)global.clearTimeout(finishTimer);}
 }
 global.TlhInventoryLogin=Object.freeze({
  sameTabVersion:1,
  getToken:()=>stopped?null:token,
  clearToken:()=>{token=null;reauthenticate=true;},
  isReturning:()=>returning,
  resume:()=>resumed||(resumed=resumeOnce()),
  async login(){
   if(!trusted()||stopped||!allowedEntry.has(global.location.pathname))throw Error('LOGIN_UNAVAILABLE');
   if(started)throw Error('BUSY');
   const nonce=Array.from(global.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
   started=true;
   try{storeIntent({nonce,issuedAt:Date.now(),reauth:reauthenticate,step:'start'});global.location.assign(callbackUrl(nonce));}
   catch{removeIntent();started=false;throw Error('LOGIN_UNAVAILABLE');}
   return 'redirecting';
  }
 });
 global.addEventListener('pagehide',()=>{stopped=true;token=null;});
})(window);
