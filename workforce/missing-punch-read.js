/** Optional SELF-only, read-only reminder. Never participates in the punch prerequisite queue.
 * No date/employee input, storage or write. Invalid/unavailable replies hide this optional view.
 * Per-request source, HMAC, nonce, account and fixed workplace checks survive async verification. */
(function(global){'use strict';
 const TYPE='TLH_BRIDGE_MISSING_PUNCH_HINTS',ACTION='bridgeGetMissingPunchHints';
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
 const day=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 function parse(text){let h;try{h=JSON.parse(text);}catch(_e){return null;}if(!h||Object.keys(h).sort().join(',')!=='asOf,days,today,version'||h.version!==1||!day(h.today)||typeof h.asOf!=='string'||!Number.isFinite(Date.parse(h.asOf))||new Date(h.asOf).toISOString()!==h.asOf||new Date(Date.parse(h.asOf)+9*3600000).toISOString().slice(0,10)!==h.today||!Array.isArray(h.days)||h.days.length>1000||h.days.some(d=>!day(d)||d>=h.today)||new Set(h.days).size!==h.days.length)return null;return Object.freeze([...h.days].sort());}
 async function verify(d,r){if(!d||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||typeof d.code!=='string'||typeof d.hints!=='string'||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return false;const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.key),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,ACTION,d.code,d.hints].join('\n')));}
 function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch(_e){}return false;}
 function init({liff,gasUrl,onDates}){
  let pending=null,stopped=false;const frame=document.createElement('iframe');frame.hidden=true;frame.name='tlhMissingPunch'+random(8);frame.title='本人の打刻確認候補';document.body.appendChild(frame);
  const clear=()=>onDates(Object.freeze([]));
  const current=r=>!stopped&&pending===r&&liff.getIDToken()===r.token&&(!global.TlhCurrentWorkplace||global.TlhCurrentWorkplace.locationMatches());
  function finish(){if(pending)clearTimeout(pending.timer);pending=null;}
  function load(){if(stopped||pending||global!==global.top||!crypto.subtle)return false;clear();const token=liff.getIDToken();if(!token)return false;const r={token,nonce:random(16),key:random(32)};pending=r;r.timer=setTimeout(()=>{if(pending===r){finish();clear();}},30000);const form=document.createElement('form');form.method='POST';form.action=gasUrl;form.target=frame.name;form.hidden=true;for(const [name,value]of Object.entries({action:ACTION,idToken:token,nonce:r.nonce,responseKey:r.key})){const f=document.createElement('input');f.type='hidden';f.name=name;f.value=value;form.appendChild(f);}document.body.appendChild(form);try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){finish();clear();}finally{form.remove();}return true;}
  global.addEventListener('message',async e=>{const r=pending;if(!r||!related(e.source,frame.contentWindow)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;let valid=false;try{valid=current(r)&&await verify(e.data,r)&&current(r);}catch(_e){}if(!valid)return;const days=e.data.code==='MISSING_PUNCH_HINTS_READY'?parse(e.data.hints):null;finish();onDates(days||Object.freeze([]));});
  global.addEventListener('pagehide',()=>{stopped=true;finish();clear();frame.remove();});return Object.freeze({load});
 }
 global.TlhMissingPunchRead=Object.freeze({init,parse,verify});
})(window);
