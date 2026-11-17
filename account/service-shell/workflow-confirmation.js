/** A retained single-operation confirmation. Saves never retry automatically.
 * UNKNOWN can only query its original operation or explicitly fence it off. */
(function(g){'use strict';
 const clone=v=>JSON.parse(JSON.stringify(v));
 function create(o){let state='IDLE',intent=null,preview=null,result=null,error='',serial=0;const busy=()=>intent!==null;
  function emit(){o.onState?.({state,intent:intent&&clone(intent),preview:preview&&clone(preview),result:result&&clone(result),error,busy:busy()});}
  async function begin(q){if(busy()||o.blocked?.())return false;intent=clone(q);preview=null;result=null;error='';state='PREVIEW';const n=++serial;emit();try{const v=await o.writer.write({...intent,phase:'PREVIEW',revision:''});if(n!==serial)return false;preview=v;state='REVIEW';emit();return true;}catch(e){if(n===serial){intent=null;state='ERROR';error=e.message;emit();}return false;}}
  function cancel(){if(state!=='REVIEW'&&state!=='PREVIEW')return false;serial++;o.writer.cancel();intent=null;preview=null;state='IDLE';emit();return true;}
  async function accept(v){result=v;if(v.state==='UNKNOWN'){state='UNKNOWN';}else{await o.onTerminal?.(clone(intent),clone(v));intent=null;preview=null;state='RESULT';}emit();}
  async function commit(){if(state!=='REVIEW'||o.blocked?.())return false;state='COMMIT';emit();try{await o.beforeCommit?.(clone(intent));}catch(e){error='RECEIPT_NOT_SAVED';state='REVIEW';emit();return false;}try{const r=await o.writer.write({...intent,phase:'COMMIT',revision:preview.revision});await accept(r);return true;}catch(e){error=e.message;state='UNKNOWN';emit();return false;}}
  async function lookup(){if(state!=='UNKNOWN')return false;state='STATUS';emit();try{const q=intent,r=await o.status.read({serviceId:q.serviceId,scopeKind:q.scopeKind,scopeId:q.scopeId,operationId:q.operationId});if(r.requestId&&r.requestId!==q.requestId)throw Error('WRONG_REQUEST');await accept(r);return true;}catch(e){error=e.message;state='UNKNOWN';emit();return false;}}
  async function abort(){if(state!=='UNKNOWN')return false;state='ABORT_PREVIEW';emit();try{preview=await o.writer.write({...intent,command:'ABORT',specification:'null',phase:'PREVIEW',revision:''});state='ABORT_REVIEW';emit();return true;}catch(e){error=e.message;state='UNKNOWN';emit();return false;}}
  async function confirmAbort(){if(state!=='ABORT_REVIEW')return false;state='COMMIT';emit();try{await accept(await o.writer.write({...intent,command:'ABORT',specification:'null',phase:'COMMIT',revision:preview.revision}));return true;}catch(e){error=e.message;state='UNKNOWN';emit();return false;}}
  function backFromAbort(){if(state!=='ABORT_REVIEW')return false;preview=null;state='UNKNOWN';emit();return true;}
  function invalidate(){if(['PREVIEW','REVIEW'].includes(state))cancel();else if(busy()){error='IDENTITY_CHANGED';emit();}else{result=null;state='IDLE';emit();}}
  emit();return Object.freeze({recover(q){if(busy())return false;intent=clone(q);preview=null;result=null;state='UNKNOWN';error='';emit();return true;},begin,cancel,commit,lookup,abort,confirmAbort,backFromAbort,invalidate,busy,view:()=>({state,intent:intent&&clone(intent),preview:preview&&clone(preview),result:result&&clone(result),error}),close(){if(busy())return false;serial++;o.writer.close();o.status.close();return true;}});
 }
 g.TlhWorkflowConfirmation=Object.freeze({create});
})(globalThis);
