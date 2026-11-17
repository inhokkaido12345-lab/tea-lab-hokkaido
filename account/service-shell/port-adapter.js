/** Adapter for the isolated server service-access port; NOT an HTTP authentication bridge.
 * Registration is metadata, evidence is display-only, invocation requires another current service check.
 * Caller owns verified Account/scope list; do not expose this constructor to unverified messages.
 * No app-specific condition, arbitrary URL, credential persistence, background fanout or writes.
 */
(function(g){'use strict';
 function create(o){let stopped=false;const byScope=new Map(o.scopes.map(s=>[s.scopeId,s]));
  function target(scopeId){const s=byScope.get(scopeId);if(!s)throw Error('UNKNOWN_SCOPE');return ['ACCOUNT','PERSONAL'].includes(s.kind)?{kind:s.kind}:{kind:s.kind,id:s.id};}
  async function page(cursor=0){if(stopped)throw Error('CLOSED');const r=await o.port.listServices({cursor,limit:24});if(stopped)throw Error('CLOSED');if(r.version!==1||!Array.isArray(r.services)||r.services.length>24)throw Error('INVALID_REGISTRY_PAGE');
   const model=g.TlhServiceProjection.create({accountId:o.accountId,revision:o.revision,registry:r.services.map(s=>({serviceId:s.serviceId,name:s.displayName,operations:s.capabilities.map(capabilityId=>({capabilityId,label:capabilityId+'：確認して開く'}))})),scopes:o.scopes.map(({id,...s})=>s)});
   function match(ticket,d){const scope=byScope.get(ticket.scopeId);return d&&d.version===1&&d.authoritative===false&&d.serviceId===ticket.serviceId&&d.scope?.kind===scope.kind&&d.scope.id===(['ACCOUNT','PERSONAL'].includes(scope.kind)?o.accountId:scope.id)&&Array.isArray(d.capabilities);}
   async function inspect(ticket){try{const d=await o.port.resolveSelected({serviceId:ticket.serviceId,scope:target(ticket.scopeId)});if(stopped)return false;if(!match(ticket,d))return model.error(ticket);const state={VERIFIED:'VERIFIED',DENIED:'DENIED',NOT_VERIFIED:'NOT_CONNECTED',ERROR:'UNAVAILABLE'}[d.state];if(!state)return model.error(ticket);return model.accept(ticket,{accountId:o.accountId,revision:o.revision,serviceId:ticket.serviceId,scopeId:ticket.scopeId,state,capabilities:d.capabilities.map(capabilityId=>({capabilityId,allowed:d.state==='VERIFIED'}))});}catch{return model.error(ticket);}}
   async function open(ticket,capabilityId){if(stopped||model.view().selection!==ticket||!model.canInvoke(capabilityId))return false;
    // Display evidence is not a permit. Re-read selected authority, then let the service's
    // existing UI authorize again. This callback may only open its reviewed UI, never write.
    if(!await inspect(ticket)||stopped||model.view().selection!==ticket||!model.canInvoke(capabilityId))return false;
    await o.openReviewedService({serviceId:ticket.serviceId,scope:target(ticket.scopeId),capabilityId});return true;
   }
   return Object.freeze({model,nextCursor:r.nextCursor,inspect,open});
  }
  return Object.freeze({page,close(){stopped=true;}});
 }
 g.TlhServicePortAdapter=Object.freeze({create});
})(globalThis);
