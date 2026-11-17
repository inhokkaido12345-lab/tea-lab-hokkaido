/** Candidate signed workflow write transport; no production mount.
 * Caller creates and retains operation IDs. No automatic retry, registration,
 * target inference or authority from metadata. COMMIT transport failure is an
 * unknown result, never proof of rejection. UI must keep its original intent. */
(function(g){'use strict';
 const TYPE='TLH_ACCESS_WORKFLOW_WRITE_V1',commands=['REQUEST','INVITE','APPROVE','ACCEPT','CANCEL','EXPIRE','APPLY','ABORT'],kinds=['ACCOUNT','PERSONAL','ORGANIZATION','STORE','RESOURCE'];
 const fields=['phase','command','serviceId','scopeKind','scopeId','requestId','operationId','expectedRevision','specification','revision'];
 const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===ks.slice().sort().join('|');
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v),hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
 const origin=v=>v==='null'||v==='https://script.google.com'||v==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(v);
 function related(s,f){try{for(let i=0;s&&i<8;i++){if(s===f)return true;const p=s.parent;if(p===s)return false;s=p;}}catch{}return false;}
 function create(o){let stopped=false,pending=null;
  function end(error,data){const p=pending;if(!p)return;pending=null;clearTimeout(p.timer);if(error)p.reject(Error(error));else p.resolve(data);}
  function write(input){if(stopped)return Promise.reject(Error('CLOSED'));if(pending)return Promise.reject(Error('BUSY'));
   if(!exact(input,fields)||Object.values(input).some(v=>typeof v!=='string')||!['PREVIEW','COMMIT'].includes(input.phase)||!commands.includes(input.command)||!id(input.serviceId)||!kinds.includes(input.scopeKind)||!id(input.scopeId)||!id(input.requestId)||!hex(input.operationId,32)||!/^\d{1,9}$/.test(input.expectedRevision)||input.specification.length>16000||(input.phase==='PREVIEW'?input.revision!=='':!hex(input.revision,64)))return Promise.reject(Error('INVALID_WRITE'));
   let spec;try{spec=JSON.parse(input.specification);}catch{return Promise.reject(Error('INVALID_WRITE'));}
   if(['REQUEST','INVITE'].includes(input.command)){if(!exact(spec,['subjectAccountId','serviceId','scope','capabilities','expiresAtUtc'])||!id(spec.subjectAccountId)||spec.serviceId!==input.serviceId||!exact(spec.scope,['kind','id'])||spec.scope.kind!==input.scopeKind||spec.scope.id!==input.scopeId||!Array.isArray(spec.capabilities)||!spec.capabilities.length||spec.capabilities.length>100||new Set(spec.capabilities).size!==spec.capabilities.length||spec.capabilities.some(v=>typeof v!=='string'||!v.startsWith(input.serviceId+':')||v.length>200)||typeof spec.expiresAtUtc!=='string'||!Number.isFinite(Date.parse(spec.expiresAtUtc)))return Promise.reject(Error('INVALID_WRITE'));}else if(spec!==null)return Promise.reject(Error('INVALID_WRITE'));
   const proof=o.getProof(),actor=o.getActor();if(!proof||!actor)return Promise.reject(Error('AUTH_REQUIRED'));
   if(input.command==='REQUEST'&&spec.subjectAccountId!==actor)return Promise.reject(Error('INVALID_SUBJECT'));
   return new Promise((resolve,reject)=>{const request={action:'bridgeAccessWorkflowWriteV1',...input,idToken:proof,nonce:random(16),responseKey:random(32)},r={request,actor,resolve,reject,timer:null};pending=r;r.timer=setTimeout(()=>{if(pending===r)end(input.phase==='COMMIT'?'WRITE_RESULT_UNKNOWN':'TIMEOUT');},o.timeoutMs??30000);try{o.post(request);}catch{end(input.phase==='COMMIT'?'WRITE_RESULT_UNKNOWN':'TRANSPORT_ERROR');}});
  }
  async function message(e){const r=pending;if(!r||stopped||!origin(e.origin)||!related(e.source,o.frame.contentWindow))return;const q=r.request,d=e.data;
   const echoed=['phase','command','serviceId','scopeKind','scopeId','requestId','operationId','nonce'];if(!exact(d,['type',...echoed,'code','data','mac'])||d.type!==TYPE||echoed.some(k=>d[k]!==q[k])||typeof d.code!=='string'||typeof d.data!=='string'||d.data.length>50000||!hex(d.mac,64))return;
   let valid=false;try{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(q.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),v=>parseInt(v,16)),enc.encode([d.type,...echoed.map(k=>d[k]),d.code,d.data].join('\n')));}catch{}if(!valid||pending!==r||stopped)return;
   if(o.getProof()!==q.idToken||o.getActor()!==r.actor){end(q.phase==='COMMIT'?'WRITE_RESULT_UNKNOWN':'IDENTITY_CHANGED');return;}
   if(['AUTH_REQUIRED','WRITE_REJECTED','INVALID_REQUEST'].includes(d.code)){if(d.data!=='')return;end(d.code);return;}
   let v;try{v=JSON.parse(d.data);}catch{end(q.phase==='COMMIT'?'WRITE_RESULT_UNKNOWN':'INVALID_DATA');return;}
   const invalid=()=>end(q.phase==='COMMIT'?'WRITE_RESULT_UNKNOWN':'INVALID_DATA');
   if(q.command==='ABORT'){const k=q.phase==='PREVIEW'?['state','revision','operationId','requestId','currentAccess','retryWithNewOperation']:['state','operationId','requestId','recordStatus','currentAccess','retryWithNewOperation'];if(!exact(v,k)||v.operationId!==q.operationId||v.requestId!==q.requestId||v.currentAccess!=='NOT_EVALUATED'||v.retryWithNewOperation!==false||q.phase==='PREVIEW'&&(d.code!=='PREVIEW_READY'||v.state!=='ABORT_PREVIEW_READY'||!hex(v.revision,64))||q.phase==='COMMIT'&&(d.code!=='WRITE_NOT_APPLIED'||v.state!=='NOT_APPLIED'||v.recordStatus!=='NOT_APPLIED'))return invalid();end(null,v);return;}
   if(q.phase==='PREVIEW'){if(v.subjectLabel!==null&&(!exact(v.subjectLabel,['label','nameSource'])||v.subjectLabel.nameSource!=='LINE_SELF_SET'||typeof v.subjectLabel.label!=='string'||!v.subjectLabel.label.trim()||v.subjectLabel.label.length>80||/[\x00-\x1f\x7f]/.test(v.subjectLabel.label)))return invalid();if(d.code!=='PREVIEW_READY'||!exact(v,['state','revision','recordStatus','capabilities','expiresAtUtc','subjectLabel'])||v.state!=='PREVIEW_READY'||!hex(v.revision,64)||!['REQUESTED','INVITED','READY','APPLIED','CANCELLED','EXPIRED'].includes(v.recordStatus)||!Array.isArray(v.capabilities)||v.capabilities.length>100||new Set(v.capabilities).size!==v.capabilities.length||v.capabilities.some(c=>typeof c!=='string'||!c.startsWith(q.serviceId+':')||c.length>200)||typeof v.expiresAtUtc!=='string'||!Number.isFinite(Date.parse(v.expiresAtUtc)))return invalid();}
   else{const keys=['state','operationId','requestId','currentAccess','retryWithNewOperation'];if(Object.hasOwn(v||{},'recordStatus'))keys.push('recordStatus');if(!exact(v,keys)||!['WRITE_SAVED','WRITE_UNKNOWN'].includes(d.code)||v.operationId!==q.operationId||v.requestId!==q.requestId||v.currentAccess!=='NOT_EVALUATED'||v.retryWithNewOperation!==false||!['RECORDED','APPLIED','UNKNOWN'].includes(v.state)||(d.code==='WRITE_UNKNOWN')!==(v.state==='UNKNOWN')||v.state==='APPLIED'&&!['APPLY','APPROVE','ACCEPT'].includes(q.command)||v.state!=='UNKNOWN'&&!['REQUESTED','INVITED','READY','APPLIED','CANCELLED','EXPIRED'].includes(v.recordStatus))return invalid();}
   end(null,v);
  }
  function close(){stopped=true;end(pending?.request.phase==='COMMIT'?'WRITE_RESULT_UNKNOWN':'CLOSED');g.removeEventListener?.('message',message);g.removeEventListener?.('pagehide',pagehide);}
  function pagehide(){if(!o.preserveOnPagehide?.())close();}
  g.addEventListener('message',message);g.addEventListener('pagehide',pagehide);
  return Object.freeze({write,busy:()=>!!pending,cancel(){if(pending?.request.phase==='COMMIT')return false;end('CANCELLED');return true;},close});
 }
 g.TlhSignedWorkflowWriter=Object.freeze({create});
})(globalThis);
