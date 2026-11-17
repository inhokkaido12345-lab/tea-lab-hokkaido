/** Compatibility projection only. Input must come from the existing signed,
 * exact-schema self-overview verifier. Candidates are discovery contexts, never
 * permissions. Each SELECT still checks current server authorization. */
(function(g){'use strict';
 function project(overview,actor){
  if(!overview||overview.accountId!==actor||!Array.isArray(overview.organizations)||!Array.isArray(overview.operatingRoles))throw Error('VERIFIED_SELF_REQUIRED');
  const scopes=new Map();
  function add(kind,id,label,source,parent=null){const key=kind+'\n'+id,old=scopes.get(key);if(old){if(old.parent?.id!==parent?.id)throw Error('AMBIGUOUS_SCOPE');if(!old.sources.includes(source))old.sources.push(source);return;}scopes.set(key,{kind,id,label,parent,sources:[source],authorization:'NOT_VERIFIED'});}
  add('PERSONAL','','個人','SELF');add('ACCOUNT','','アカウント','SELF');
  for(const org of overview.organizations){if(!org.membership.effective)continue;add('ORGANIZATION',org.organizationId,org.name,'MEMBERSHIP');for(const store of org.stores){if(store.membership.effective)add('STORE',store.storeId,org.name+' / '+store.name,'MEMBERSHIP',{kind:'ORGANIZATION',id:org.organizationId});}}
  for(const role of overview.operatingRoles){if(!role.effective)continue;if(role.role==='ORGANIZATION_OPERATOR')add('ORGANIZATION',role.organizationId,role.organizationName,'DELEGATION');if(role.role==='STORE_SERVICE_ADMIN')add('STORE',role.storeId,role.organizationName+' / '+role.storeName,'DELEGATION',{kind:'ORGANIZATION',id:role.organizationId});}
  return Object.freeze([...scopes.values()].map(s=>Object.freeze({...s,sources:Object.freeze(s.sources),parent:s.parent?Object.freeze(s.parent):null})));
 }
 g.TlhVerifiedOverviewScopes=Object.freeze({project});
})(globalThis);
