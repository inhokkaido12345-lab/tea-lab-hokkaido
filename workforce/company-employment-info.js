/** Independent, read-only company partition: list current self memberships, then explicitly choose.
 * No automatic company selection, source IDs, employment/role synthesis or WorkTime scope switch.
 * Each navigation clears prior employee details before requesting; signed company/nonce/proof/Account
 * correlation prevents delayed company A responses from rendering under company B.
 * Caller: account-info.js on /account/ and both WorkTime self-info screens.
 * Removal disables only this independent read panel; legacy employee/punch APIs stay unchanged.
 * Concept: authenticated read model with explicit identity and company boundaries.
 * Contract edits must synchronize HTML IDs, GAS action/DTO/HMAC and focused/integration tests.
 * No tokens, company profiles or keys enter URLs, logs or persistent browser storage.
 * Verification: focused Node tests plus real GAS fixture; live LINE/browser rendering remains separate.
 */
(function(global){'use strict';
 const TYPE='TLH_COMPANY_EMPLOYMENT_V1';
 const messages={COMPANY_EMPLOYMENT_COMPANIES_READY:'確認する会社を選んでください。',COMPANY_EMPLOYMENT_READY:'選んだ会社の本人情報を確認しました。',COMPANY_EMPLOYMENT_NOT_CONFIGURED:'この会社の雇用原簿は未接続です。雇用なしとは判定しません。',COMPANY_EMPLOYMENT_REVIEW_REQUIRED:'この会社の雇用原簿を確認できません。管理者へ確認してください。',COMMON_MEMBERSHIP_REQUIRED:'この会社の有効な所属を確認できません。会社一覧を更新してください。',COMMON_SERVICE_PERMISSION_REQUIRED:'この会社の情報を確認する権限がありません。',COMMON_ACCOUNT_NOT_REGISTERED:'TLHアカウントは未登録です。',COMMON_ACCOUNT_INACTIVE:'TLHアカウントが停止中です。',COMMON_AUTH_REQUIRED:'LINE本人確認をやり直してください。',COMMON_AUTH_UNAVAILABLE:'本人確認に接続できません。',COMMON_AFFILIATION_NOT_CONFIGURED:'共通所属は未接続です。会社一覧を確認できません。',COMMON_AFFILIATION_NOT_READY:'共通所属は準備中です。会社一覧を確認できません。',COMMON_AFFILIATION_REVIEW_REQUIRED:'共通所属の確認が必要です。',COMMON_INVALID_REQUEST:'確認リクエストが無効です。'};
 const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===k.slice().sort().join(',');
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x),hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x);
 const date=x=>typeof x==='string'&&(x===''||/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x);
 function parse(text,phase){let v;try{if(typeof text!=='string'||text.length>65536)return null;v=JSON.parse(text);}catch{return null;}
  if(!v||v.version!==1||!id(v.accountId))return null;
  if(phase==='READ_COMPANIES'){if(!exact(v,['version','accountId','companies'])||!Array.isArray(v.companies)||v.companies.length>1000)return null;const seen=new Set();for(const c of v.companies){if(!exact(c,['organizationId','name'])||!id(c.organizationId)||typeof c.name!=='string'||!c.name||c.name.length>100||seen.has(c.organizationId))return null;seen.add(c.organizationId);}return v;}
  if(phase!=='READ_SELF'||!exact(v,['version','accountId','organizationId','employee'])||!id(v.organizationId))return null;const e=v.employee;
  if(e!==null&&(!exact(e,['employeeId','employeeCode','name','status','hireDate','terminationDate'])||!id(e.employeeId)||typeof e.employeeCode!=='string'||!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(e.employeeCode)||typeof e.name!=='string'||!e.name||e.name.length>80||!['ACTIVE','INVITED','INACTIVE'].includes(e.status)||!date(e.hireDate)||!date(e.terminationDate)||e.hireDate&&e.terminationDate&&e.terminationDate<e.hireDate))return null;return v;
 }
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
 function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch{}return false;}
 async function verify(d,r){if(!exact(d,['type','phase','organizationId','nonce','code','data','mac'])||d.type!==TYPE||d.phase!==r.phase||d.organizationId!==r.organizationId||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||typeof d.data!=='string'||d.data.length>65536||!hex(d.mac,64)||!['COMPANY_EMPLOYMENT_READY','COMPANY_EMPLOYMENT_COMPANIES_READY'].includes(d.code)&&d.data!=='')return false;
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),x=>parseInt(x,16)),enc.encode([TYPE,d.phase,d.organizationId,d.nonce,d.code,d.data].join('\n')));}
 function init(options){const n=Object.fromEntries(['check','company','status','result','frame'].map(k=>[k,document.getElementById('company-self-'+k)]));if(Object.values(n).some(v=>!v))return null;
  let stopped=false,pending=null,companies=[],accountId=null,expected=null,shown=null;
  const clear=()=>{shown=null;n.result.replaceChildren();};
  function stopRequest(){if(pending)clearTimeout(pending.timer);pending=null;n.status.setAttribute('aria-busy','false');}
  function resetCompanies(){companies=[];accountId=null;n.company.replaceChildren();const option=document.createElement('option');option.value='';option.textContent='会社を選択';n.company.appendChild(option);n.company.value='';n.company.disabled=true;}
  function setAccount(id){expected=id;if(accountId&&id!==accountId||shown&&id!==shown){stopRequest();clear();resetCompanies();n.status.textContent='本人情報が一致しません。LINE本人確認をやり直してください。';}}
  function send(phase,organizationId){if(stopped||global!==global.top||!crypto.subtle)return;stopRequest();clear();let proof;try{proof=options.liff.getIDToken();}catch{}if(!proof){resetCompanies();n.status.textContent=messages.COMMON_AUTH_REQUIRED;return;}
   const r={phase,organizationId,nonce:random(16),responseKey:random(32),proof};pending=r;n.status.setAttribute('aria-busy','true');n.status.textContent='選択した本人情報を確認しています…';
   r.timer=setTimeout(()=>{if(pending!==r)return;stopRequest();clear();n.status.textContent='応答を確認できません。雇用なしとは判定しません。';},30000);
   const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhCompanyEmploymentFrame';form.hidden=true;
   for(const [name,value]of Object.entries({action:'bridgeCompanyEmploymentV1',phase,organizationId,idToken:proof,nonce:r.nonce,responseKey:r.responseKey})){const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);}document.body.appendChild(form);try{form.submit();}catch{stopRequest();n.status.textContent='通信を開始できませんでした。';}finally{form.remove();}
  }
  function load(){if(stopped)return;stopRequest();clear();resetCompanies();send('READ_COMPANIES','');}
  n.check.addEventListener('click',load);
  n.company.addEventListener('change',()=>{stopRequest();clear();const org=n.company.value;if(!org){n.status.textContent='会社を選んでください。';return;}if(!companies.some(c=>c.organizationId===org)){resetCompanies();n.status.textContent='会社一覧を更新してください。';return;}send('READ_SELF',org);});
  global.addEventListener('message',async e=>{const r=pending;if(stopped||!r||!related(e.source,n.frame.contentWindow)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
   let ok=false;try{ok=await verify(e.data,r);}catch{}if(!ok||pending!==r||stopped)return;
   let proof;try{proof=options.liff.getIDToken();}catch{}if(proof!==r.proof){stopRequest();clear();resetCompanies();n.status.textContent='本人確認が変わったため表示しません。';return;}
   const d=e.data,ready=r.phase==='READ_COMPANIES'?'COMPANY_EMPLOYMENT_COMPANIES_READY':'COMPANY_EMPLOYMENT_READY';
   if(d.code===ready){const v=parse(d.data,r.phase);if(!v)return;
    if(expected&&v.accountId!==expected||r.phase==='READ_SELF'&&(v.accountId!==accountId||v.organizationId!==r.organizationId||n.company.value!==r.organizationId)){stopRequest();clear();resetCompanies();n.status.textContent='本人または会社が一致しないため表示しません。';return;}
    if(r.phase==='READ_COMPANIES'){accountId=v.accountId;companies=v.companies;for(const c of companies){const option=document.createElement('option');option.value=c.organizationId;option.textContent=c.name;n.company.appendChild(option);}n.company.disabled=companies.length===0;n.status.textContent=companies.length?messages[d.code]:'有効な会社所属はまだありません。';}
    else{clear();shown=v.accountId;const heading=document.createElement('p');heading.textContent=companies.find(c=>c.organizationId===v.organizationId).name;n.result.appendChild(heading);
     if(v.employee===null){const p=document.createElement('p');p.textContent='この会社での雇用登録はありません。会社所属や運営権限とは別の情報です。';n.result.appendChild(p);}
     else{const dl=document.createElement('dl'),e=v.employee;for(const [label,value]of [['社員番号',e.employeeCode],['氏名',e.name],['雇用登録状態',{ACTIVE:'有効',INVITED:'招待中',INACTIVE:'停止'}[e.status]],['入社日',e.hireDate||'未登録'],['退職日',e.terminationDate||'未登録']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.appendChild(dt);dl.appendChild(dd);}n.result.appendChild(dl);}n.status.textContent=messages[d.code];}
    stopRequest();return;
   }
   if(['COMPANY_EMPLOYMENT_COMPANIES_READY','COMPANY_EMPLOYMENT_READY'].includes(d.code))return;
   stopRequest();clear();n.status.textContent=messages[d.code];
  });
  global.addEventListener('pagehide',()=>{stopped=true;stopRequest();clear();resetCompanies();expected=null;n.check.disabled=true;n.status.textContent='会社別本人情報を消去しました。';});resetCompanies();return Object.freeze({load,setAccount});
 }
 global.TlhCompanyEmploymentInfo=Object.freeze({init,parse,verify});
})(window);
