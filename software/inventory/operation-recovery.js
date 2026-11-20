/** Minimal non-secret receipt for uncertain COMMAND only. Never persists payload/token/result.
 * Receipt is untrusted input, not authority. STATUS rechecks actor + store + ledger ownership.
 * Expiry means review is due, never NOT_SAVED. TENANT is deliberately not covered.
 */
(function(g){'use strict';
 const KEY='tlh.inventory.command-receipt.v1',LOCK='tlh.inventory.command-receipt',DAY=86400000;
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
 const valid=r=>r&&Object.keys(r).sort().join(',')==='createdAt,expectedActorId,expiresAt,operationId,storeId,version'&&r.version===1&&[r.operationId,r.storeId,r.expectedActorId].every(id)&&Number.isSafeInteger(r.createdAt)&&Number.isSafeInteger(r.expiresAt)&&r.createdAt>0&&r.expiresAt===r.createdAt+7*DAY;

 function create(send,getSession){
  let actor=null,identitySession=null,stopped=false,busy=false,lastNote='';
  const currentActor=()=>{if(!identitySession||getSession()!==identitySession){actor=null;identitySession=null;}return actor;};
  const host=()=>document.getElementById('operation-recovery');
  const read=()=>{const raw=g.localStorage.getItem(KEY);if(raw===null)return null;let r;try{r=JSON.parse(raw);}catch{throw Error('RECOVERY_RECEIPT_INVALID');}if(!valid(r))throw Error('RECOVERY_RECEIPT_INVALID');return r;};
  const put=r=>{g.localStorage.setItem(KEY,JSON.stringify(r));if(g.localStorage.getItem(KEY)!==JSON.stringify(r))throw Error('RECOVERY_STORAGE_UNAVAILABLE');};
  const remove=r=>{const current=read();if(current&&JSON.stringify(current)===JSON.stringify(r))g.localStorage.removeItem(KEY);};
  const result=code=>({ok:false,code});
  function render(note=lastNote){
   lastNote=note;
   const h=host();if(!h)return;h.replaceChildren();if(stopped)return;let r;try{r=read();}catch{note='復旧情報を安全に読めないため、保存を停止しています。ログイン・読取はできます。';}
   const p=document.createElement('p');
   if(note){p.textContent=note;h.appendChild(p);}
   if(!r)return;
   const info=document.createElement('p');
   if(!currentActor()||actor!==r.expectedActorId){info.textContent='未確認の保存があります。保存した本人のLINEでログインしてください。別の本人の情報は表示しません。';h.appendChild(info);return;}
   info.textContent='未確認の保存：店舗 '+r.storeId+' ／操作 '+r.operationId+'。この復旧は在庫の保存操作だけが対象です。所属・店舗操作は対象外です。'+(Date.now()>r.expiresAt?'。確認期限を過ぎていますが、未保存とは限りません。':'。新しく同じ操作をしないでください。');h.appendChild(info);
   const button=document.createElement('button');button.type='button';button.dataset.recovery='command-status';button.textContent='保存済みか確認する（再送しない）';button.disabled=busy||stopped;button.onclick=()=>{if(!g.TlhInventoryView?.confirmPending?.())return check();};h.appendChild(button);
  }
  async function exclusive(fn){
   if(stopped)return result('PAGE_CLOSED');
   if(!g.navigator?.locks?.request){render('このブラウザでは保存の重複を防止できないため、保存を停止しています。対応ブラウザで開いてください。ログイン・読取はできます。');return result('RECOVERY_LOCK_UNAVAILABLE');}
   try{return await g.navigator.locks.request(LOCK,{mode:'exclusive'},fn);}catch{render('復旧処理を確認できません。保存済みか未確認です。新しい操作をせず結果を確認してください。');return result('RECOVERY_UNKNOWN');}
  }
  async function status(r){
   const identity=await send('ACCOUNT',{});if(stopped)return result('PAGE_CLOSED');if(!identity.ok)return result('RECOVERY_UNKNOWN');
   actor=identity.value.actorAccountId;identitySession=getSession();
   if(!id(actor)||actor!==r.expectedActorId){render();return result('RECOVERY_ACTOR_MISMATCH');}
   const input={version:1,operationId:r.operationId,storeId:r.storeId,expectedActorId:r.expectedActorId};
   const reply=await send('STATUS',input,identitySession),v=reply.value;if(stopped)return result('PAGE_CLOSED');
   if(!reply.ok||!v||Object.keys(v).sort().join(',')!=='canCreateReplacement,expectedActorId,operationId,status,storeId,version'||Object.entries(input).some(([k,value])=>v[k]!==value)||v.canCreateReplacement!==false||!['SAVED','UNKNOWN'].includes(v.status)){render('保存結果を確認できません。操作は再送していません。');return result('RECOVERY_UNKNOWN');}
   if(v.status==='UNKNOWN'){render('保存済みか確定できません。未保存ではありません。新しい操作をせず、管理者に確認してください。');return result('RECOVERY_UNKNOWN');}
   remove(r);g.TlhInventoryView?.recoveryResolved?.();g.TlhInventoryView?.invalidate?.();render('保存済みを確認しました。再送せず「最新の記録を読む」で内容を確認してください。');return {...result('RECOVERY_SAVED'),recovered:{operationId:r.operationId,storeId:r.storeId}};
  }
  async function check(){return exclusive(async()=>{busy=true;try{const r=read();return r?await status(r):result('RECOVERY_NOT_PENDING');}catch{render('保存結果を確認できません。再送せず、もう一度確認してください。');return result('RECOVERY_UNKNOWN');}finally{busy=false;render();}});}
  function blockedIntent(){render('未確認の保存があるため、今回の入力は送信していません。先に保存済みか確認してください。');return result('RECOVERY_NEW_ACTION_REQUIRED');}
  async function execute(input){
   // Capture admission before waiting for Web Locks; a receipt disappearing while queued is not permission to save.
   if(stopped)return result('PAGE_CLOSED');
   try{if(busy||read())return blockedIntent();}catch{render();return result('RECOVERY_STORAGE_UNAVAILABLE');}
   return exclusive(async()=>{
   let r;try{r=read();}catch{render();return result('RECOVERY_STORAGE_UNAVAILABLE');}
   if(r)return blockedIntent();
   actor=currentActor();
   if(!id(actor)||!id(input.operationId)||!id(input.storeId)){render('保存先の本人確認用APIが未接続です。保存は送信していません。管理者に配布版を確認してください。ログイン・読取はできます。');return result('RECOVERY_IDENTITY_UNAVAILABLE');}
   const now=Date.now();r={version:1,operationId:input.operationId,storeId:input.storeId,expectedActorId:actor,createdAt:now,expiresAt:now+7*DAY};
   try{put(r);}catch{render('復旧情報を保存できないため、操作を送信していません。');return result('RECOVERY_STORAGE_UNAVAILABLE');}
   try{const reply=await send('COMMAND',input,identitySession);if(stopped)return result('PAGE_CLOSED');const proof=reply.rejection,rejected=!reply.ok&&proof&&Object.keys(proof).sort().join(',')==='expectedActorId,operationId,status,storeId,version'&&proof.version===1&&proof.operationId===r.operationId&&proof.storeId===r.storeId&&proof.expectedActorId===r.expectedActorId&&proof.status==='REJECTED_BEFORE_WRITE';if(reply.ok&&reply.value?.operationId===input.operationId||rejected){remove(r);render('');return reply;}render('保存結果が未確認です。再送せず結果を確認してください。');return result('RECOVERY_UNKNOWN');}
   catch{render('保存結果が未確認です。再送せず結果を確認してください。');return result('RECOVERY_UNKNOWN');}
  });}
  g.addEventListener('storage',e=>{if(e.key===KEY)render();});
  g.addEventListener('pagehide',()=>{stopped=true;actor=null;identitySession=null;host()?.replaceChildren();});render();
  return Object.freeze({execute,check,hasPendingReceipt:()=>{try{return busy||Boolean(read());}catch{return true;}},observeAccount:value=>{actor=id(value)?value:null;identitySession=actor?getSession():null;render();}});
 }
 g.TlhInventoryOperationRecovery=Object.freeze({create});
})(window);
