/** Scoped service activation invitation. Explicit PREVIEW -> COMMIT, no employment or operations role changes.
 * Secrets remain in page memory and POST body; ISSUE sends only the code hash.
 * Unknown COMMIT retains the immutable operation for explicit retry, never a new operation.
 * GAS verifies active Account and current operating authority again on every request.
 * Contract: bridgeCommonServiceActivationV1. Test this controller and the real GAS together.
 */
(function(global){'use strict';
 const TYPE='TLH_COMMON_SERVICE_ACTIVATION_V2',ACTION='bridgeCommonServiceActivationV1';
 const messages={COMMON_ACTIVATION_PREVIEW_READY:'内容を確認してください。まだ保存していません。',COMMON_ACTIVATION_SAVED:'所属招待の処理が完了しました。',COMMON_ACTIVATION_ALREADY_SAVED:'同じ操作は保存済みです。',COMMON_ACTIVATION_ALREADY_CLAIMED:'この招待は受取済みです。',
 COMMON_AUTH_REQUIRED:'LINEで本人確認をやり直してください。',COMMON_AUTH_UNAVAILABLE:'本人確認の応答を確認できません。',COMMON_ACCOUNT_NOT_REGISTERED:'先に本人のTLHアカウントを作成してください。受付停止中は管理者へ確認してください。',COMMON_ACCOUNT_INACTIVE:'アカウントが停止中です。管理者へ確認してください。',COMMON_AFFILIATION_NOT_CONFIGURED:'共通所属の接続は未設定です。管理者へ確認してください。',COMMON_AFFILIATION_NOT_READY:'共通所属の準備が完了していません。',COMMON_AFFILIATION_REVIEW_REQUIRED:'記録の確認が必要です。操作を止め、管理者へ確認してください。',COMMON_MEMBERSHIP_REQUIRED:'この招待や所属を利用できません。期限・停止状態を管理者へ確認してください。',COMMON_SERVICE_PERMISSION_REQUIRED:'この操作を行う管理権限がありません。',COMMON_SERVICE_NOT_ENABLED:'このサービスは有効になっていません。',COMMON_STORE_BINDING_NOT_FOUND:'店舗の接続設定がありません。',COMMON_STORE_BINDING_CONFLICT:'店舗の接続設定を確認してください。',COMMON_INVALID_REQUEST:'入力または送信内容を確認してください。',COMMON_REVISION_CONFLICT:'確認後に登録状態が変わりました。内容を最初から確認してください。',COMMON_OPERATION_CONFLICT:'同じ操作の内容が一致しません。操作を止め、管理者へ確認してください。',COMMON_RESULT_UNKNOWN:'結果が不明です。結果が確定するまで画面を閉じず、同じ操作の結果を確認してください。'};
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
 const hex=(s,n)=>typeof s==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(s);
 const id=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);
 const scopeId=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(s);
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
 const related=(source,frame)=>{try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch{}return false;};
 async function verify(d,r){
  if(!exact(d,['type','phase','command','nonce','code','data','mac'])||d.type!==TYPE||d.phase!==r.phase||d.command!==r.command||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||typeof d.data!=='string'||d.data.length>4096||!hex(d.mac,64))return false;
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),x=>parseInt(x,16)),enc.encode([TYPE,d.phase,d.command,d.nonce,d.code,d.data].join('\n')));
 }
 function preview(text){let p;try{p=JSON.parse(text);}catch{return null;}
  if(!exact(p,['revision','summary','code'])||!hex(p.revision,64)||p.code!=='COMMON_ACTIVATION_PREVIEW_READY'||!exact(p.summary,['organizationId','organizationName','storeId','storeName','serviceId','permissions','employmentCreated','validityMinutes','addedPermissions','unchangedPermissions']))return null;
  const s=p.summary;if(['organizationName','storeName'].some(k=>typeof s[k]!=='string'||!s[k]||s[k].trim()!==s[k]||s[k].length>100||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(s[k])))return null;if(!scopeId(s.organizationId)||!scopeId(s.storeId)||!id(s.serviceId)||!Array.isArray(s.permissions)||!s.permissions.length||s.permissions.some(p=>typeof p!=='string')||new Set(s.permissions).size!==s.permissions.length||s.employmentCreated!==false||s.validityMinutes!==30||!Array.isArray(s.addedPermissions)||!Array.isArray(s.unchangedPermissions))return null;const partition=[...s.addedPermissions,...s.unchangedPermissions];if(new Set(partition).size!==partition.length||partition.some(x=>!s.permissions.includes(x)))return null;return p;
 }
 function init(options){
  const n=Object.fromEntries(['inputs','lock','claim-form','code','claim','issue-form','org','store','service','issue','preview','summary','identifiers','commit','retry','cancel','issued','issued-code','copy-code','copy-page','close-code','status','frame','permissions','register','open','result-links'].map(k=>[k,document.getElementById('activation-'+k)]));
  let stopped=false,pending=null,draft=null,preparing=false,committed=false,unknown=false,generation=0,completed=false,hasPrimaryLink=false,statusCommand=null,activePanel='self';
  n.issued.hidden=true;n.open.hidden=true;
  let picker=null;const catalog=options.services||[],permissionInputs=[];
  const service=()=>catalog.find(s=>s.serviceId===n.service.value);
  function renderPermissions(){n.permissions.replaceChildren();permissionInputs.length=0;for(const p of service()?.permissions||[]){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=false;label.appendChild(box);const text=document.createElement('span');text.textContent=p.label;label.appendChild(text);n.permissions.appendChild(label);permissionInputs.push({id:p.id,node:box});}}
  n.service.replaceChildren();for(const s of catalog){const el=document.createElement('option');el.value=s.serviceId;el.textContent=s.label;n.service.appendChild(el);}n.service.value=catalog[0]?.serviceId||'';const serviceChoice=document.getElementById('activation-service-choice');if(serviceChoice)serviceChoice.hidden=catalog.length===1;const serviceName=document.getElementById('activation-service-name');if(serviceName){serviceName.hidden=catalog.length!==1;serviceName.textContent=catalog.length===1?catalog[0].label:'';}renderPermissions();n.service.addEventListener('change',()=>{if(!draft&&!pending)renderPermissions();});
  n.register.addEventListener('click',()=>{if(!stopped&&!draft&&!pending&&!options.blocked?.())options.onRegister?.();});
  function renderScope(){const ownCompleted=completed&&activePanel==='self',ownIssued=hex(n['issued-code'].value,64)&&activePanel==='manage';n.inputs.hidden=!!draft||preparing||ownCompleted||ownIssued;n.issued.hidden=!ownIssued;n.open.hidden=!ownCompleted||!hasPrimaryLink;n['result-links'].hidden=!ownCompleted;n.status.hidden=!!statusCommand&&(statusCommand==='CLAIM'?activePanel!=='self':activePanel!=='manage');n.cancel.hidden=!draft&&!preparing&&!ownCompleted;n.cancel.textContent=ownCompleted?'別の招待を受け取る':'入力に戻る';}
  function controls(){const busy=!!pending||preparing;renderScope();n.status.setAttribute('aria-busy',String(busy));
   for(const p of permissionInputs)p.node.disabled=stopped||busy||!!draft;
   n.register.hidden=options.singleRegistration===true||options.registrationState?.()!=='unregistered';n.claim.hidden=options.singleRegistration===true&&options.registrationState?.()==='unregistered';n.register.disabled=stopped||busy||!!draft||!!options.blocked?.();
   for(const k of ['claim','issue','code','org','store','service'])n[k].disabled=stopped||busy||!!draft;
   n.commit.disabled=stopped||busy||!draft?.revision||unknown;n.retry.hidden=!unknown;n.retry.disabled=stopped||busy;
   for(const k of ['copy-code','copy-page','close-code'])n[k].disabled=stopped||!!draft||!hex(n['issued-code'].value,64);
   n.cancel.disabled=stopped||committed;n.preview.hidden=!draft?.revision||unknown;
   picker?.sync();options.onState?.();
  }
  function wipe(){completed=false;hasPrimaryLink=false;n['result-links'].replaceChildren();generation++;if(pending)clearTimeout(pending.timer);pending=null;draft=null;preparing=false;committed=false;unknown=false;n.code.value='';n.open.hidden=true;n['issued-code'].value='';n.issued.hidden=true;n.summary.textContent='';n.identifiers.textContent='';controls();}
  function uncertain(){if(pending)clearTimeout(pending.timer);pending=null;unknown=true;n.status.textContent=messages.COMMON_RESULT_UNKNOWN;controls();}
  function cancel(){if(stopped||committed)return;const code=n.code.value,wasCompleted=completed;wipe();n.code.value=code;n.status.textContent=wasCompleted?'別の利用開始コードを入力してください。':'入力内容を変更できます。保存していません。';}
  function send(phase){
   if(stopped||pending||preparing||!draft||options.blocked?.()||global!==global.top)return;
   let proof;try{proof=options.liff.getIDToken();}catch{}if(!proof){n.status.textContent=messages.COMMON_AUTH_REQUIRED;return;}
   if(draft.proof&&draft.proof!==proof){n.status.textContent='本人確認が変わりました。元の操作の結果を管理者へ確認してください。';return;}draft.proof=proof;
   const r={proof,phase,command:draft.command,nonce:random(16),responseKey:random(32)};pending=r;
   if(phase==='COMMIT')committed=true;
   n.status.textContent=phase==='PREVIEW'?'内容と権限を確認しています…':'保存結果を確認しています…';controls();
   r.timer=setTimeout(()=>{if(pending!==r||stopped)return;uncertain();},30000);
   const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhServiceActivationFrame';form.hidden=true;
   const fields={action:ACTION,apiVersion:'2',phase,command:draft.command,input:JSON.stringify(draft.input),operationId:draft.operationId,revision:phase==='COMMIT'?draft.revision:'',idToken:proof,nonce:r.nonce,responseKey:r.responseKey};
   for(const [name,value]of Object.entries(fields)){const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);}
   document.body.appendChild(form);try{form.submit();}catch{uncertain();}finally{form.remove();}
  }
  async function begin(command){
   if(stopped||pending||preparing||draft||options.blocked?.()||global!==global.top||!crypto.subtle)return;
   let input,secret='';statusCommand=command;controls();
   n['issued-code'].value='';n.issued.hidden=true;
   if(command==='CLAIM'){if(options.registrationState?.()!=='registered'){n.status.textContent=options.registrationState?.()==='unregistered'?'このLINEは未登録です。アカウントを作成後、同じコードをもう一度確認してください。':'本人の登録状態を確認してから受け取ってください。';controls();return;}const inviteCode=n.code.value.trim();if(!hex(inviteCode,64)){n.status.textContent='64桁の利用開始コードを入力してください。';return;}input={inviteCode,reason:'本人が共通所属招待を受け取る'};}
   else{const organizationId=n.org.value.trim(),storeId=n.store.value.trim(),serviceId=n.service.value;if(!scopeId(organizationId)||!scopeId(storeId)||!service()){n.status.textContent='会社ID・店舗ID・サービスを確認してください。';return;}
    const permissions=permissionInputs.filter(p=>p.node.checked).map(p=>p.id).sort();if(service().requiredPermissions?.some(p=>!permissions.includes(p))){n.status.textContent='利用開始に必要な閲覧権限を選択してください。自動では追加しません。';return;}if(!permissions.length){n.status.textContent='付与する操作権限を選択してください。';return;}
    const gen=++generation;preparing=true;controls();secret=random(32);try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));if(stopped||!preparing||generation!==gen)return;
     input={organizationId,storeId,serviceId,permissions,validityMinutes:30,tokenSha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),reason:'管理者が共通所属招待を発行する'};
    }catch{if(stopped||generation!==gen)return;preparing=false;controls();n.status.textContent='安全な招待コードを生成できませんでした。';return;}}
   preparing=false;draft={command,input,secret,operationId:random(16),revision:''};send('PREVIEW');
  }
  n['claim-form'].addEventListener('submit',e=>{e.preventDefault();void begin('CLAIM');});n['issue-form'].addEventListener('submit',e=>{e.preventDefault();void begin('ISSUE');});
  n.commit.addEventListener('click',()=>{if(!draft?.revision||unknown)return;send('COMMIT');});
  n.retry.addEventListener('click',()=>{if(unknown)send(committed?'COMMIT':'PREVIEW');});n.cancel.addEventListener('click',cancel);
  global.addEventListener('message',async event=>{
   const r=pending;if(stopped||!r||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
   let valid=false;try{valid=await verify(event.data,r);}catch{}if(!valid||pending!==r||stopped||options.liff.getIDToken()!==r.proof)return;
   const d=event.data;
   if(d.code==='COMMON_ACTIVATION_PREVIEW_READY'){
    if(r.phase!=='PREVIEW')return;const p=preview(d.data);if(!p)return;if(draft.command==='CLAIM'&&[...p.summary.addedPermissions,...p.summary.unchangedPermissions].slice().sort().join('|')!==p.summary.permissions.slice().sort().join('|'))return;const supported=catalog.find(x=>x.serviceId===p.summary.serviceId);if(!supported||p.summary.permissions.some(x=>!supported.permissions.some(y=>y.id===x)))return;
    if(draft.command==='ISSUE'&&JSON.stringify(p.summary.permissions)!==JSON.stringify(draft.input.permissions))return;
    if(draft.command==='ISSUE'&&['organizationId','storeId','serviceId'].some(k=>p.summary[k]!==draft.input[k]))return;
    clearTimeout(r.timer);pending=null;unknown=false;draft.revision=p.revision;draft.summary=p.summary;
    n.summary.textContent='会社：'+p.summary.organizationName+'\n店舗：'+p.summary.storeName+'\nサービス：'+supported.label+'\n操作：'+p.summary.permissions.map(x=>supported.permissions.find(y=>y.id===x).label).join('・')+'\n招待の受付期限：発行から30分';n.identifiers.textContent='会社ID：'+p.summary.organizationId+'\n店舗ID：'+p.summary.storeId;n.commit.textContent=draft.command==='ISSUE'?'招待を発行':'受け取る';n.status.textContent=messages[d.code];controls();return;
   }
   if(['COMMON_ACTIVATION_SAVED','COMMON_ACTIVATION_ALREADY_SAVED','COMMON_ACTIVATION_ALREADY_CLAIMED'].includes(d.code)){
    if(r.phase!=='COMMIT'&&!(draft.command==='CLAIM'&&d.code==='COMMON_ACTIVATION_ALREADY_CLAIMED'))return;let v;try{v=JSON.parse(d.data);}catch{return;}const keys=d.code==='COMMON_ACTIVATION_SAVED'?['code','savedRevision','invitationId','status','expiresAtUtc','summary']:d.code==='COMMON_ACTIVATION_ALREADY_SAVED'?['code','savedRevision','invitationId','status']:['code','invitationId','status'];
    if(!exact(v,keys)||v.code!==d.code||!id(v.invitationId)||!['PENDING','CLAIMED'].includes(v.status)||('savedRevision' in v&&(!Number.isSafeInteger(v.savedRevision)||v.savedRevision<1))||draft.command==='CLAIM'&&v.status!=='CLAIMED'||draft.command==='ISSUE'&&d.code==='COMMON_ACTIVATION_ALREADY_CLAIMED')return;
    if(v.expiresAtUtc!==undefined&&(typeof v.expiresAtUtc!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.expiresAtUtc)))return;
    if(v.summary&&draft.summary&&JSON.stringify(v.summary)!==JSON.stringify(draft.summary))return;
    if(v.summary&&!preview(JSON.stringify({revision:draft.revision,summary:v.summary,code:'COMMON_ACTIVATION_PREVIEW_READY'})))return;
    const claimed=draft.command==='CLAIM',destination=catalog.find(x=>x.serviceId===draft.summary?.serviceId);const secret=draft.command==='ISSUE'&&v.status==='PENDING'?draft.secret:'';wipe();completed=claimed;if(claimed){const choices=destination?[destination]:catalog;for(const choice of choices){if(!/^\/(?:[a-z0-9-]+\/)+$/.test(choice.path))continue;const label=destination?choice.label+'へ戻る（同じLINEで確認）':'アプリで利用状態を確認（'+choice.label+'）';if(choices.length===1){hasPrimaryLink=true;n.open.href=choice.path;n.open.textContent=label;n.open.hidden=false;}else{const link=document.createElement('a');link.href=choice.path;link.textContent=label;n['result-links'].appendChild(link);}}}n['issued-code'].value=secret;n.issued.hidden=!secret;n.status.textContent=secret?'利用開始コードを発行しました。30分以内に本人へ個別に渡してください。':d.code==='COMMON_ACTIVATION_ALREADY_CLAIMED'?'この招待は受取済みです。現在利用できるかは、アプリで確認してください。':'所属と指定サービス権限の受取りが完了しました。サービスへ戻ってLINEで最新の利用条件を確認してください。';controls();if(claimed)options.onSuccess?.();return;
   }
   if(d.data!=='')return;
   if(d.code==='COMMON_RESULT_UNKNOWN'){uncertain();return;}
   if(committed&&unknown){uncertain();n.status.textContent=messages[d.code]+' 保存済みかはまだ確認できていません。同じ操作で確認するか、管理者へ確認してください。';return;}
   const retainedCode=r.phase==='PREVIEW'&&r.command==='CLAIM'&&['COMMON_INVALID_REQUEST','COMMON_MEMBERSHIP_REQUIRED','COMMON_SERVICE_PERMISSION_REQUIRED','COMMON_SERVICE_NOT_ENABLED','COMMON_REVISION_CONFLICT'].includes(d.code)?n.code.value:'';wipe();n.code.value=retainedCode;n.status.textContent=messages[d.code];
  });
  async function copyIssued(page){if(stopped||draft||n.issued.hidden||!hex(n['issued-code'].value,64))return;const gen=generation,secret=n['issued-code'].value;
   try{if(!global.navigator?.clipboard?.writeText)throw Error('COPY_UNAVAILABLE');await global.navigator.clipboard.writeText(page?'https://tealabhokkaido.com/account/':'招待の受取り：https://tealabhokkaido.com/account/\n利用開始コード：'+secret);if(stopped||gen!==generation||n['issued-code'].value!==secret)return;n.status.textContent=page?'受取りページをコピーしました。招待コードはURLに含めていません。':'招待をコピーしました。本人へ送ってください。';}
   catch{if(stopped||gen!==generation||n['issued-code'].value!==secret)return;if(!page){n['issued-code'].focus?.();n['issued-code'].select?.();}n.status.textContent=page?'コピーできませんでした。受取りページのリンクを長押し、または右クリックしてコピーしてください。':'コピーできませんでした。コード欄を選択してコピーし、このページのURLと一緒に送ってください。';}
  }
  n['copy-code'].addEventListener('click',()=>copyIssued(false));n['copy-page'].addEventListener('click',()=>copyIssued(true));n['close-code'].addEventListener('click',()=>{if(stopped||draft)return;wipe();n.status.textContent='招待コードの表示を消去しました。発行済み招待は取り消されません。';});
  // Browser warning only: force-close/crash recovery is not provided. No secret persistence.
  global.addEventListener('beforeunload',event=>{if(!stopped&&committed&&!!draft){event.preventDefault();event.returnValue='';}});
  global.addEventListener('pagehide',()=>{stopped=true;wipe();n.status.textContent='画面を離れたためコードを消去しました。保存結果が不明な場合は管理者へ確認してください。';});
  picker=global.TlhManagementPicker?.init({...options,prefix:'activation',busy:()=>stopped||!!draft||!!pending||!!options.blocked?.()||preparing});controls();return Object.freeze({activatePanel(key){activePanel=key;renderScope();},checkManagement:()=>picker?.loadScopes(),syncPicker:()=>picker?.sync(),syncRegistration:controls,busy:()=>!!draft||preparing||!!pending});
 }
 global.TlhServiceActivation=Object.freeze({init,verify,preview});
})(window);
