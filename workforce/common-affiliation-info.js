/** Platform-owned self affiliation read only. Independent of WorkTime employee/role DTO.
 * Missing/failed common service cannot disable legacy WorkTime. No write or permission inference.
 * Signature, iframe lineage, one-use nonce and current proof are checked before text-only rendering.
 */
(function(global){'use strict';
 const TYPE='TLH_COMMON_AFFILIATION_V1',PHASE='READ_SELF';
 const messages={COMMON_AFFILIATION_READY:'共通の会社・店舗所属を確認しました。',COMMON_ACCOUNT_NOT_REGISTERED:'TLHアカウントは未登録です。',COMMON_AFFILIATION_NOT_CONFIGURED:'共通所属の接続は未設定です。既存の勤怠登録とは別です。',COMMON_AFFILIATION_NOT_READY:'共通所属は準備中です。所属なしとは判定しません。',COMMON_AFFILIATION_REVIEW_REQUIRED:'共通所属を確認できません。管理者へ確認してください。',COMMON_AUTH_REQUIRED:'LINE本人確認をやり直してください。',COMMON_AUTH_UNAVAILABLE:'本人確認に接続できません。',COMMON_ACCOUNT_INACTIVE:'TLHアカウントが停止中です。',COMMON_INVALID_REQUEST:'共通所属の確認リクエストが無効です。',COMMON_MEMBERSHIP_REQUIRED:'所属を確認できません。',COMMON_SERVICE_NOT_ENABLED:'サービスの設定を確認してください。',COMMON_SERVICE_PERMISSION_REQUIRED:'サービスの権限を確認してください。',COMMON_STORE_BINDING_NOT_FOUND:'店舗の接続は未設定です。',COMMON_STORE_BINDING_CONFLICT:'店舗の接続設定に不一致があります。',COMMON_REVISION_CONFLICT:'情報が更新されました。もう一度確認してください。',COMMON_OPERATION_CONFLICT:'情報の確認が必要です。',COMMON_RESULT_UNKNOWN:'結果を確認できません。'};
 const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===k.slice().sort().join(',');
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x),name=x=>typeof x==='string'&&x.length>0&&x.length<=200;
 const hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x);
 function parse(text){let d;try{if(typeof text!=='string'||text.length>65536)return null;d=JSON.parse(text);}catch{return null;}
  if(!exact(d,['version','account','memberships','readAtUtc','authorityRevision'])||d.version!==1||!exact(d.account,['accountId','status','linkedProviders'])||!id(d.account.accountId)||d.account.status!=='ACTIVE'||JSON.stringify(d.account.linkedProviders)!=='["LINE"]'||!hex(d.authorityRevision,64)||typeof d.readAtUtc!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(d.readAtUtc)||!Number.isFinite(Date.parse(d.readAtUtc))||new Date(d.readAtUtc).toISOString()!==d.readAtUtc||!Array.isArray(d.memberships)||d.memberships.length>500)return null;
  const keys=new Set();for(const m of d.memberships){if(!exact(m,['membershipId','storeMembershipId','organizationId','organizationName','storeId','storeName','services'])||!['membershipId','storeMembershipId','organizationId','storeId'].every(k=>id(m[k]))||!name(m.organizationName)||!name(m.storeName)||!Array.isArray(m.services)||m.services.length!==3)return null;
   const key=m.organizationId+'\n'+m.storeId;if(keys.has(key))return null;keys.add(key);const services=new Set();for(const s of m.services){if(!exact(s,['serviceId','enabled','permissions'])||!['WORKFORCE','INVENTORY','POS'].includes(s.serviceId)||services.has(s.serviceId)||typeof s.enabled!=='boolean'||!Array.isArray(s.permissions)||new Set(s.permissions).size!==s.permissions.length||s.permissions.some(p=>s.serviceId!=='INVENTORY'||!['inventory.read','inventory.receive','inventory.order','inventory.manage'].includes(p))||!s.enabled&&s.permissions.length)return null;services.add(s.serviceId);}}
  return d;
 }
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
 function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch{}return false;}
 async function verify(d,r){if(!exact(d,['type','phase','nonce','code','data','mac'])||d.type!==TYPE||d.phase!==PHASE||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||typeof d.data!=='string'||d.data.length>65536||d.code!=='COMMON_AFFILIATION_READY'&&d.data!==''||!hex(d.mac,64))return false;
 const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),x=>parseInt(x,16)),enc.encode([TYPE,PHASE,d.nonce,d.code,d.data].join('\n')));}
 function init(options){const n=Object.fromEntries(['check','status','result','frame'].map(k=>[k,document.getElementById('common-self-'+k)]));if(Object.values(n).some(v=>!v))return null;
 let pending=null,stopped=false,expected=null,shown=null;
 const clear=()=>{shown=null;n.result.replaceChildren();};
 function finish(){if(pending)clearTimeout(pending.timer);pending=null;n.check.disabled=stopped;n.status.setAttribute('aria-busy','false');}
 function setAccount(accountId){expected=accountId;if(shown&&shown!==expected){clear();n.status.textContent='本人情報が一致しないため共通所属を表示できません。LINE本人確認をやり直してください。';}}
 function render(d){clear();shown=d.account.accountId;const p=document.createElement('p');p.textContent='共通アカウント：'+shown;n.result.appendChild(p);
  if(!d.memberships.length){const p=document.createElement('p');p.textContent='共通の会社・店舗所属はまだありません。';n.result.appendChild(p);return;}
  for(const m of d.memberships){const p=document.createElement('p');p.textContent=m.organizationName+' ／ '+m.storeName;n.result.appendChild(p);const ul=document.createElement('ul');for(const s of m.services){const li=document.createElement('li');li.textContent=({WORKFORCE:'勤怠',INVENTORY:'在庫',POS:'POS'})[s.serviceId]+'：'+(!s.enabled?'サービス未有効':s.permissions.length?'共通の業務権限 '+s.permissions.join(' / '):'共通の業務権限なし');ul.appendChild(li);}n.result.appendChild(ul);}}
 function load(){if(stopped||pending||global!==global.top||!crypto.subtle)return;clear();let proof;try{proof=options.liff.getIDToken();}catch{}if(!proof){n.status.textContent=messages.COMMON_AUTH_REQUIRED;return;}
  const r={nonce:random(16),responseKey:random(32),proof};pending=r;n.check.disabled=true;n.status.setAttribute('aria-busy','true');n.status.textContent='共通所属を確認しています…';
  r.timer=setTimeout(()=>{if(pending!==r)return;clear();n.status.textContent='共通所属の応答を確認できません。所属なしとは判定しません。';finish();},30000);
  const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhCommonSelfFrame';form.hidden=true;for(const [name,value]of Object.entries({action:'bridgeCommonAffiliationV1',phase:PHASE,nonce:r.nonce,responseKey:r.responseKey,idToken:proof})){const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);}document.body.appendChild(form);try{form.submit();}catch{clear();n.status.textContent='共通所属に接続できません。';finish();}finally{form.remove();}}
 n.check.addEventListener('click',load);
 global.addEventListener('message',async e=>{const r=pending;if(stopped||!r||!related(e.source,n.frame.contentWindow)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
 let ok=false;try{ok=await verify(e.data,r);}catch{}if(!ok||pending!==r||stopped)return;let proof;try{proof=options.liff.getIDToken();}catch{}if(proof!==r.proof){clear();n.status.textContent='本人確認が変わったため表示しません。確認し直してください。';finish();return;}
 const d=e.data;if(d.code==='COMMON_AFFILIATION_READY'){const value=parse(d.data);if(!value)return;if(expected&&value.account.accountId!==expected){clear();n.status.textContent='本人情報が一致しないため共通所属を表示できません。';finish();return;}render(value);}else clear();n.status.textContent=messages[d.code];finish();});
 global.addEventListener('pagehide',()=>{stopped=true;expected=null;clear();finish();n.status.textContent='共通所属の表示を消去しました。';});return Object.freeze({load,setAccount});
 }
 global.TlhCommonAffiliationInfo=Object.freeze({init,parse,verify});
})(window);
