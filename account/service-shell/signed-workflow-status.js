/** Non-production APPLY status reader. Never sends COMMIT or creates an operation.
 * post is a trusted form transport port; response must come from the configured iframe lineage.
 * Verifies nonce, command context, actor, fixed operation and HMAC before exposing any item.
 * Caller must configure the reviewed backend endpoint outside this module. No credentials stored.
 */
(function(g){'use strict';
 const TYPE='TLH_ACCESS_WORKFLOW_STATUS_V1';
 const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===ks.slice().sort().join('|');
 const hex=(s,n)=>typeof s==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(s);
 const id=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
 const origin=s=>s==='null'||s==='https://script.google.com'||s==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(s);
 function related(s,f){try{for(let i=0;s&&i<8;i++){if(s===f)return true;const parent=s.parent;if(parent===s)return false;s=parent;}}catch{}return false;}
 function create(o){let stopped=false,pending=null;
  function end(error,data){const r=pending;if(!r)return;clearTimeout(r.timer);pending=null;if(error)r.reject(Error(error));else r.resolve(data);}
  function read(input){if(stopped)return Promise.reject(Error('CLOSED'));if(!exact(input,['serviceId','scopeKind','scopeId','operationId'])||Object.values(input).some(v=>typeof v!=='string')||!id(input.serviceId)||!id(input.scopeKind)||!id(input.scopeId)||!hex(input.operationId,32))return Promise.reject(Error('INVALID_READ'));
   end('SUPERSEDED');const proof=o.getProof(),actor=o.getActor();if(!proof||!actor)return Promise.reject(Error('AUTH_REQUIRED'));
   return new Promise((resolve,reject)=>{const request={action:'bridgeAccessWorkflowStatusV1',...input,idToken:proof,nonce:random(16),responseKey:random(32)},r={request,actor,resolve,reject,timer:null};pending=r;r.timer=setTimeout(()=>{if(pending===r)end('TIMEOUT');},o.timeoutMs??30000);try{o.post(request);}catch{end('TRANSPORT_ERROR');}});
  }
  async function message(e){const r=pending;if(!r||stopped||!origin(e.origin)||!related(e.source,o.frame.contentWindow))return;const d=e.data,q=r.request;
   if(!exact(d,['type','serviceId','scopeKind','scopeId','operationId','nonce','code','data','mac'])||d.type!==TYPE||['serviceId','scopeKind','scopeId','operationId','nonce'].some(k=>d[k]!==q[k])||typeof d.code!=='string'||typeof d.data!=='string'||d.data.length>200000||!hex(d.mac,64))return;
   let valid=false;try{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(q.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),x=>parseInt(x,16)),enc.encode([d.type,d.serviceId,d.scopeKind,d.scopeId,d.operationId,d.nonce,d.code,d.data].join('\n')));}catch{}if(!valid||pending!==r||stopped)return;
   if(o.getProof()!==q.idToken||o.getActor()!==r.actor){end('IDENTITY_CHANGED');return;}
   if(!['READ_OK','INVALID_REQUEST','AUTH_REQUIRED','FORBIDDEN','READ_ERROR'].includes(d.code)){end('INVALID_DATA');return;}
   if(d.code!=='READ_OK'){if(d.data!=='')return;end(d.code);return;}
   let data;try{data=JSON.parse(d.data);}catch{end('INVALID_DATA');return;}
   const keys=['version','actorAccountId','state','operationId','retryWithNewOperation','currentAccess'];if(data?.state==='SAVED')keys.push('requestId','recordStatus');
   if(!exact(data,keys)||data.version!==1||data.actorAccountId!==r.actor||data.operationId!==q.operationId||data.retryWithNewOperation!==false||data.currentAccess!=='NOT_EVALUATED'||!['SAVED','UNKNOWN'].includes(data.state)||data.state==='SAVED'&&(!id(data.requestId)||data.recordStatus!=='APPLIED')){end('INVALID_DATA');return;}
   end(null,data);
  }
  g.addEventListener('message',message);g.addEventListener('pagehide',()=>{stopped=true;end('CLOSED');});
  return Object.freeze({read,cancel(){end('CANCELLED');},close(){stopped=true;end('CLOSED');}});
 }
 g.TlhSignedWorkflowStatus=Object.freeze({create});
})(globalThis);
