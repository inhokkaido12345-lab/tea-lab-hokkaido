/**
 * 現役・店舗の管理者/打刻権限をpreview→本人確認→commitで設定する画面。
 * 流れ：tenant-session→店舗管理者gate→番号（氏名）一覧→署名付き確認→同じ操作IDで保存。
 * 削除影響：店舗権限の設定画面だけ停止。原簿/本人ID/会社雇用は削除しない。
 * 一般化：two-phase UI / immutable command / optimistic concurrency。画面gateはGAS認可の代用ではない。
 * 魔改造：操作/DTO/メッセージはWorkplaceRoleService・API契約・再送/最後の管理者試験を同期。
 * 境界：token/鍵/氏名をURL・Storage・consoleへ出さない。店舗を跨いで確認済みdraftを再利用しない。
 * 検証：workplace-roles.test.mjsとGAS連結。実環境の権限付与は所有者の明示操作で行う。
 */
(function(global){'use strict';
  const ACTION='bridgeWorkplaceRoleV1',TYPE='TLH_BRIDGE_WORKPLACE_ROLE';
  const GAS='https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec';
  const messages={WORKPLACE_ROLE_READY:'変更する内容を確認してください。',WORKPLACE_ROLE_APPLIED:'この店舗の権限を変更しました。',WORKPLACE_ROLE_ALREADY_APPLIED:'同じ変更は反映済みです。',
    WORKPLACE_ROLE_NO_CHANGE:'権限は指定された状態になっています。',WORKPLACE_LAST_ADMIN_PROTECTED:'最後の管理者は解除できません。先に別の管理者を設定してください。',
    WORKPLACE_ROLE_STATE_CHANGED:'確認後に状態が変わりました。対象を確認し直してください。',WORKPLACE_ROLE_ADMIN_REQUIRED:'この店舗の管理者権限が必要です。',
    WORKPLACE_ROLE_TARGET_REQUIRED:'この店舗に登録された従業員を選んでください。',WORKPLACE_ROLE_EMPLOYEE_REQUIRED:'先にこの店舗の打刻権限を有効にしてください。',
    WORKPLACE_ROLES_NOT_CONFIGURED:'店舗別の権限設定は準備中です。',WORKPLACE_ROLE_OPERATION_CONFLICT:'操作の情報が一致しません。新しい操作で確認してください。',
    WORKPLACE_ROLE_INVALID:'対象・権限・理由を確認してください。',WORKPLACE_ROLE_REVIEW_REQUIRED:'権限情報の確認が必要です。操作を繰り返さず管理者に確認してください。',
    LINE_VERIFY_REJECTED:'LINE本人確認をやり直してください。',WORKPLACE_ROLE_UNAVAILABLE:'応答を確認できません。同じ操作で状態を確認してください。',WRITE_UNAVAILABLE:'変更を保存できませんでした。同じ操作で再確認してください。',
    WRITE_REVIEW_REQUIRED:'保存状態の確認が必要です。操作を繰り返さないでください。',ENROLLMENT_BUSY:'別の処理が進行中です。少し待って確認してください。'};
  function random(n){return Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');}
  function related(source,target){try{return source===target||source?.parent===target||source?.parent?.parent===target;}catch(_e){return false;}}
  async function verify(d,r){
    if(!d||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||d.command!==r.command||d.operationId!==r.operationId||!Object.hasOwn(messages,d.code)||
      !['type','nonce','action','command','operationId','code','revision','summary','mac'].every(k=>typeof d[k]==='string')||!/^[a-f0-9]{64}$/.test(d.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),s=>parseInt(s,16)),enc.encode([d.type,d.nonce,d.action,d.command,d.operationId,d.code,d.revision,d.summary].join('\n')));
  }
  function parse(text,fields){let d;try{d=JSON.parse(text);}catch(_e){return null;}
    const scope=global.TlhTenantSession?.displayScope();
    if(!d||d.version!==1||d.employeeCode!==fields.employeeCode||d.role!==fields.role||d.enabled!==(fields.enabled==='true')||
      !['employeeName','organizationName','workplaceName'].every(k=>typeof d[k]==='string'&&d[k].trim()&&d[k].length<=100&&!/[\x00-\x1f\x7f]/.test(d[k]))||
      scope&&(scope.organizationName!==d.organizationName||scope.workplaceName!==d.workplaceName))return null;return d;
  }
  function init(options){
    const n=Object.fromEntries(['fields','employee','kind','enabled','reason','preview','commit','cancel','status','summary','frame'].map(k=>[k,document.getElementById('role-'+k)]));
    let allowed=false,pending=null,review=null,uncertain=false,stopped=false;
    function controls(){n.fields.disabled=!allowed||!!pending||!!review||stopped;n.preview.disabled=n.fields.disabled;
      n.commit.hidden=!review;n.commit.disabled=!allowed||!!pending||stopped;n.cancel.disabled=!review||!!pending||uncertain||stopped;n.commit.textContent=uncertain?'同じ操作を再確認':'確認した店舗の権限を変更する';}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function clear(){review=null;uncertain=false;n.summary.textContent='';controls();}
    async function send(command,fields,operationId,revision){
      if(!allowed||pending||stopped)return;
      const token=options.liff.getIDToken();if(typeof token!=='string'||!token){n.status.textContent='LINE本人確認が必要です。画面を開き直してください。';return;}
      const r={command,fields:Object.freeze({...fields}),operationId,nonce:random(16),responseKey:random(32)};pending=r;controls();n.status.textContent='処理中です。';
      r.timer=setTimeout(()=>{if(pending!==r)return;uncertain=command==='commit';n.status.textContent=uncertain?'保存結果を確認できません。同じ操作で確認してください。':'応答を確認できません。対象を確認し直してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhWorkplaceRoleFrame';form.hidden=true;
      for(const [name,value]of Object.entries({...fields,action:ACTION,command,operationId,revision,nonce:r.nonce,responseKey:r.responseKey,idToken:token})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}
      document.body.appendChild(form);try{if(global.TlhTenantSession)global.TlhTenantSession.submit(form);else if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){uncertain=command==='commit';n.status.textContent='送信結果を確認できません。同じ操作で確認してください。';finish();}finally{form.remove();}
    }
    function invoke(command,fields,operationId,revision){send(command,fields,operationId,revision).catch(()=>{uncertain=command==='commit';n.status.textContent='通信を開始できません。同じ店舗で状態を確認してください。';finish();});}
    n.preview.addEventListener('click',()=>{
      if(!allowed||pending||review||stopped)return;
      const fields={employeeCode:n.employee.value,role:n.kind.value,enabled:n.enabled.value,reason:n.reason.value};
      if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(fields.employeeCode)||!['ADMIN','EMPLOYEE'].includes(fields.role)||!['true','false'].includes(fields.enabled)||!fields.reason.trim()||fields.reason.length>200){n.status.textContent='対象・権限・理由を入力してください。';return;}
      invoke('preview',fields,random(16),'');
    });
    n.commit.addEventListener('click',()=>{
      if(!allowed||pending||!review||stopped)return;
      const d=review.summary;if(!global.confirm(d.organizationName+' ／ '+d.workplaceName+'\n'+d.employeeCode+'（'+d.employeeName+'）\n'+(d.role==='ADMIN'?'店舗管理者':'この店舗の打刻')+'権限を'+(d.enabled?'有効':'停止')+'にします。続けますか？'))return;
      invoke('commit',review.fields,review.operationId,review.revision);
    });
    n.cancel.addEventListener('click',()=>{if(!pending&&!uncertain)clear();});
    global.addEventListener('message',async event=>{
      const r=pending;if(!r||stopped||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      if(global.TlhTenantSession&&!await global.TlhTenantSession.acceptEvent(event))return;
      const d=event.data;try{if(!await verify(d,r)||pending!==r||stopped)return;}catch(_e){return;}
      if(d.code==='WORKPLACE_ROLE_READY'){
        const summary=parse(d.summary,r.fields);if(!summary||!/^[a-f0-9]{64}$/.test(d.revision))return;
        review=Object.freeze({fields:r.fields,operationId:r.operationId,revision:d.revision,summary});uncertain=false;
        n.summary.textContent=summary.organizationName+' ／ '+summary.workplaceName+'\n'+summary.employeeCode+'（'+summary.employeeName+'）\n'+(summary.role==='ADMIN'?'店舗管理者':'この店舗の打刻')+'権限：'+(summary.enabled?'有効にする':'停止する');
      }else if(['WORKPLACE_ROLE_APPLIED','WORKPLACE_ROLE_ALREADY_APPLIED','WORKPLACE_ROLE_NO_CHANGE'].includes(d.code)){clear();n.reason.value='';}
      else if(!['WORKPLACE_ROLE_UNAVAILABLE','WRITE_UNAVAILABLE','WRITE_REVIEW_REQUIRED'].includes(d.code))clear();
      else uncertain=r.command==='commit';
      n.status.textContent=messages[d.code];finish();
    });
    global.addEventListener('pagehide',()=>{stopped=true;clear();finish();n.reason.value='';n.employee.value='';});controls();
    return Object.freeze({setAllowed(value){allowed=value===true;if(!allowed){clear();finish();n.reason.value='';n.employee.value='';}controls();}});
  }
  global.TlhWorkplaceRoles=Object.freeze({init,verify,parse});
  if(document.currentScript?.dataset.bootstrap==='true')global.addEventListener('DOMContentLoaded',async()=>{
    const status=document.getElementById('role-status'),login=document.getElementById('role-login');
    try{await global.liff.init({liffId:'2011940133-JXUDzLnG'});login.addEventListener('click',()=>global.liff.login({redirectUri:global.TlhTenantSession.loginRedirectUri()}));
      if(!global.liff.isLoggedIn()){login.hidden=false;status.textContent='LINEログインが必要です。';return;}
      if(!await global.TlhTenantSession.ready(global.liff))return;
      if(!global.TlhTenantSession.displayScope()){status.textContent='店舗別の権限設定は準備中です。';return;}
      const ui=init({gasUrl:GAS,liff:global.liff}),reads=global.TlhAutoRead.init();let allowed=false;
      const list=global.TlhAdminOverview.init({gasUrl:GAS,liff:global.liff,select:document.getElementById('role-employee')});
      const gate=global.TlhAdminAccess.init({gasUrl:GAS,liff:global.liff,frame:document.getElementById('admin-access-frame'),status:document.getElementById('admin-access-status'),onState:value=>{allowed=value;ui.setAllowed(value);list.setAllowed(value);if(value)reads.once('overview',()=>allowed);}});gate.start();
    }catch(_e){status.textContent='店舗と権限を確認できません。開き直してください。';}
  });
})(window);
