/** In-app request/invitation workflow prototype. Not mounted in public Account.
 * Trusted ports own identity, queue visibility and each transition's authorization.
 * Metadata declares actions; no app names, employment requirement or role inheritance here.
 * A lost commit response stays UNKNOWN until lookup of that same operation is conclusive.
 * No storage, external code, background polling, retries or real permission changes.
 */
(function(g){'use strict';
 const same=(a,b)=>a&&b&&a.accountId===b.accountId&&a.serviceId===b.serviceId&&a.scopeId===b.scopeId&&a.channel===b.channel;
 const copy=x=>JSON.parse(JSON.stringify(x));
 function create(o){let epoch=0,context=null,stopped=false,state='IDLE',rows=[],draft=null,result=null;
  const actions=new Map(o.actions.map(a=>[a.actionId,a]));
  const busy=()=>!!draft;
  const publish=()=>o.onState?.();
  function call(fn){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('TIMEOUT')),o.timeoutMs??30000);Promise.resolve().then(fn).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
  function clear(){rows=[];result=null;}
  function select(c){if(stopped||busy()||!c||!['INBOX','QUEUE'].includes(c.channel)||['accountId','serviceId','scopeId'].some(k=>typeof c[k]!=='string'||!c[k]))return false;context=Object.freeze(copy(c));epoch++;clear();state='IDLE';publish();return true;}
  function matched(ticket,r){return !stopped&&epoch===ticket.epoch&&same(context,ticket.context)&&r&&same(r.context,ticket.context);}
  async function read(){if(stopped||busy()||!context)return false;const ticket={epoch:++epoch,context};clear();state='LOADING';publish();try{const r=await call(()=>o.port.read(ticket.context));if(stopped||epoch!==ticket.epoch)return false;if(!matched(ticket,r))throw Error('CONTEXT_MISMATCH');if(!['READY','DENIED','NOT_CONNECTED','ERROR'].includes(r.state)||!Array.isArray(r.items)||r.state!=='READY'&&r.items.length)throw Error('INVALID_READ');const ids=new Set();for(const item of r.items){if(!item||typeof item.itemId!=='string'||ids.has(item.itemId)||typeof item.label!=='string'||!Array.isArray(item.actions)||item.actions.some(a=>!actions.has(a)))throw Error('INVALID_ITEM');ids.add(item.itemId);}rows=copy(r.items);state=r.state==='READY'?(rows.length?'READY':'EMPTY'):r.state;publish();return true;}catch{if(!stopped&&epoch===ticket.epoch){clear();state='ERROR';publish();}return false;}}
  async function preview(actionId,itemId,fields={}){if(stopped||busy()||!context||!['READY','EMPTY'].includes(state))return false;const meta=actions.get(actionId),item=rows.find(r=>r.itemId===itemId);if(!meta||!(item?item.actions.includes(actionId):itemId===null&&o.creationActions?.includes(actionId)))return false;
   if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(k=>!meta.fields.includes(k)))return false;
   const frozen=Object.freeze({context,actionId,itemId,fields:copy(fields),operationId:o.operationId()});draft={request:frozen,revision:null,summary:null};const current=draft,ticket={epoch:++epoch,context};state='PREVIEWING';publish();try{const r=await call(()=>o.port.preview(copy(frozen)));if(stopped||draft!==current||epoch!==ticket.epoch)return false;if(!matched(ticket,r))throw Error('CONTEXT_MISMATCH');if(r.state==='DENIED'){draft=null;clear();state='DENIED';publish();return false;}if(r.state!=='PREVIEW_READY'||r.operationId!==frozen.operationId||typeof r.revision!=='string'||!r.revision||typeof r.summary!=='string')throw Error('INVALID_PREVIEW');draft.revision=r.revision;draft.summary=r.summary;state='REVIEW';publish();return true;}catch{if(!stopped&&draft===current){draft=null;state='ERROR';publish();}return false;}}
  function cancel(){if(stopped||!['PREVIEWING','REVIEW'].includes(state))return false;epoch++;draft=null;state=rows.length?'READY':'EMPTY';publish();return true;}
  async function resolve(lookup){if(stopped||!draft||state!==(lookup?'UNKNOWN':'REVIEW'))return false;
   const current=draft,request={...copy(draft.request),revision:draft.revision},ticket={epoch:++epoch,context};state=lookup?'CHECKING_RESULT':'SAVING';publish();try{const r=await call(()=>lookup?o.port.lookup(request):o.port.commit(request));if(stopped||draft!==current||epoch!==ticket.epoch)return false;if(!matched(ticket,r))throw Error('CONTEXT_MISMATCH');if(r.operationId!==request.operationId||!['RECORDED','APPLIED','REJECTED','UNKNOWN'].includes(r.state))throw Error('INVALID_COMMIT');if(r.state==='UNKNOWN'){state='UNKNOWN';publish();return false;}if(r.state==='APPLIED'&&(r.applicationConfirmed!==true||typeof r.receiptId!=='string'||!r.receiptId))throw Error('INVALID_RECEIPT');if(r.state==='RECORDED'&&!['REQUESTED','INVITED','READY','CANCELLED','EXPIRED'].includes(r.recordStatus))throw Error('INVALID_RECORDED');result={state:r.state,recordStatus:r.recordStatus||null,receiptId:r.receiptId||null};draft=null;rows=[];state=r.state;publish();return true;}catch{if(!stopped&&draft===current){state='UNKNOWN';publish();}return false;}}
  return Object.freeze({select,read,preview,cancel,commit:()=>resolve(false),lookup:()=>resolve(true),busy,view:()=>copy({state,context,rows,review:draft?.summary||null,operationId:draft?.request.operationId||null,result}),invalidate(){epoch++;rows=[];if(draft&&['SAVING','CHECKING_RESULT','UNKNOWN'].includes(state))state='UNKNOWN';else{draft=null;state='DENIED';}publish();},close(){stopped=true;epoch++;rows=[];result=null;publish();}});
 }
 g.TlhServiceWorkflow=Object.freeze({create});
})(globalThis);
