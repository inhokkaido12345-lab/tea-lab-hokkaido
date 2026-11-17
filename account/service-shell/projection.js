/** Generic Account service/scope projection. No app names, permission inheritance or network fanout.
 * Inputs are snapshots from the caller's verified transport, not authorization credentials.
 * Registry metadata declares labels/operations; a selected capability response is separate.
 * Every actual operation remains authorized by its service. Unknown or stale facts disable actions.
 * This module is deliberately not mounted in production until the signed contract is integrated.
 */
(function(g){'use strict';
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
 const label=x=>typeof x==='string'&&x.length>0&&x.length<=160&&!/[\x00-\x1f\x7f]/.test(x);
 const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
 const fail=()=>{throw Error('INVALID_SERVICE_PROJECTION');};
 function registry(rows){if(!Array.isArray(rows)||rows.length>10000)fail();const seen=new Set();return rows.map(r=>{
  if(!exact(r,['serviceId','name','operations'])||!id(r.serviceId)||!label(r.name)||seen.has(r.serviceId)||!Array.isArray(r.operations)||r.operations.length>100)fail();seen.add(r.serviceId);const ops=new Set();
  return Object.freeze({serviceId:r.serviceId,name:r.name,operations:Object.freeze(r.operations.map(o=>{if(!exact(o,['capabilityId','label'])||!id(o.capabilityId)||!label(o.label)||ops.has(o.capabilityId))fail();ops.add(o.capabilityId);return Object.freeze({...o});}))});
 });}
 function scopes(rows){if(!Array.isArray(rows)||rows.length>10000)fail();const seen=new Set(),out=rows.map(s=>{
  if(!exact(s,['scopeId','kind','name','parentScopeId'])||!id(s.scopeId)||!id(s.kind)||!label(s.name)||(s.parentScopeId!==null&&!id(s.parentScopeId))||seen.has(s.scopeId)||s.scopeId===s.parentScopeId)fail();seen.add(s.scopeId);return Object.freeze({...s});
 });const by=new Map(out.map(s=>[s.scopeId,s]));for(const s of out){const path=new Set();let cursor=s;while(cursor){if(path.has(cursor.scopeId))fail();path.add(cursor.scopeId);if(cursor.parentScopeId!==null&&!by.has(cursor.parentScopeId))fail();cursor=by.get(cursor.parentScopeId);}}return out;}
 function create(o){const services=registry(o.registry),targets=scopes(o.scopes);if(!id(o.accountId)||!Number.isSafeInteger(o.revision)||o.revision<0)fail();const accountId=o.accountId,revision=o.revision;let sequence=0,selected=null,stopped=false,snapshot=null,state='IDLE';
  const byService=new Map(services.map(s=>[s.serviceId,s])),byScope=new Map(targets.map(s=>[s.scopeId,s]));
  function select(serviceId,scopeId){if(stopped||!byService.has(serviceId)||!byScope.has(scopeId))return null;const ticket=Object.freeze({sequence:++sequence,accountId,revision,serviceId,scopeId});selected=ticket;snapshot=null;state='LOADING';return ticket;}
  function matching(ticket){return !stopped&&ticket===selected;}
  function accept(ticket,response){if(!matching(ticket))return false;
   if(!exact(response,['accountId','revision','serviceId','scopeId','state','capabilities'])||response.accountId!==accountId||response.revision!==revision||response.serviceId!==ticket.serviceId||response.scopeId!==ticket.scopeId||!['VERIFIED','NOT_CONNECTED','UNAVAILABLE','DENIED'].includes(response.state)||!Array.isArray(response.capabilities)){state='ERROR';snapshot=null;return false;}
   const declared=new Set(byService.get(ticket.serviceId).operations.map(x=>x.capabilityId)),seen=new Set();
   for(const c of response.capabilities)if(!exact(c,['capabilityId','allowed'])||!declared.has(c.capabilityId)||seen.has(c.capabilityId)||typeof c.allowed!=='boolean'||(response.state!=='VERIFIED'&&c.allowed)){state='ERROR';snapshot=null;return false;}else seen.add(c.capabilityId);
   snapshot=new Map(response.capabilities.map(c=>[c.capabilityId,c.allowed]));state=response.state;return true;
  }
  function error(ticket){if(!matching(ticket))return false;snapshot=null;state='ERROR';return true;}
  function clear(){sequence++;selected=null;snapshot=null;state='IDLE';}
  function view(){return Object.freeze({state,selection:selected,operations:Object.freeze(selected?byService.get(selected.serviceId).operations.map(op=>Object.freeze({...op,enabled:state==='VERIFIED'&&snapshot?.get(op.capabilityId)===true})):[])});}
  function page(kind,query='',offset=0,limit=24){if(!['services','scopes'].includes(kind)||typeof query!=='string'||query.length>160||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)fail();const rows=(kind==='services'?services:targets).filter(x=>x.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));return Object.freeze({total:rows.length,offset,items:Object.freeze(rows.slice(offset,offset+limit))});}
  return Object.freeze({page,services:Object.freeze(services),scopes:Object.freeze(targets),select,accept,error,view,clear,stop(){clear();stopped=true;},canInvoke(capabilityId){return !stopped&&view().operations.some(op=>op.capabilityId===capabilityId&&op.enabled);}});
 }
 g.TlhServiceProjection=Object.freeze({create,registry,scopes});
})(globalThis);
