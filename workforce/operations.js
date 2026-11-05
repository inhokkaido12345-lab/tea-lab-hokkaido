/**
 * 配布用・TLH運営/会社運営Webの共通controller。専用APIが未設定なら操作を閉じる。
 * 流れ：LIFF→独立READ→許可操作→PREVIEW→本人の確認→COMMIT→読戻し。
 * 削除影響：運営2画面だけ停止。勤怠の既存controller/原簿/受付へ影響しない。
 * 一般化：state machine / signed DTO / optimistic concurrency / idempotency。
 * 初歩：表示名はroleの日本語訳。URLやselectの変更ではサーバー権限は増えない。
 * 魔改造：command/フォーム項目はGAS OperationsBridge/Serviceと契約・両repo検査を同期。
 * 境界：token/Account ID/入力/応答鍵はメモリだけ。URL/Storage/consoleへ書かない。
 * 検証：operations.test.mjs＋backend operations-api＋固定版の連結→公開後に本人読取。
 */
(function(g){'use strict';
 const config=Object.freeze({liffId:'2011940133-JXUDzLnG',gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec'});
 const labels=Object.freeze({PLATFORM_OPERATOR:'TLH運営管理者',ORGANIZATION_OPERATOR:'会社管理者',STORE_SERVICE_ADMIN:'店舗サービス管理者',
 BOOTSTRAP:'最初のTLH運営管理者を設定',CREATE_ORGANIZATION:'利用会社を登録',CREATE_STORE:'店舗を登録',UPDATE_STORE:'店舗名を変更',
 ASSIGN_PLATFORM_OPERATOR:'TLH運営管理者を設定',ASSIGN_ORGANIZATION_OPERATOR:'会社管理者を設定',ASSIGN_STORE_SERVICE_ADMIN:'店舗サービス管理者を設定'});
 const specs={BOOTSTRAP:[],CREATE_ORGANIZATION:['organizationId','name'],CREATE_STORE:['organizationId','storeId','name'],UPDATE_STORE:['organizationId','storeId','name'],
 ASSIGN_PLATFORM_OPERATOR:['accountId','enabled'],ASSIGN_ORGANIZATION_OPERATOR:['organizationId','accountId','enabled'],ASSIGN_STORE_SERVICE_ADMIN:['organizationId','storeId','serviceId','accountId','enabled']};
 const fields={organizationId:'organization',storeId:'store',name:'name',accountId:'account',enabled:'enabled',serviceId:'service'};
 const errors={OPERATIONS_AUTH_REQUIRED:'LINEでログインし直してください。',OPERATIONS_ACCESS_DENIED:'この運営画面を利用する権限がありません。',OPERATIONS_NOT_CONFIGURED:'運営管理の専用台帳は接続準備中です。',
 OPERATIONS_REVIEW_REQUIRED:'保存先の確認が必要です。保存操作を繰り返さずTLH運営へ連絡してください。',OPERATIONS_TARGET_UNAVAILABLE:'対象の会社・店舗・有効なTLHアカウントを確認してください。',
 OPERATIONS_LAST_PLATFORM_OPERATOR:'最後の有効なTLH運営管理者は解除できません。',OPERATIONS_REVISION_CONFLICT:'情報が更新されました。読み直して変更内容を確認してください。',
 OPERATIONS_OPERATION_CONFLICT:'同じ操作番号で異なる内容は保存できません。',OPERATIONS_ALREADY_EXISTS:'その会社IDまたは店舗IDは登録済みです。',OPERATIONS_BUSY:'処理が混み合っています。時間をおいて確認してください。',
 OPERATIONS_CAPACITY_REACHED:'運営履歴の保管容量に達しました。TLH運営へ連絡してください。',OPERATIONS_INPUT_INVALID:'入力内容を確認してください。',OPERATIONS_UNAVAILABLE:'応答を確認できませんでした。'};
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v),exact=(v,k)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===k.slice().sort().join(',');
 const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=100&&!/[\x00-\x1f\x7f]/.test(v);
 const services=['WORKFORCE','INVENTORY','POS'];
 function parseCatalog(value,view){
  if(!exact(value,['version','revision','view','permissions','organizations','stores','grants','businessAuthorityConnected','remainingOperations'])||value.version!==1||value.view!==view||value.businessAuthorityConnected!==false||
    !Number.isSafeInteger(value.revision)||value.revision<0||!Number.isSafeInteger(value.remainingOperations)||value.remainingOperations<0||
    !exact(value.permissions,['platform','bootstrap','organizationIds'])||typeof value.permissions.platform!=='boolean'||typeof value.permissions.bootstrap!=='boolean'||
    !Array.isArray(value.permissions.organizationIds)||value.permissions.organizationIds.some(x=>!id(x))||
    [value.organizations,value.stores,value.grants].some(x=>!Array.isArray(x)||x.length>1000))return null;
  const orgs=new Set(),stores=new Set();
  for(const o of value.organizations){if(!exact(o,['organizationId','name'])||!id(o.organizationId)||!text(o.name)||orgs.has(o.organizationId))return null;orgs.add(o.organizationId);}
  for(const s of value.stores){if(!exact(s,['organizationId','storeId','name','services'])||!orgs.has(s.organizationId)||!id(s.storeId)||!text(s.name)||stores.has(s.storeId)||!Array.isArray(s.services)||s.services.length!==3||s.services.some((x,i)=>!exact(x,['serviceId','state','canLaunch'])||x.serviceId!==services[i]||x.state!=='NOT_CONNECTED'||x.canLaunch!==false))return null;stores.add(s.storeId);}
  for(const r of value.grants)if(!exact(r,['accountId','role','organizationId','storeId','serviceId','status','validFrom'])||!id(r.accountId)||!['PLATFORM_OPERATOR','ORGANIZATION_OPERATOR','STORE_SERVICE_ADMIN'].includes(r.role)||!['ACTIVE','INACTIVE'].includes(r.status)||typeof r.validFrom!=='string')return null;
  return value;
 }
 function random(n){return Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');}
 function related(source,target){try{return source===target||source?.parent===target||source?.parent?.parent===target;}catch(_e){return false;}}
 function originAllowed(o){return o==='null'||o==='https://script.google.com'||o==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(o);}
 async function verify(d,r){
  if(!exact(d,['type','action','nonce','phase','command','code','revision','payload','mac'])||Object.values(d).some(x=>typeof x!=='string')||d.type!=='TLH_OPERATIONS_REPLY_V1'||d.action!=='bridgeOperationsV1'||d.nonce!==r.nonce||d.phase!==r.phase||d.command!==r.command||!/^[a-f0-9]{64}$/.test(d.mac))return false;
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode(JSON.stringify([d.type,d.action,d.nonce,d.phase,d.command,d.code,d.revision,d.payload])));
 }
 function init(options){
  const n=Object.fromEntries(['status','login','refresh','fields','command','organization','organization-new','store','store-new','name','account','enabled','service','reason','preview','commit','cancel','retry','review','result','frame'].map(k=>[k,document.getElementById('ops-'+k)]));
  const view=options.view;let stopped=false,pending=null,catalog=null,draft=null,reviewed=false,uncertain=false,loginRequired=!!options.loginRequired;
  const create=(tag,t)=>{const e=document.createElement(tag);if(t!==undefined)e.textContent=t;return e;};
  function controls(){const ready=!!catalog&&!pending&&!stopped&&!loginRequired&&!uncertain;
   n.fields.disabled=!ready||reviewed;n.preview.disabled=!ready||reviewed;n.refresh.disabled=!!pending||stopped||uncertain||loginRequired;
   n.commit.hidden=!reviewed||uncertain;n.commit.disabled=!ready||!reviewed;
   n.cancel.disabled=!!pending||stopped||uncertain||!draft;n.retry.hidden=!uncertain;n.retry.disabled=!!pending||stopped||loginRequired;
   n.login.hidden=!loginRequired;n.login.disabled=!!pending||stopped;n.status.setAttribute('aria-busy',String(!!pending));
  }
  function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
  function clearDraft(){draft=null;reviewed=false;uncertain=false;n.review.replaceChildren();}
  function clearCatalog(){catalog=null;n.result.replaceChildren();n.command.replaceChildren();n.organization.replaceChildren();n.store.replaceChildren();}
  function chooseOptions(el,rows,label){const previous=el.value;el.replaceChildren();for(const row of rows){const o=create('option',label(row));o.value=row.organizationId||row.storeId;el.appendChild(o);}if(rows.some(r=>(r.organizationId||r.storeId)===previous))el.value=previous;}
  function storeChoices(){if(!catalog)return;const org=n.organization.value;chooseOptions(n.store,catalog.stores.filter(s=>s.organizationId===org).map(s=>({storeId:s.storeId,name:s.name})),s=>s.name+'（'+s.storeId+'）');}
  function formVisibility(){const cmd=n.command.value,uses=specs[cmd]||[];for(const k of Object.keys(fields)){const row=document.getElementById('ops-row-'+k);if(row)row.hidden=!uses.includes(k);}
   n.organization.hidden=cmd==='CREATE_ORGANIZATION';n['organization-new'].hidden=cmd!=='CREATE_ORGANIZATION';n.store.hidden=cmd==='CREATE_STORE';n['store-new'].hidden=cmd!=='CREATE_STORE';
  }
  function render(data){
   catalog=data;n.result.replaceChildren();n.result.appendChild(create('p','保存版：'+data.revision+' ／ 履歴の残り：'+data.remainingOperations+'件'));
   for(const org of data.organizations){const section=create('section');section.appendChild(create('h2',org.name));section.appendChild(create('p','会社ID：'+org.organizationId));
    for(const s of data.stores.filter(x=>x.organizationId===org.organizationId)){section.appendChild(create('h3',s.name));section.appendChild(create('p','店舗ID：'+s.storeId+' ／ タイムカード・在庫管理・POS：未接続（利用状態未照合）'));}n.result.appendChild(section);}
   const h=create('h2','登録されている運営権限');n.result.appendChild(h);
   for(const r of data.grants){const org=data.organizations.find(x=>x.organizationId===r.organizationId),store=data.stores.find(x=>x.storeId===r.storeId);
    n.result.appendChild(create('p',[labels[r.role],r.accountId,org?.name,store?.name,r.serviceId,r.status==='ACTIVE'?'有効':'停止'].filter(Boolean).join(' ／ ')));}
   chooseOptions(n.organization,data.organizations,o=>o.name+'（'+o.organizationId+'）');storeChoices();n.command.replaceChildren();
   const commands=view==='PLATFORM'?(data.permissions.bootstrap?['BOOTSTRAP']:data.permissions.platform?['CREATE_ORGANIZATION','ASSIGN_PLATFORM_OPERATOR','ASSIGN_ORGANIZATION_OPERATOR']:[]):['CREATE_STORE','UPDATE_STORE','ASSIGN_STORE_SERVICE_ADMIN'];
   for(const cmd of commands){const o=create('option',labels[cmd]);o.value=cmd;n.command.appendChild(o);}if(commands.length)n.command.value=commands[0];formVisibility();
  }
  function input(){const cmd=n.command.value,i={};for(const k of specs[cmd]||[]){i[k]=k==='organizationId'?(cmd==='CREATE_ORGANIZATION'?n['organization-new'].value.trim():n.organization.value):k==='storeId'?(cmd==='CREATE_STORE'?n['store-new'].value.trim():n.store.value):k==='enabled'?n.enabled.value==='true':n[fields[k]].value.trim();
   if(k==='name'?!text(i[k]):k==='enabled'?typeof i[k]!=='boolean':k==='serviceId'?!services.includes(i[k]):!id(i[k]))throw Error('input');}
   i.reason=n.reason.value.trim();if(!i.reason||i.reason.length>200||/[\x00-\x1f\x7f]/.test(i.reason))throw Error('input');return i;
  }
  function send(phase){
   if(stopped||pending||loginRequired)return;if(g!==g.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。画面を直接開いてください。';return;}let proof;try{proof=options.liff.getIDToken();}catch(_e){}
   if(!proof){loginRequired=true;n.status.textContent=errors.OPERATIONS_AUTH_REQUIRED;controls();return;}
   const r={phase,command:phase==='READ'?'READ':draft.command,input:phase==='READ'?{}:draft.input,operationId:phase==='READ'?'':draft.operationId,revision:phase==='COMMIT'?draft.revision:'',nonce:random(16),responseKey:random(32)};
   pending=r;controls();n.status.textContent='通信しています。';r.timer=setTimeout(()=>{if(pending!==r)return;if(phase==='COMMIT'){uncertain=true;reviewed=false;n.status.textContent='保存結果が不明です。入力を変えず「同じ操作の保存結果を確認」を押してください。';}else{if(phase==='PREVIEW')clearDraft();n.status.textContent='応答を確認できません。もう一度確認してください。';}finish();},30000);
   const form=document.createElement('form');form.method='POST';form.action=config.gasUrl;form.target='tlhOperationsFrame';form.hidden=true;
   for(const [name,value]of Object.entries({action:'bridgeOperationsV1',apiVersion:'1',phase:r.phase,view,command:r.command,input:JSON.stringify(r.input),operationId:r.operationId,revision:r.revision,nonce:r.nonce,responseKey:r.responseKey,idToken:proof})){const e=create('input');e.type='hidden';e.name=name;e.value=value;form.appendChild(e);}
   document.body.appendChild(form);try{form.submit();}catch(_e){if(phase==='COMMIT'){uncertain=true;reviewed=false;}else clearDraft();n.status.textContent='通信結果を確認できませんでした。';finish();}finally{form.remove();}
  }
  n.command.addEventListener('change',()=>{if(draft||pending||stopped)return;formVisibility();});n.organization.addEventListener('change',storeChoices);
  n.refresh.addEventListener('click',()=>{if(n.refresh.disabled)return;clearDraft();clearCatalog();send('READ');});
  n.preview.addEventListener('click',()=>{if(n.preview.disabled||pending||stopped)return;try{draft={command:n.command.value,input:input(),operationId:random(16),revision:''};reviewed=false;send('PREVIEW');}catch(_e){clearDraft();n.status.textContent='対象・名前・TLHアカウントID・理由を確認してください。';controls();}});
  n.commit.addEventListener('click',()=>{if(!n.commit.disabled&&reviewed&&draft&&!stopped)send('COMMIT');});
  n.retry.addEventListener('click',()=>{if(!n.retry.disabled&&uncertain&&draft&&!stopped)send('COMMIT');});
  n.cancel.addEventListener('click',()=>{if(n.cancel.disabled)return;clearDraft();n.status.textContent='確認を取り消しました。保存はしていません。';controls();});
  n.login.addEventListener('click',()=>{if(n.login.disabled)return;n.login.disabled=true;try{const redirectUri=g.location.origin+g.location.pathname;if(options.liff.isLoggedIn())options.liff.logout();options.liff.login({redirectUri});}catch(_e){n.login.disabled=false;n.status.textContent='LINEログインを開始できません。';}});
  g.addEventListener('message',async event=>{
   const r=pending;if(!r||stopped||!originAllowed(event.origin)||!related(event.source,n.frame.contentWindow))return;let valid=false;try{valid=await verify(event.data,r);}catch(_e){}if(!valid||pending!==r||stopped)return;
   const d=event.data;let data;try{data=JSON.parse(d.payload);}catch(_e){return;}
   if(r.phase==='READ'&&d.code==='OPERATIONS_READY'){const value=parseCatalog(data,view);if(!value)return;render(value);n.status.textContent='運営情報を読み込みました。';finish();return;}
   if(r.phase==='PREVIEW'&&d.code==='OPERATIONS_PREVIEW_READY'){
    if(!/^[a-f0-9]{64}$/.test(d.revision)||!exact(data,['command','input','baseRevision','businessAuthorityConnected'])||data.command!==draft?.command||JSON.stringify(data.input)!==JSON.stringify(draft.input)||!Number.isSafeInteger(data.baseRevision)||data.businessAuthorityConnected!==false)return;
    draft.revision=d.revision;reviewed=true;n.review.replaceChildren();n.review.appendChild(create('h2','保存前の確認'));n.review.appendChild(create('p',labels[draft.command]));
    const captions={organizationId:'会社ID',storeId:'店舗ID',accountId:'対象TLHアカウントID',serviceId:'サービス',enabled:'変更後',name:'名称',reason:'理由'};
    for(const [k,v]of Object.entries(draft.input)){const label=k==='organizationId'?catalog.organizations.find(x=>x.organizationId===v)?.name:k==='storeId'?catalog.stores.find(x=>x.storeId===v)?.name:null;n.review.appendChild(create('p',captions[k]+'：'+(k==='enabled'?(v?'有効':'停止'):label?label+'（'+v+'）':v)));}
    n.status.textContent='対象と変更内容を確認してから保存してください。';finish();return;
   }
   if(r.phase==='COMMIT'&&['OPERATIONS_SAVED','OPERATIONS_ALREADY_SAVED'].includes(d.code)&&exact(data,['savedRevision'])&&Number.isSafeInteger(data.savedRevision)&&data.savedRevision>0){clearDraft();finish();n.status.textContent='保存しました。最新情報を読み直します。';clearCatalog();send('READ');return;}
   if(['OPERATIONS_READY','OPERATIONS_PREVIEW_READY','OPERATIONS_SAVED','OPERATIONS_ALREADY_SAVED'].includes(d.code))return;
   if(r.phase==='COMMIT'&&['OPERATIONS_RESULT_UNKNOWN','OPERATIONS_REVIEW_REQUIRED','OPERATIONS_UNAVAILABLE'].includes(d.code)){uncertain=true;reviewed=false;n.status.textContent='保存結果の確認が必要です。同じ操作で確認してください。';finish();return;}
   if(r.phase==='COMMIT'&&['OPERATIONS_BUSY','OPERATIONS_NOT_CONFIGURED'].includes(d.code)){uncertain=true;reviewed=false;}else clearDraft();
   if(['OPERATIONS_AUTH_REQUIRED','OPERATIONS_ACCESS_DENIED'].includes(d.code)){clearCatalog();if(d.code==='OPERATIONS_AUTH_REQUIRED')loginRequired=true;}
   n.status.textContent=errors[d.code]||'処理を継続できません。情報を読み直してください。';finish();
  });
  g.addEventListener('pagehide',()=>{stopped=true;clearCatalog();clearDraft();for(const k of ['reason','account','name','organization-new','store-new'])n[k].value='';finish();n.status.textContent='運営情報を消去しました。';});
  controls();if(!loginRequired)send('READ');else n.status.textContent='LINEログインが必要です。';
 }
 async function bootstrap(){const script=document.currentScript,view=script?.dataset.view;try{if(!['PLATFORM','COMPANY'].includes(view))return;await g.liff.init({liffId:config.liffId});init({view,liff:g.liff,loginRequired:!g.liff.isLoggedIn()});}catch(_e){document.getElementById('ops-status').textContent='LINEログインを準備できません。画面を開き直してください。';}}
 g.TlhOperations=Object.freeze({init,parseCatalog,verify,labels,config});
 if(document.currentScript?.dataset.bootstrap==='true')bootstrap();
})(window);
