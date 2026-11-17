/** Minimal local recovery receipt, not a grant or an authentication credential.
 * The status port MUST be the reviewed signed reader; this module calls it with
 * the persisted context and never accepts arbitrary caller-supplied success.
 * expectedRevision is the nonsecret original wire revision required for ABORT.
 * Prior unpublished receipt candidates lacking it fail closed; no guessed zero.
 * Web Locks serialize same-origin tabs. If durable storage/locking is unavailable,
 * do not send COMMIT. No token, label, capability payload or auto-retry is stored.
 */
(function(g){'use strict';
 const KEY='tlh.account.workflow.pending.v1',LOCK='tlh.account.workflow.receipt.v1';
 const commands=['REQUEST','INVITE','APPROVE','ACCEPT','CANCEL','EXPIRE','APPLY'];
 const kinds=['ACCOUNT','PERSONAL','ORGANIZATION','STORE','RESOURCE'];
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v),actor=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v),hex=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
 const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===k.slice().sort().join('|');
 const clone=v=>JSON.parse(JSON.stringify(v));
 function valid(r){return exact(r,['version','operationId','requestId','actorAccountId','serviceId','scope','command','expectedRevision'])&&r.version===1&&hex(r.operationId)&&id(r.requestId)&&actor(r.actorAccountId)&&id(r.serviceId)&&exact(r.scope,['kind','id'])&&kinds.includes(r.scope.kind)&&id(r.scope.id)&&commands.includes(r.command)&&typeof r.expectedRevision==='string'&&/^\d{1,9}$/.test(r.expectedRevision);}
 function create(o){let resolving=false,closed=false,fault='';
  const storage=o.storage,locked=o.withLock||(g.navigator?.locks?.request?fn=>g.navigator.locks.request(LOCK,{mode:'exclusive'},fn):null);
  const auth=()=>({actor:o.getActor?.()||'',proof:o.getProof?.()||''});
  function raw(){const s=storage.getItem(KEY);if(s!==null&&typeof s!=='string')throw Error('RECEIPT_STORAGE_UNAVAILABLE');return s;}
  function parse(s){if(s===null)return null;if(s.length>2048)throw Error('RECEIPT_INVALID');let r;try{r=JSON.parse(s);}catch{throw Error('RECEIPT_INVALID');}if(!valid(r))throw Error('RECEIPT_INVALID');return r;}
  function inspect(){if(fault)return {state:'STORAGE_ERROR',busy:true,error:fault};try{const r=parse(raw());if(!r)return {state:'EMPTY',busy:false};const a=auth();if(!a.actor||!a.proof)return {state:'AUTH_REQUIRED',busy:true};if(a.actor!==r.actorAccountId)return {state:'OTHER_ACCOUNT',busy:true};return {state:resolving?'CHECKING':'UNKNOWN',busy:true,receipt:clone(r)};}catch(e){return {state:e.message==='RECEIPT_INVALID'?'INVALID':'STORAGE_ERROR',busy:true,error:e.message};}}
  function emit(){try{o.onState?.(inspect());}catch{}}
  function lock(fn){if(closed)return Promise.reject(Error('RECEIPT_CLOSED'));if(!locked)return Promise.reject(Error('RECEIPT_LOCK_UNAVAILABLE'));return Promise.resolve().then(()=>locked(fn));}
  async function reserve(q){if(resolving)throw Error('RECEIPT_BUSY');const a=auth();if(!actor(a.actor)||!a.proof)throw Error('AUTH_REQUIRED');const r={version:1,operationId:q?.operationId,requestId:q?.requestId,actorAccountId:a.actor,serviceId:q?.serviceId,scope:{kind:q?.scopeKind,id:q?.scopeId},command:q?.command,expectedRevision:q?.expectedRevision};if(!valid(r))throw Error('RECEIPT_INVALID');
   const allowed=['command','serviceId','scopeKind','scopeId','requestId','operationId','expectedRevision','specification'];if(Object.keys(q).some(k=>!allowed.includes(k)))throw Error('RECEIPT_INVALID');
   await lock(()=>{if(fault)throw Error('RECEIPT_STORAGE_UNAVAILABLE');if(auth().actor!==a.actor||auth().proof!==a.proof)throw Error('IDENTITY_CHANGED');if(raw()!==null)throw Error('RECEIPT_PENDING');const encoded=JSON.stringify(r);try{storage.setItem(KEY,encoded);if(raw()!==encoded)throw Error('RECEIPT_READBACK_FAILED');}catch(e){fault='RECEIPT_NOT_SAVED';throw Error('RECEIPT_NOT_SAVED');}});emit();return clone(r);
  }
  function recoveryIntent(){const s=inspect();if(!s.receipt)return null;const r=s.receipt;return {command:r.command,serviceId:r.serviceId,scopeKind:r.scope.kind,scopeId:r.scope.id,requestId:r.requestId,operationId:r.operationId,expectedRevision:r.expectedRevision,specification:'null'};}
  async function resolve(){if(resolving||closed)throw Error('RECEIPT_BUSY');let encoded,r,a;
   await lock(()=>{if(fault)throw Error('RECEIPT_STORAGE_UNAVAILABLE');encoded=raw();r=parse(encoded);if(!r)throw Error('RECEIPT_EMPTY');a=auth();if(!a.proof||a.actor!==r.actorAccountId)throw Error('AUTH_REQUIRED');});resolving=true;emit();
   try{const q={serviceId:r.serviceId,scopeKind:r.scope.kind,scopeId:r.scope.id,operationId:r.operationId},v=await o.status.read(q);
    if(auth().actor!==a.actor||auth().proof!==a.proof)throw Error('IDENTITY_CHANGED');
    const keys=['version','actorAccountId','state','operationId','retryWithNewOperation','currentAccess'];if(['SAVED','NOT_APPLIED'].includes(v?.state))keys.push('requestId','recordStatus');
    if(!exact(v,keys)||v.version!==1||v.actorAccountId!==a.actor||v.operationId!==r.operationId||v.retryWithNewOperation!==false||v.currentAccess!=='NOT_EVALUATED'||!['SAVED','NOT_APPLIED','UNKNOWN'].includes(v.state))throw Error('RECEIPT_STATUS_INVALID');
    if(v.state==='UNKNOWN')return {...clone(v),cleared:false};
    if(v.requestId!==r.requestId||v.state==='NOT_APPLIED'&&v.recordStatus!=='NOT_APPLIED'||v.state==='SAVED'&&!['REQUESTED','INVITED','READY','APPLIED','CANCELLED','EXPIRED'].includes(v.recordStatus))throw Error('RECEIPT_STATUS_INVALID');
    await lock(()=>{if(auth().actor!==a.actor||auth().proof!==a.proof)throw Error('IDENTITY_CHANGED');if(raw()!==encoded)throw Error('RECEIPT_CHANGED');try{storage.removeItem(KEY);if(raw()!==null)throw Error('RECEIPT_CLEAR_FAILED');}catch{fault='RECEIPT_CLEAR_FAILED';throw Error('RECEIPT_CLEAR_FAILED');}});return {...clone(v),cleared:true};
   }finally{resolving=false;emit();}
  }
  emit();return Object.freeze({reserve,resolve,inspect,recoveryIntent,busy:()=>inspect().busy||resolving,cancel:()=>false,close(){closed=true;},key:KEY});
 }
 g.TlhWorkflowReceipt=Object.freeze({create});
})(globalThis);
