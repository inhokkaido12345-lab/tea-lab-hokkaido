/**
 * 現役・対象店舗の目印/本人の店舗選択/会社文脈を付けた通信。本人IDは共通、権限はGASで判断。
 * 流れ：LIFF本人→署名付き店舗一覧→選択→既存formへ会社/店舗→既存MAC＋会社MACを照合。
 * 削除影響：会社設定後の通信/店舗表示が停止。現役controllerの認可/原簿を代替しない。
 * 一般化：tenant context / authenticated bootstrap / page-scoped state。URLは選択、権限ではない。
 * 魔改造：bannerのID/DTO/GAS CompanyStoreAdapter/全controllerの送受信・テストを同期。
 * 境界：token/名簿/応答鍵をStorage・URL・ログへ保存しない。店舗名だけを見て許可しない。
 * 検証：tenant-session.test.mjs→全UI/連結→LINE/PWA実機。保存中/結果不明の店舗切替は禁止。
 */
(function(global){'use strict';
  const GAS='https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec';
  const ACTION='bridgeGetCompanyContext';
  const requests=new Map(),eventChecks=new WeakMap();
  let state='IDLE',current=null,choices=[],bootstrap=null,started=null,n=null,stopped=false;
  function id(v){return typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);}
  function random(bytes){return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
  function originAllowed(origin){return origin==='null'||origin==='https://script.google.com'||origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin);}
  function related(source,target){try{return source===target||source?.parent===target||source?.parent?.parent===target;}catch(_e){return false;}}
  async function mac(text,signature,key){
    if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))return false;
    const enc=new TextEncoder(),imported=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',imported,Uint8Array.from(signature.match(/../g),s=>parseInt(s,16)),enc.encode(text));
  }
  function parse(text){
    let v;try{v=JSON.parse(text);}catch(_e){return null;}
    if(!v||!['mode,version,workplaces','invitationTarget,mode,version,workplaces'].includes(Object.keys(v).sort().join(','))||v.version!==2||!['LEGACY','CONFIGURED'].includes(v.mode)||!Array.isArray(v.workplaces)||v.workplaces.length>20)return null;
    const seen=new Set();for(const w of [...v.workplaces,...(v.invitationTarget?[v.invitationTarget]:[])]){
      if(!w||Object.keys(w).sort().join(',')!=='bindingId,canAdmin,canEmployee,organizationId,organizationName,workplaceId,workplaceName'||!id(w.organizationId)||!id(w.workplaceId)||!id(w.bindingId)||seen.has(w.workplaceId)||
        !['organizationName','workplaceName'].every(k=>typeof w[k]==='string'&&w[k].trim()&&w[k].length<=100&&!/[\x00-\x1f\x7f]/.test(w[k]))||
        typeof w.canAdmin!=='boolean'||typeof w.canEmployee!=='boolean'||(w===v.invitationTarget?w.canAdmin||w.canEmployee:!w.canAdmin&&!w.canEmployee))return null;
      seen.add(w.workplaceId);
    }
    if(Object.hasOwn(v,'invitationTarget')&&(!v.invitationTarget||v.mode!=='CONFIGURED'))return null;
    if(v.mode==='LEGACY'&&v.workplaces.length)return null;
    return v;
  }
  function busyWrite(){return [...requests.values()].some(r=>r.write);}
  function paint(){
    if(!n)return;
    n.switch.disabled=stopped||!['SCOPED','CHOOSING','INVITATION'].includes(state)||busyWrite()||!n.select.value||current?.workplaceId===n.select.value;
    n.banner.setAttribute('aria-busy',state==='LOADING'?'true':'false');
  }
  function loginRedirectUri(){
    const source=new URL(global.location.href||global.location.origin+(global.location.pathname||'/workforce/')+(global.location.search||''));
    const target=new URL(global.location.pathname||'/workforce/',global.location.origin),org=source.searchParams.get('organizationId'),site=source.searchParams.get('workplaceId');
    // 店舗識別子だけを帰還先へ保つ。権限は帰還後に再検査。token/hash/任意queryはコピーしない。
    if(id(org)&&id(site)){target.searchParams.set('organizationId',org);target.searchParams.set('workplaceId',site);}return target.toString();
  }
  function scopeLinks(){
    const pages=['','index.html','account-info.html','admin-day-change.html','admin-schedule.html','admin-timecard-records.html','day-change.html','recovery.html','schedule.html','timecard-records.html','workplace-admins.html'];
    for(const link of document.querySelectorAll('a[href]')){
      const href=link.getAttribute('href');if(!href||href.startsWith('#'))continue;
      const target=new URL(href,global.location.origin+(global.location.pathname||'/workforce/'));
      if(target.origin!==global.location.origin||!target.pathname.startsWith('/workforce/')||!pages.includes(target.pathname.slice('/workforce/'.length)))continue;
      target.searchParams.set('organizationId',current.organizationId);target.searchParams.set('workplaceId',current.workplaceId);link.setAttribute('href',target.pathname+target.search+target.hash);
    }
  }
  function currentRootUrl(){const url=new URL('/workforce/',global.location.origin);url.searchParams.set('organizationId',current.organizationId);url.searchParams.set('workplaceId',current.workplaceId);return url.toString();}
  function mount(){
    n=Object.fromEntries(['banner','name','company','status','select','switch','frame'].map(k=>[k,document.getElementById('workplace-'+k)]));
    if(Object.values(n).some(v=>!v))throw Error('WORKPLACE_UI_MISSING');
    n.select.addEventListener('change',paint);
    n.switch.addEventListener('click',()=>{
      if(n.switch.disabled||busyWrite()||stopped)return;
      const next=choices.find(w=>w.workplaceId===n.select.value);if(!next)return;
      state='LEAVING';current=null;paint();n.status.textContent='店舗を切り替えています。';
      const url=new URL('/workforce/',global.location.origin);url.searchParams.set('organizationId',next.organizationId);url.searchParams.set('workplaceId',next.workplaceId);
      // 再起動で全controllerのdraft/名簿/出力を捨て、遷移先で所属/権限を再確認する。
      try{global.location.assign(url.toString());}catch(_e){state='FAILED';n.status.textContent='切替画面を開けません。画面を開き直してください。';paint();}
    });
  }
  function install(value){
    if(stopped)return false;
    if(value.mode==='LEGACY'){
      state='LEGACY';n.name.textContent='店舗情報の設定前';n.company.textContent='';n.status.textContent='店舗別の表示・切替は設定準備中です。';paint();return true;
    }
    choices=value.workplaces.map(w=>Object.freeze({...w}));
    n.select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='利用する店舗を選んでください';n.select.appendChild(placeholder);
    for(const w of choices){const option=document.createElement('option');option.value=w.workplaceId;option.textContent=w.workplaceName+' ／ '+w.organizationName+(w.canAdmin?'（管理者）':'');n.select.appendChild(option);}
    const url=new URL(global.location.href||global.location.origin+(global.location.pathname||'/workforce/')+(global.location.search||''));
    const org=url.searchParams.get('organizationId'),site=url.searchParams.get('workplaceId');
    current=org||site?choices.find(w=>w.organizationId===org&&w.workplaceId===site):choices.length===1?choices[0]:null;
    if(!current&&value.invitationTarget?.organizationId===org&&value.invitationTarget?.workplaceId===site){
      current=Object.freeze({...value.invitationTarget});state='INVITATION';n.name.textContent=current.workplaceName+'（招待先）';n.company.textContent=current.organizationName;
      n.status.textContent='従業員登録前です。管理者から個別に受け取った招待コードで登録してください。';paint();
      return ['/workforce/','/workforce/index.html'].includes(global.location.pathname||'/workforce/');
    }
    if((org||site)&&!current){state='DENIED';n.name.textContent='この店舗は利用できません';n.status.textContent='許可された店舗を選び直してください。';state='CHOOSING';paint();return false;}
    if(!current){state='CHOOSING';n.name.textContent=choices.length?'店舗を選んでください':'利用できる店舗がありません';n.company.textContent='';n.status.textContent=choices.length?'下の一覧から利用する店舗を選んでください。':'初めて登録する場合は管理者から受け取った招待先URLから開いてください。';paint();return false;}
    state='SCOPED';n.name.textContent=current.workplaceName;n.company.textContent=current.organizationName;n.select.value=current.workplaceId;
    n.status.textContent=current.canAdmin?'この店舗の管理者として利用できます。':'この店舗の従業員として利用できます。';
    const entry=document.getElementById('workplace-admin-entry');if(entry)entry.hidden=!current.canAdmin;
    const invite=document.getElementById('workplace-invitation-link');if(invite){invite.hidden=!current.canAdmin;invite.setAttribute('href',currentRootUrl());}
    const stop=document.getElementById('maintenance-stop');if(stop)stop.hidden=true;
    for(const id of ['maintenance-company-note','maintenance-workplace-stop']){const el=document.getElementById(id);if(el)el.hidden=!current.canAdmin;}
    document.title=current.workplaceName+' | TLH 勤怠管理';paint();return true;
  }
  /** 本人確認後に一度だけ店舗を取得する。未ログイン時に呼ばない。自動再送はしない。 */
  function ready(liff){
    if(started)return started;
    started=new Promise((resolve,reject)=>{
      try{
        mount();if(stopped||global!==global.top||!crypto.subtle)throw Error('WORKPLACE_UNAVAILABLE');
        const token=liff&&liff.getIDToken();if(typeof token!=='string'||!token)throw Error('WORKPLACE_IDENTITY_REQUIRED');
        state='LOADING';n.status.textContent='利用できる店舗を確認しています。';paint();
        const r={nonce:random(16),responseKey:random(32),resolve,reject};bootstrap=r;
        r.timer=setTimeout(()=>{if(bootstrap!==r)return;bootstrap=null;state='FAILED';n.status.textContent='店舗を確認できません。画面を開き直してください。';paint();reject(Error('WORKPLACE_TIMEOUT'));},30000);
        const form=document.createElement('form');form.method='POST';form.action=GAS;form.target='tlhCompanyContextFrame';form.hidden=true;
        const fields={action:ACTION,idToken:token,nonce:r.nonce,responseKey:r.responseKey};
        const selection=new URL(loginRedirectUri());if(selection.searchParams.has('organizationId')){fields.organizationId=selection.searchParams.get('organizationId');fields.workplaceId=selection.searchParams.get('workplaceId');}
        for(const [name,value]of Object.entries(fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}
        document.body.appendChild(form);try{form.submit();}finally{form.remove();}
      }catch(error){if(bootstrap)clearTimeout(bootstrap.timer);bootstrap=null;state='FAILED';if(n)n.status.textContent='店舗を確認できません。画面を開き直してください。';paint();reject(error);}
    });return started;
  }
  global.addEventListener('message',async event=>{
    const r=bootstrap,d=event.data;if(!r||!d||d.type!=='TLH_BRIDGE_COMPANY_CONTEXT'||d.action!==ACTION||d.nonce!==r.nonce||!originAllowed(event.origin)||!related(event.source,n.frame.contentWindow))return;
    try{
      if(!await mac([d.type,d.nonce,d.action,d.code,d.context].join('\n'),d.mac,r.responseKey)||bootstrap!==r||stopped)return;
      const value=parse(d.context);if(!value||!(d.code==='COMPANY_CONTEXT_READY'&&value.mode==='CONFIGURED'||d.code==='COMPANY_CONTEXT_LEGACY'&&value.mode==='LEGACY'))throw Error('WORKPLACE_RESPONSE_INVALID');
      bootstrap=null;clearTimeout(r.timer);const installed=install(value);if(installed&&state==='SCOPED')scopeLinks();r.resolve(installed);
    }catch(_e){if(bootstrap!==r)return;bootstrap=null;clearTimeout(r.timer);state='FAILED';n.status.textContent='店舗情報を確認できません。画面を開き直してください。';paint();r.reject(Error('WORKPLACE_RESPONSE_INVALID'));}
  });
  function isWrite(p){return p.action==='bridgeScheduleV1'?p.command!=='read':['bridgeAttendanceDayChange','bridgeAttendanceDayChangeV2','bridgeWorkplaceRoleV1'].includes(p.action)?p.command==='commit':
    ['bridgeRecordPunch','bridgeIssueStaffInvitation','bridgeRevokeStaffInvitation','bridgeClaimStaffInvitation','bridgeCorrectStaffDetails','bridgeStopStaffAccess','bridgeRecoverySubmit','bridgeRecoveryApprove'].includes(p.action);}
  /** 既存formへ文脈2項目だけを加える。tokenを保持/複製せず、保存の自動再送もしない。 */
  function submit(form){
    if(state==='LEGACY'&&!stopped){form.submit();return;}
    if(!['SCOPED','INVITATION'].includes(state)||!current||stopped)throw Error('WORKPLACE_NOT_READY');
    const inputs=Array.from(form.children),p=Object.fromEntries(inputs.filter(x=>['action','command','nonce','responseKey','organizationId','workplaceId','operationId','eventId','groupId','employeeCode'].includes(x.name)).map(x=>[x.name,x.value]));
    if(state==='INVITATION'&&p.action!=='bridgeClaimStaffInvitation')throw Error('WORKPLACE_INVITATION_ONLY');
    if('organizationId'in p||'workplaceId'in p||!p.action||!/^[a-f0-9]{32}$/.test(p.nonce||'')||!/^[a-f0-9]{64}$/.test(p.responseKey||'')||requests.has(p.nonce))throw Error('WORKPLACE_REQUEST_INVALID');
    const frames=Array.from(document.getElementsByName(form.target)).filter(el=>el.contentWindow);
    if(frames.length!==1)throw Error('WORKPLACE_FRAME_MISSING');
    for(const [name,value]of Object.entries({organizationId:current.organizationId,workplaceId:current.workplaceId})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}
    const r={action:p.action,key:p.responseKey,frame:frames[0],write:isWrite(p),group:p.action+':'+(p.operationId||p.eventId||p.groupId||p.employeeCode||'')};requests.set(p.nonce,r);
    r.timer=setTimeout(()=>{if(requests.get(p.nonce)!==r)return;if(r.write){r.uncertain=true;n.status.textContent='保存結果を確認できません。店舗を切り替えず、この店舗で状態を確認してください。';}else requests.delete(p.nonce);paint();},30000);paint();
    try{form.submit();}catch(error){if(!r.write){requests.delete(p.nonce);clearTimeout(r.timer);}else r.uncertain=true;paint();throw error;}
  }
  /** 各controllerの既存origin/frame/nonce/業務MAC検査へ進む前に、店舗文脈を照合する。 */
  function acceptEvent(event){
    if(state==='LEGACY'&&!stopped)return Promise.resolve(!event.data?.organizationId&&!event.data?.tenantMac);
    if(eventChecks.has(event))return eventChecks.get(event);
    const check=(async()=>{
      const d=event.data,r=d&&requests.get(d.nonce),scope=current;
      if(!['SCOPED','INVITATION'].includes(state)||!scope||stopped||!r||d.action!==r.action||!originAllowed(event.origin)||!related(event.source,r.frame.contentWindow)||
        d.organizationId!==scope.organizationId||d.workplaceId!==scope.workplaceId||d.bindingId!==scope.bindingId)return false;
      if(!await mac(JSON.stringify(['TLH_TENANT_REPLY_V1',d.organizationId,d.workplaceId,d.bindingId,d.mac]),d.tenantMac,r.key)||current!==scope||stopped)return false;
      clearTimeout(r.timer);
      if(r.write&&/(?:UNAVAILABLE|REVIEW_REQUIRED|UNKNOWN)/.test(d.code||'')){r.uncertain=true;n.status.textContent='保存結果の確認が必要です。現在の店舗で確認してください。';}
      else{requests.delete(d.nonce);if(r.write&&r.group!==r.action+':')for(const [nonce,older]of requests)if(older.group===r.group){clearTimeout(older.timer);requests.delete(nonce);}}paint();return true;
    })();eventChecks.set(event,check);return check;
  }
  global.addEventListener('pagehide',()=>{stopped=true;state='CLOSED';current=null;choices=[];if(bootstrap){clearTimeout(bootstrap.timer);bootstrap.reject(Error('WORKPLACE_CLOSED'));bootstrap=null;}for(const r of requests.values())clearTimeout(r.timer);requests.clear();if(n){n.name.textContent='店舗は未確認です';n.company.textContent='';n.select.replaceChildren();}paint();});
  global.TlhTenantSession=Object.freeze({ready,submit,acceptEvent,parse,loginRedirectUri,
    invitationOnly(){return state==='INVITATION';},
    enrollmentCompleted(){if(state!=='INVITATION'||stopped)return;const link=document.getElementById('workplace-enrollment-open');if(link){link.hidden=false;link.setAttribute('href',loginRedirectUri());}n.status.textContent='登録結果を確認しました。「登録した店舗を開く」で所属と権限を読み直してください。';},
    displayScope(){return state==='SCOPED'&&current?Object.freeze({organizationName:current.organizationName,workplaceName:current.workplaceName}):null;}});
})(window);
