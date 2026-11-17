/** Candidate only: verified registry metadata/read evidence, never a write permit.
 * Fixed iframe lineage + GAS origin + nonce + full context MAC + current actor/proof.
 * No storage, arbitrary endpoint discovery or application-specific branches.
 */
(function(g){'use strict';
 const TYPE='TLH_SERVICE_REGISTRY_READ_V1',keys=['phase','query','cursor','serviceId','scopeKind','scopeId'];
 const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===ks.slice().sort().join('|');
 const id=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s),hex=(s,n)=>typeof s==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(s);
 const label=s=>typeof s==='string'&&s.length>0&&s.length<=160&&!/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(s);
 const descriptors=(rows,ids)=>Array.isArray(rows)&&rows.length<=100&&(rows.length===0||rows.length===ids.length)&&new Set(rows.map(r=>r?.id)).size===rows.length&&rows.every(r=>exact(r,['id','label','description'])&&ids.includes(r.id)&&typeof r.label==='string'&&r.label.length>0&&r.label.length<=120&&r.label.trim()===r.label&&typeof r.description==='string'&&r.description.length<=500&&!/[\x00-\x1f\x7f]/.test(r.label+r.description));
 const kinds=['ACCOUNT','PERSONAL','ORGANIZATION','STORE','RESOURCE'];
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
 const origin=s=>s==='null'||s==='https://script.google.com'||s==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(s);
 function related(s,f){try{for(let i=0;s&&i<8;i++){if(s===f)return true;const p=s.parent;if(p===s)return false;s=p;}}catch{}return false;}
 function create(o){let stopped=false,pending=null;
  function end(error,data){const r=pending;if(!r)return;clearTimeout(r.timer);pending=null;error?r.reject(Error(error)):r.resolve(data);}
  function read(input){if(stopped)return Promise.reject(Error('CLOSED'));if(!exact(input,keys)||Object.values(input).some(x=>typeof x!=='string')||!['LIST','SELECT'].includes(input.phase)||!kinds.includes(input.scopeKind)||(['ACCOUNT','PERSONAL'].includes(input.scopeKind)?input.scopeId!=='':!id(input.scopeId))||input.query.length>100||input.query!==input.query.trim()||/[\x00-\x1f\x7f]/.test(input.query)||input.cursor.length>2048||input.phase==='LIST'&&input.serviceId!==''||input.phase==='SELECT'&&(!id(input.serviceId)||input.query!==''||input.cursor!==''))return Promise.reject(Error('INVALID_REQUEST'));
   end('SUPERSEDED');const proof=o.getProof(),actor=o.getActor();if(!proof||!id(actor))return Promise.reject(Error('AUTH_REQUIRED'));
   return new Promise((resolve,reject)=>{const request={action:'bridgeServiceRegistryReadV1',...input,idToken:proof,nonce:random(16),responseKey:random(32)},r={request,actor,resolve,reject};pending=r;r.timer=setTimeout(()=>{if(pending===r)end('TIMEOUT');},o.timeoutMs??30000);try{o.post(request);}catch{end('TRANSPORT_ERROR');}});
  }
  async function message(e){const r=pending;if(!r||stopped||!origin(e.origin)||!related(e.source,o.frame.contentWindow))return;const d=e.data,q=r.request;
   if(!exact(d,['type',...keys,'nonce','code','data','mac'])||d.type!==TYPE||[...keys,'nonce'].some(k=>d[k]!==q[k])||typeof d.code!=='string'||typeof d.data!=='string'||d.data.length>200000||!hex(d.mac,64))return;
   let valid=false;try{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(q.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),x=>parseInt(x,16)),enc.encode([d.type,...keys.map(k=>d[k]),d.nonce,d.code,d.data].join('\n')));}catch{}if(!valid||pending!==r||stopped)return;
   if(o.getProof()!==q.idToken||o.getActor()!==r.actor){end('IDENTITY_CHANGED');return;}
   if(!['OK','AUTH_REQUIRED','REGISTRY_NOT_CONNECTED','STALE_SERVICE_CURSOR','SERVICE_REGISTRY_CHANGED','INVALID_REQUEST','FORBIDDEN','READ_ERROR'].includes(d.code)){end('INVALID_DATA');return;}
   if(d.code!=='OK'){if(d.data!=='')return;end(d.code);return;}
   let data;try{data=JSON.parse(d.data);}catch{end('INVALID_DATA');return;}
   const invalid=()=>end('INVALID_DATA');
   if(data?.version!==1||data.actorAccountId!==r.actor)return invalid();
   if(q.phase==='LIST'){
    if(!exact(data,['version','actorAccountId','registryRevision','items','nextCursor'])||!id(data.registryRevision)||!Array.isArray(data.items)||data.items.length>50||typeof data.nextCursor!=='string'||data.nextCursor.length>2048)return invalid();
    const seen=new Set();for(const item of data.items){if(!exact(item,['serviceId','displayName','status','scopeKinds','availableCapabilities','connectionState','capabilityDescriptors'])||!id(item.serviceId)||seen.has(item.serviceId)||!label(item.displayName)||!['ACTIVE','INACTIVE'].includes(item.status)||item.connectionState!=='NOT_VERIFIED'||!Array.isArray(item.scopeKinds)||q.scopeKind!=='ACCOUNT'&&!item.scopeKinds.includes(q.scopeKind)||item.scopeKinds.some(k=>!kinds.includes(k))||!Array.isArray(item.availableCapabilities)||item.availableCapabilities.length>100||new Set(item.availableCapabilities).size!==item.availableCapabilities.length||item.availableCapabilities.some(c=>typeof c!=='string'||!c.startsWith(item.serviceId+':')||c.length>200))return invalid();if(!descriptors(item.capabilityDescriptors,item.availableCapabilities))return invalid();seen.add(item.serviceId);}
   }else{
    if(!exact(data,['version','actorAccountId','selected']))return invalid();const s=data.selected;
    if(!exact(s,['version','serviceId','scope','state','capabilities','authoritative','registryRevision','capabilityDescriptors'])||s.version!==1||s.serviceId!==q.serviceId||!exact(s.scope,['kind','id'])||s.scope.kind!==q.scopeKind||s.scope.id!==(q.scopeId||r.actor)||!['VERIFIED','DENIED','NOT_VERIFIED','ERROR'].includes(s.state)||s.authoritative!==false||!id(s.registryRevision)||!Array.isArray(s.capabilities)||s.capabilities.length>100||new Set(s.capabilities).size!==s.capabilities.length||s.capabilities.some(c=>typeof c!=='string'||!c.startsWith(q.serviceId+':')||c.length>200)||s.state!=='VERIFIED'&&s.capabilities.length||!descriptors(s.capabilityDescriptors,s.capabilities))return invalid();
   }
   end(null,data);
  }
  function close(){stopped=true;end('CLOSED');g.removeEventListener?.('message',message);g.removeEventListener?.('pagehide',close);}
  g.addEventListener('message',message);g.addEventListener('pagehide',close);
  return Object.freeze({read,cancel(){end('CANCELLED');},close});
 }
 g.TlhSignedServiceReader=Object.freeze({create});
})(globalThis);
