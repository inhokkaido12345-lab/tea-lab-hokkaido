/** Common membership only. Explicit PREVIEW -> COMMIT, no employment or business grants.
 * Secrets remain in page memory and POST body; ISSUE sends only the code hash.
 * Unknown COMMIT retains the immutable operation for explicit retry, never a new operation.
 * GAS verifies active Account and current operating authority again on every request.
 * Contract: bridgeCommonAffiliationInviteV1. Test this controller and the real GAS together.
 */
(function(global){'use strict';
 const TYPE='TLH_COMMON_AFFILIATION_INVITE_V1',ACTION='bridgeCommonAffiliationInviteV1';
 const messages={COMMON_INVITATION_PREVIEW_READY:'内容を確認してください。まだ保存していません。',COMMON_INVITATION_SAVED:'所属招待の処理が完了しました。',COMMON_INVITATION_ALREADY_SAVED:'同じ操作は保存済みです。',COMMON_INVITATION_ALREADY_CLAIMED:'この招待は受取済みです。',
 COMMON_AUTH_REQUIRED:'LINEで本人確認をやり直してください。',COMMON_AUTH_UNAVAILABLE:'本人確認の応答を確認できません。',COMMON_ACCOUNT_NOT_REGISTERED:'先に上の欄でTLHアカウントを作成してください。受付停止中は管理者へ確認してください。',COMMON_ACCOUNT_INACTIVE:'アカウントが停止中です。管理者へ確認してください。',COMMON_AFFILIATION_NOT_CONFIGURED:'共通所属の接続は未設定です。管理者へ確認してください。',COMMON_AFFILIATION_NOT_READY:'共通所属の準備が完了していません。',COMMON_AFFILIATION_REVIEW_REQUIRED:'記録の確認が必要です。操作を止め、管理者へ確認してください。',COMMON_MEMBERSHIP_REQUIRED:'この招待や所属を利用できません。期限・停止状態を管理者へ確認してください。',COMMON_SERVICE_PERMISSION_REQUIRED:'この操作を行う管理権限がありません。',COMMON_SERVICE_NOT_ENABLED:'このサービスは有効になっていません。',COMMON_STORE_BINDING_NOT_FOUND:'店舗の接続設定がありません。',COMMON_STORE_BINDING_CONFLICT:'店舗の接続設定を確認してください。',COMMON_INVALID_REQUEST:'入力または送信内容を確認してください。',COMMON_REVISION_CONFLICT:'確認後に登録状態が変わりました。内容を最初から確認してください。',COMMON_OPERATION_CONFLICT:'同じ操作の内容が一致しません。操作を止め、管理者へ確認してください。',COMMON_RESULT_UNKNOWN:'結果が不明です。別の操作を始めず、同じ操作の結果を確認してください。'};
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
 const hex=(s,n)=>typeof s==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(s);
 const id=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
 const related=(source,frame)=>{try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch{}return false;};
 async function verify(d,r){
  if(!exact(d,['type','phase','command','nonce','code','data','mac'])||d.type!==TYPE||d.phase!==r.phase||d.command!==r.command||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||typeof d.data!=='string'||d.data.length>4096||!hex(d.mac,64))return false;
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),x=>parseInt(x,16)),enc.encode([TYPE,d.phase,d.command,d.nonce,d.code,d.data].join('\n')));
 }
 function preview(text){let p;try{p=JSON.parse(text);}catch{return null;}
  if(!exact(p,['revision','summary','code'])||!hex(p.revision,64)||p.code!=='COMMON_INVITATION_PREVIEW_READY'||!exact(p.summary,['organizationId','storeId','serviceId','permissions','employmentCreated']))return null;
  const s=p.summary;if(!id(s.organizationId)||!id(s.storeId)||!['INVENTORY','WORKFORCE','POS'].includes(s.serviceId)||!Array.isArray(s.permissions)||s.permissions.length||s.employmentCreated!==false)return null;return p;
 }
 function init(options){
  const n=Object.fromEntries(['lock','claim-form','code','claim','issue-form','org','store','service','issue','preview','summary','commit','retry','cancel','issued','issued-code','status','frame'].map(k=>[k,document.getElementById('common-'+k)]));
  let stopped=false,pending=null,draft=null,preparing=false,committed=false,unknown=false,generation=0;
  function controls(){const busy=!!pending||preparing;n.status.setAttribute('aria-busy',String(busy));
   for(const k of ['claim','issue','code','org','store','service'])n[k].disabled=stopped||busy||!!draft;
   n.commit.disabled=stopped||busy||!draft?.revision||unknown;n.retry.hidden=!unknown;n.retry.disabled=stopped||busy;
   n.cancel.hidden=!draft&&!preparing;n.cancel.disabled=stopped||committed;n.preview.hidden=!draft?.revision||unknown;
   options.onState?.();
  }
  function wipe(){generation++;if(pending)clearTimeout(pending.timer);pending=null;draft=null;preparing=false;committed=false;unknown=false;n.code.value='';n['issued-code'].value='';n.issued.hidden=true;n.summary.textContent='';controls();}
  function uncertain(){if(pending)clearTimeout(pending.timer);pending=null;unknown=true;n.status.textContent=messages.COMMON_RESULT_UNKNOWN;controls();}
  function cancel(){if(stopped||committed)return;wipe();n.status.textContent='確認を取りやめました。保存していません。';}
  function send(phase){
   if(stopped||pending||preparing||!draft||options.blocked?.()||global!==global.top)return;
   let proof;try{proof=options.liff.getIDToken();}catch{}if(!proof){n.status.textContent=messages.COMMON_AUTH_REQUIRED;return;}
   const r={phase,command:draft.command,nonce:random(16),responseKey:random(32)};pending=r;
   if(phase==='COMMIT')committed=true;
   n.status.textContent=phase==='PREVIEW'?'内容と権限を確認しています…':'保存結果を確認しています…';controls();
   r.timer=setTimeout(()=>{if(pending!==r||stopped)return;uncertain();},30000);
   const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhCommonAffiliationInviteFrame';form.hidden=true;
   const fields={action:ACTION,apiVersion:'1',phase,command:draft.command,input:JSON.stringify(draft.input),operationId:draft.operationId,revision:phase==='COMMIT'?draft.revision:'',idToken:proof,nonce:r.nonce,responseKey:r.responseKey};
   for(const [name,value]of Object.entries(fields)){const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);}
   document.body.appendChild(form);try{form.submit();}catch{uncertain();}finally{form.remove();}
  }
  async function begin(command){
   if(stopped||pending||preparing||draft||options.blocked?.()||global!==global.top||!crypto.subtle)return;
   let input,secret='';
   n['issued-code'].value='';n.issued.hidden=true;
   if(command==='CLAIM'){const inviteCode=n.code.value.trim();if(!hex(inviteCode,64)){n.status.textContent='64桁の所属招待コードを入力してください。';return;}input={inviteCode,reason:'本人が共通所属招待を受け取る'};}
   else{const organizationId=n.org.value.trim(),storeId=n.store.value.trim(),serviceId=n.service.value;if(!id(organizationId)||!id(storeId)||!['INVENTORY','WORKFORCE','POS'].includes(serviceId)){n.status.textContent='会社ID・店舗ID・サービスを確認してください。';return;}
    const gen=++generation;preparing=true;controls();secret=random(32);try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));if(stopped||!preparing||generation!==gen)return;
     input={organizationId,storeId,serviceId,tokenSha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),reason:'管理者が共通所属招待を発行する'};
    }catch{if(stopped||generation!==gen)return;preparing=false;controls();n.status.textContent='安全な招待コードを生成できませんでした。';return;}}
   preparing=false;draft={command,input,secret,operationId:random(16),revision:''};send('PREVIEW');
  }
  n['claim-form'].addEventListener('submit',e=>{e.preventDefault();void begin('CLAIM');});n['issue-form'].addEventListener('submit',e=>{e.preventDefault();void begin('ISSUE');});
  n.commit.addEventListener('click',()=>{if(!draft?.revision||unknown)return;send('COMMIT');});
  n.retry.addEventListener('click',()=>{if(unknown)send(committed?'COMMIT':'PREVIEW');});n.cancel.addEventListener('click',cancel);
  global.addEventListener('message',async event=>{
   const r=pending;if(stopped||!r||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
   let valid=false;try{valid=await verify(event.data,r);}catch{}if(!valid||pending!==r||stopped)return;
   const d=event.data;
   if(d.code==='COMMON_INVITATION_PREVIEW_READY'){
    if(r.phase!=='PREVIEW')return;const p=preview(d.data);if(!p)return;
    if(draft.command==='ISSUE'&&['organizationId','storeId','serviceId'].some(k=>p.summary[k]!==draft.input[k]))return;
    clearTimeout(r.timer);pending=null;unknown=false;draft.revision=p.revision;
    n.summary.textContent='会社：'+p.summary.organizationId+' ／ 店舗：'+p.summary.storeId+' ／ '+p.summary.serviceId+'。所属のみ。社員情報・勤怠登録・業務権限は追加しません。';n.status.textContent=messages[d.code];controls();return;
   }
   if(['COMMON_INVITATION_SAVED','COMMON_INVITATION_ALREADY_SAVED','COMMON_INVITATION_ALREADY_CLAIMED'].includes(d.code)){
    if(r.phase!=='COMMIT'&&!(draft.command==='CLAIM'&&d.code==='COMMON_INVITATION_ALREADY_CLAIMED'))return;let v;try{v=JSON.parse(d.data);}catch{return;}const keys=d.code==='COMMON_INVITATION_SAVED'?['code','savedRevision','invitationId','status','summary']:d.code==='COMMON_INVITATION_ALREADY_SAVED'?['code','savedRevision','invitationId','status']:['code','invitationId','status'];
    if(!exact(v,keys)||v.code!==d.code||!id(v.invitationId)||!['PENDING','CLAIMED'].includes(v.status)||('savedRevision' in v&&(!Number.isSafeInteger(v.savedRevision)||v.savedRevision<1))||draft.command==='CLAIM'&&v.status!=='CLAIMED'||draft.command==='ISSUE'&&d.code==='COMMON_INVITATION_ALREADY_CLAIMED')return;
    if(v.summary&&!preview(JSON.stringify({revision:draft.revision,summary:v.summary,code:'COMMON_INVITATION_PREVIEW_READY'})))return;
    const secret=draft.command==='ISSUE'&&v.status==='PENDING'?draft.secret:'';wipe();n['issued-code'].value=secret;n.issued.hidden=!secret;n.status.textContent=secret?'所属招待を発行しました。本人に個別に渡してください。':'所属招待を受け取りました。業務権限は管理者が別途設定します。';return;
   }
   if(d.data!=='')return;
   if(d.code==='COMMON_RESULT_UNKNOWN'){uncertain();return;}
   if(committed&&unknown){uncertain();n.status.textContent=messages[d.code]+' 保存済みかはまだ確認できていません。同じ操作で確認するか、管理者へ確認してください。';return;}
   wipe();n.status.textContent=messages[d.code];
  });
  global.addEventListener('pagehide',()=>{stopped=true;wipe();n.status.textContent='画面を離れたためコードを消去しました。保存結果が不明な場合は管理者へ確認してください。';});
  controls();return Object.freeze({busy:()=>!!draft||preparing||!!pending});
 }
 global.TlhCommonAffiliation=Object.freeze({init,verify,preview});
})(window);
