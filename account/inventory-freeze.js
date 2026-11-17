/** Read-only rollout probe using the inventory signed form contract and existing login broker.
 * Unknown FREEZE_PROBE is rejected without a write even when no freeze is configured.
 * Never treat a marker, an unsigned message, OK, or an arbitrary error as freeze proof.
 */
(function(g){'use strict';
 const n=id=>document.getElementById('freeze-'+id),origin='https://tealabhokkaido.com';
 let pending=null,stopped=false;
 const random=size=>Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');
 const status=text=>{n('status').textContent=text;};
 const controls=()=>{n('probe').disabled=!!pending||stopped||!g.TlhInventoryLogin?.getToken();n('login').disabled=!!pending||stopped;n('store').disabled=!!pending||stopped;};
 const finish=()=>{if(pending){clearTimeout(pending.timer);pending.key='';pending=null;}controls();};
 const validPage=()=>g===g.top&&g.location.origin===origin&&g.location.pathname==='/account/inventory-freeze.html'&&/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(g.TlhInventoryConfig?.apiUrl||'');
 n('login').onclick=async()=>{if(stopped||pending||!validPage())return;try{await g.TlhInventoryLogin.login();if(!stopped)status('本人確認ができました。対象の localStoreId を確認してください。');}catch{if(!stopped)status('本人確認を完了できませんでした。もう一度ログインしてください。');}controls();};
 n('probe').onclick=()=>{
  if(stopped||pending||!validPage())return;
  const token=g.TlhInventoryLogin?.getToken(),store=n('store').value.trim();
  if(!token){status('先にLINEで本人確認してください。');return;}
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(store)||store.startsWith('personal_')){status('対象店舗の localStoreId を入力してください。個人在庫は対象外です。');return;}
  const r={store,nonce:random(16),key:random(32)};pending=r;controls();status('対象 '+store+' の凍結を確認しています…');
  r.timer=setTimeout(()=>{if(pending!==r)return;finish();status('応答を確認できません。凍結は未確認です。');},45000);
  const form=document.createElement('form');form.method='POST';form.action=g.TlhInventoryConfig.apiUrl;form.target=n('frame').name;form.hidden=true;
  const fields={action:'inventoryEmployeeV1',command:'TENANT',input:JSON.stringify({action:'FREEZE_PROBE',operationId:crypto.randomUUID(),storeId:store}),idToken:token,nonce:r.nonce,responseKey:r.key};
  for(const [name,value]of Object.entries(fields)){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);}
  document.body.appendChild(form);try{form.submit();}catch{finish();status('送信できませんでした。凍結は未確認です。');}finally{form.remove();}
 };
 function related(source){try{for(let i=0;source&&i<8;i++){if(source===n('frame').contentWindow)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch{}return false;}
 g.addEventListener('message',async e=>{
  const r=pending,d=e.data;if(!r||stopped||!related(e.source)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
  if(!d||Object.keys(d).sort().join(',')!=='action,code,command,data,mac,nonce,type'||d.type!=='TLH_INVENTORY_V1'||d.action!=='inventoryEmployeeV1'||d.command!=='TENANT'||d.nonce!==r.nonce||typeof d.code!=='string'||!/^[A-Z_]{2,80}$/.test(d.code)||d.data!==''||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return;
  try{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.key),{name:'HMAC',hash:'SHA-256'},false,['verify']);const ok=await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([d.type,d.action,d.command,d.nonce,d.code,d.data].join('\n')));if(!ok||stopped||pending!==r)return;}catch{return;}
  finish();
  if(d.code==='MEMBERSHIP_WRITE_FROZEN')status('対象 '+r.store+'：移行凍結による拒否を署名付き応答で確認しました。在庫変更はありません。COMMONは未変更です。');
  else{if(d.code==='AUTH_REQUIRED')g.TlhInventoryLogin?.clearToken?.();controls();status('対象 '+r.store+'：凍結は未確認です。確認コード：'+d.code+'。COMMONを有効化せず、設定と配布版を確認してください。');}
 });
 g.addEventListener('pagehide',()=>{stopped=true;finish();n('store').value='';status('確認画面を終了しました。');});controls();
})(window);
