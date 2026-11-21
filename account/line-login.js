/** Account-specific same-tab LINE broker; fixed LIFF Endpoint and memory-only proof.
 * The only cross-navigation state is a one-use request ID and a reviewed display-purpose enum.
 */
(function(global){
 'use strict';
 const origin='https://tealabhokkaido.com',callback='/software/worktime/inventory/auth/account-return/';
 const preview=document.currentScript?.dataset.preview==='true';
 const entry=preview?'/account/line-preview/':'/account/';
 const key=preview?'tlh.account.line.preview.v1':'tlh.account.line.v1';
 const liffId='2011940133-JXUDzLnG',ttl=600000,returning=[callback,callback+'index.html'].includes(global.location.pathname);
 const hints=Object.freeze({general:'',storeInventory:'?service=inventory',storeWorktime:'?service=worktime',
  personal:'?purpose=personal',personalInventory:'?purpose=personal&service=INVENTORY'});
 const findHint=query=>Object.keys(hints).find(k=>hints[k]===query)||'general';
 const trusted=()=>global===global.top&&global.location.origin===origin;
 const fixedEntry=intent=>entry+hints[intent];
 let token=null,stopped=false,attempted=false,force=false,resumeJob=null,retryUrl=entry;
 const compatible=()=>{
  if(preview||returning)return false;
  try{
   const n=global.navigator,ua=n.userAgent||'',touchMac=ua.includes('Macintosh')&&n.maxTouchPoints>1;
   return !(/Windows NT|Macintosh|CrOS|X11; Linux/.test(ua))||/Android|iPhone|iPad|iPod|Mobile|Tablet|Line\/|LIFF\//i.test(ua)||touchMac||
    n.standalone===true||global.matchMedia('(display-mode: browser)').matches!==true||
    ['standalone','minimal-ui','fullscreen','window-controls-overlay'].some(m=>global.matchMedia('(display-mode: '+m+')').matches);
  }catch{return true;}
 };
 const usePopup=compatible();
 const old=usePopup?global.TlhInventoryLogin:null;
 const clear=(nonce)=>{
  try{const raw=global.sessionStorage.getItem(key);if(!nonce||raw&&JSON.parse(raw).nonce===nonce)global.sessionStorage.removeItem(key);}catch{}
 };
 const save=value=>{
  const raw=JSON.stringify(value);global.sessionStorage.setItem(key,raw);
  if(global.sessionStorage.getItem(key)!==raw)throw Error('ACCOUNT_LOGIN_UNAVAILABLE');
 };
 const read=nonce=>{
  const raw=global.sessionStorage.getItem(key),v=raw&&raw.length<=230?JSON.parse(raw):null;
  const now=Date.now();
  return v&&Object.keys(v).sort().join(',')==='force,hint,nonce,phase,started'&&v.nonce===nonce&&
   Object.hasOwn(hints,v.hint)&&typeof v.force==='boolean'&&['start','oauth'].includes(v.phase)&&
   Number.isSafeInteger(v.started)&&v.started<=now&&now-v.started<=ttl?v:null;
 };
 const returnUrl=nonce=>origin+callback+'?request='+nonce;
 async function resume(){
  if(!trusted()||!returning||stopped)return 'failed';
  const query=new URLSearchParams(global.location.search),keys=query.getAll('request');
  const nonce=keys.length===1&&/^[a-f0-9]{32}$/.test(keys[0])?keys[0]:null;
  let timer;
  try{
   const state=nonce&&read(nonce);if(!state)return 'failed';
   retryUrl=fixedEntry(state.hint);
   if(query.has('error')||!global.liff){clear(nonce);return 'failed';}
   await Promise.race([global.liff.init({liffId}),new Promise((_,reject)=>{timer=global.setTimeout(()=>reject(Error('ACCOUNT_LOGIN_UNAVAILABLE')),15000);})]);
   const latest=read(nonce);
   if(stopped||!latest||latest.started!==state.started||latest.phase!==state.phase||latest.hint!==state.hint||latest.force!==state.force)return 'failed';
   const cached=global.liff.isLoggedIn(),repeat=latest.force&&latest.phase==='start'&&!global.liff.isInClient();
   if(!cached||repeat){
    if(latest.phase!=='start'){clear(nonce);return 'failed';}
    save({...latest,phase:'oauth',force:false});if(repeat&&cached)global.liff.logout();
    global.liff.login({redirectUri:returnUrl(nonce)});return 'redirecting';
   }
   const proof=global.liff.getIDToken();
   if(typeof proof!=='string'||proof.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(proof)){clear(nonce);return 'failed';}
   clear(nonce);if(global.sessionStorage.getItem(key)!==null)return 'failed';
   global.history.replaceState(null,'',retryUrl);
   if(!trusted()||global.location.pathname!==entry||global.location.search!==hints[latest.hint])return 'failed';
   token=proof;return 'ready';
  }catch{if(nonce)clear(nonce);return 'failed';}
  finally{if(timer!==undefined)global.clearTimeout(timer);}
 }
 global.TlhAccountLogin=Object.freeze({
  version:1,usePopup,isReturning:()=>returning,retryPath:()=>retryUrl,
  getToken:()=>stopped?null:old?old.getToken():token,
  clearToken(){token=null;force=true;old?.clearToken();},
  resume:()=>resumeJob||(resumeJob=resume()),
  async login(){
   if(!trusted()||stopped||![entry,entry+'index.html'].includes(global.location.pathname))throw Error('ACCOUNT_LOGIN_UNAVAILABLE');
   if(usePopup){if(!old)throw Error('ACCOUNT_LOGIN_UNAVAILABLE');return old.login();}
   if(attempted)throw Error('ACCOUNT_LOGIN_BUSY');
   const nonce=Array.from(global.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
   attempted=true;
   try{save({nonce,started:Date.now(),hint:findHint(global.location.search),phase:'start',force});
    global.location.assign(returnUrl(nonce));return 'redirecting';
   }catch{clear(nonce);attempted=false;throw Error('ACCOUNT_LOGIN_UNAVAILABLE');}
  }
 });
 global.addEventListener('pagehide',()=>{stopped=true;token=null;});
})(window);
