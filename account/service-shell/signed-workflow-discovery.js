/** Candidate read-only discovery. Scope availability is not a grant or write
 * authorization. No company directory scans or service fanout from the browser. */
(function(g){'use strict';
 const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===k.slice().sort().join('|'),id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v),hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
 const permissions={PUBLIC_REQUEST:['REQUEST'],SELF_INBOX:['INBOX'],MEMBERSHIP:['REQUEST'],MANAGEMENT:['QUEUE','TARGETS','INVITE']};
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
 const origin=v=>v==='null'||v==='https://script.google.com'||v==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(v);
 function related(s,f){try{for(let i=0;s&&i<8;i++){if(s===f)return true;const p=s.parent;if(p===s)return false;s=p;}}catch{}return false;}
 function create(o){let stopped=false,pending=null;function end(error,data){const r=pending;if(!r)return;pending=null;clearTimeout(r.timer);error?r.reject(Error(error)):r.resolve(data);}
  function read(q){if(stopped)return Promise.reject(Error('CLOSED'));if(!exact(q,['serviceId','cursor','snapshotRevision'])||!id(q.serviceId)||typeof q.cursor!=='string'||q.cursor.length>2048||typeof q.snapshotRevision!=='string'||q.snapshotRevision!==''&&!hex(q.snapshotRevision,64))return Promise.reject(Error('INVALID_READ'));
   end('SUPERSEDED');const proof=o.getProof(),actor=o.getActor();if(!proof||!actor)return Promise.reject(Error('AUTH_REQUIRED'));
   return new Promise((resolve,reject)=>{const request={action:'bridgeAccessWorkflowDiscoverV1',...q,idToken:proof,nonce:random(16),responseKey:random(32)},r={request,actor,resolve,reject,timer:null};pending=r;r.timer=setTimeout(()=>{if(pending===r)end('TIMEOUT');},o.timeoutMs??30000);try{o.post(request);}catch{end('TRANSPORT_ERROR');}});
  }
  async function message(e){const r=pending;if(!r||stopped||!origin(e.origin)||!related(e.source,o.frame.contentWindow))return;const d=e.data,q=r.request;if(!exact(d,['type','serviceId','nonce','code','data','mac'])||d.type!=='TLH_ACCESS_WORKFLOW_DISCOVER_V1'||d.serviceId!==q.serviceId||d.nonce!==q.nonce||typeof d.code!=='string'||typeof d.data!=='string'||d.data.length>100000||!hex(d.mac,64))return;
   let valid=false;try{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(q.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),v=>parseInt(v,16)),enc.encode([d.type,d.serviceId,d.nonce,d.code,d.data].join('\n')));}catch{}if(!valid||pending!==r||stopped)return;
   if(o.getProof()!==q.idToken||o.getActor()!==r.actor){end('IDENTITY_CHANGED');return;}
   if(d.code!=='DISCOVER_OK'){if(!['AUTH_REQUIRED','NOT_CONNECTED','CAPACITY_REACHED','STALE_SNAPSHOT','DISCOVER_ERROR','INVALID_REQUEST'].includes(d.code)||d.data!==''){end('INVALID_DATA');return;}end(d.code);return;}
   let v;try{v=JSON.parse(d.data);}catch{end('INVALID_DATA');return;}
   const bad=()=>end('INVALID_DATA');if(!exact(v,['version','actorAccountId','serviceId','state','contexts','snapshotRevision','nextCursor','currentAccess'])||v.version!==1||v.actorAccountId!==r.actor||v.serviceId!==q.serviceId||!['READY','NOT_CONNECTED','UNSUPPORTED'].includes(v.state)||v.currentAccess!=='NOT_EVALUATED'||!Array.isArray(v.contexts)||v.contexts.length>50||typeof v.nextCursor!=='string'||v.nextCursor.length>2048||typeof v.snapshotRevision!=='string'||v.state==='READY'&&!hex(v.snapshotRevision,64)||q.snapshotRevision&&v.snapshotRevision!==q.snapshotRevision||v.state!=='READY'&&(v.contexts.length||v.nextCursor||v.snapshotRevision))return bad();
   const seen=new Set();for(const x of v.contexts){if(!exact(x,['scope','displayName','source','actions','requestCapabilities'])||!exact(x.scope,['kind','id'])||!['ACCOUNT','PERSONAL','ORGANIZATION','STORE','RESOURCE'].includes(x.scope.kind)||!id(x.scope.id)||typeof x.displayName!=='string'||x.displayName.length>240||/[\x00-\x1f\x7f]/.test(x.displayName)||!Object.hasOwn(permissions,x.source)||!Array.isArray(x.actions)||!x.actions.length||new Set(x.actions).size!==x.actions.length||x.actions.some(a=>!permissions[x.source].includes(a)))return bad();if(!Array.isArray(x.requestCapabilities)||x.requestCapabilities.length>100||new Set(x.requestCapabilities).size!==x.requestCapabilities.length||x.requestCapabilities.some(c=>typeof c!=='string'||c.length>160||!c.startsWith(q.serviceId+':')||/[\x00-\x20\x7f]/.test(c))||!x.actions.includes('REQUEST')&&x.requestCapabilities.length)return bad();const k=x.source+'\n'+x.scope.kind+'\n'+x.scope.id;if(seen.has(k))return bad();seen.add(k);}
   end(null,v);
  }
  function close(){stopped=true;end('CLOSED');g.removeEventListener?.('message',message);g.removeEventListener?.('pagehide',close);}
  g.addEventListener('message',message);g.addEventListener('pagehide',close);return Object.freeze({read,cancel(){end('CANCELLED');},close});
 }
 g.TlhSignedWorkflowDiscovery=Object.freeze({create});
})(globalThis);
