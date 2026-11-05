/**
 * 現役・管理者の社員番号変更。入力→PREVIEW署名検査→画面内の明示保存→同じ操作のCOMMIT。
 * 削除で番号変更だけ停止。一般化：two-phase UI / immutable retry / signed response。
 * 初歩：operationIdは保存操作、nonceは各通信。画面の確認ボタンは権限の代用ではない。
 * 魔改造：GAS Bridge/Service・契約・両repoの検査を同期。保存前の自動click/自動再送は禁止。
 * 境界：LINE token/氏名/番号をStorage/URL/consoleへ残さず、frame/origin/nonce/MACを全て確認。
 * 検証：staff-code-change.test.mjsと実GAS連結。通信中の連打・退場・遅延返信で再保存しない。
 */
(function(g){'use strict';
 const TYPE='TLH_BRIDGE_STAFF_CODE_CHANGE',ACTION='bridgeStaffCodeChange';
 const config=Object.freeze({liffId:'2011940133-JXUDzLnG',gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec'});
 const messages={STAFF_CODE_CHANGE_READY:'変更内容を確認しました。表示を確認して保存してください。',STAFF_CODE_CHANGED:'社員番号を変更しました。打刻・訂正・シフトの記録は保持しています。',STAFF_OPERATION_ALREADY_DONE:'この変更は保存済みです。追加の変更はしていません。',STAFF_NO_CHANGE:'番号は同じです。変更していません。',STAFF_CODE_ALREADY_USED:'変更後の番号は別の従業員が使用中です。',STAFF_TARGET_NOT_FOUND:'現在の番号が見つかりません。名簿を確認してください。',STAFF_TARGET_CHANGED:'確認後に対象が変わりました。入力をやり直してください。',STAFF_TARGET_INACTIVE:'停止済みのため変更できません。',EMPLOYEE_DETAILS_MISMATCH:'現在の氏名・入社日が一致しません。',INVALID_EMPLOYEE_INPUT:'社員番号・氏名・入社日を確認してください。',TLH_ADMIN_REQUIRED:'管理者権限が必要です。',LINE_VERIFY_REJECTED:'LINEログインをやり直してください。',ENROLLMENT_BUSY:'別の処理中です。同じ操作で確認してください。',WRITE_UNAVAILABLE:'変更を取り消しました。同じ操作で確認できます。',WRITE_REVIEW_REQUIRED:'保存状態の確認が必要です。再送せず管理者へお知らせください。',STAFF_CODE_CHANGE_UNAVAILABLE:'結果を確認できません。同じ操作で確認してください。',STAFF_CODE_SCOPE_UNSUPPORTED:'会社別設定の番号変更はまだ対応していません。',INVALID_REQUEST:'送信内容を確認できません。'};
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
 const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
 function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch(_e){}return false;}
 async function verify(d,r){
  // 成功返信も要求した段階に限定する。確認への返信を保存成功として表示しない。
  if(d?.code==='STAFF_CODE_CHANGED'&&r.command!=='COMMIT')return false;
  if(!exact(d,['type','nonce','action','command','code','revision','mac'])||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||d.command!==r.command||!Object.hasOwn(messages,d.code)||typeof d.revision!=='string'||(d.code==='STAFF_CODE_CHANGE_READY'?d.command!=='PREVIEW'||!/^[a-f0-9]{64}$/.test(d.revision):d.revision!=='')||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return false;
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,ACTION,d.command,d.code,d.revision].join('\n')));
 }
 function init(options){
  const n=Object.fromEntries(['form','fields','old','name','date','new','preview','review','summary','commit','reset','status','frame'].map(k=>[k,document.getElementById('code-change-'+k)]));
  let pending=null,draft=null,reviewed=false,uncertain=false,stopped=false,blocked=false;
  function controls(){n.fields.disabled=!!pending||!!draft||stopped||blocked;n.preview.disabled=!!pending||!!draft||stopped||blocked;n.commit.disabled=!!pending||!reviewed||stopped||blocked;n.reset.disabled=!!pending||uncertain||stopped||blocked;n.status.setAttribute('aria-busy',String(!!pending));}
  function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
  function send(command){
   if(pending||!draft||stopped||blocked)return;let proof;try{proof=options.liff.getIDToken();}catch(_e){}
   if(!proof||g!==g.top||!crypto.subtle){n.status.textContent='安全なLINE本人確認ができません。ログインを確認してください。';return;}
   const r={command,nonce:random(16),responseKey:random(32)};pending=r;if(command==='COMMIT')uncertain=true;controls();n.status.textContent='確認中です。';
   r.timer=setTimeout(()=>{if(pending!==r)return;if(command==='PREVIEW'){draft=null;reviewed=false;}n.status.textContent=command==='COMMIT'?'結果を確認できません。入力を変えず同じ保存ボタンで確認してください。':'応答がありません。確認し直してください。';finish();},30000);
   const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhStaffCodeChangeFrame';form.hidden=true;
   Object.entries({...draft,action:ACTION,command,idToken:proof,nonce:r.nonce,responseKey:r.responseKey}).forEach(([name,value])=>{const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);});document.body.appendChild(form);
   try{if(g.TlhCurrentWorkplace)g.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){if(command==='PREVIEW'){draft=null;reviewed=false;}n.status.textContent='送信結果を確認できません。同じ操作で確認してください。';finish();}finally{form.remove();}
  }
  g.addEventListener('message',async e=>{
   const r=pending;if(!r||stopped||!related(e.source,n.frame.contentWindow)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
   let valid=false;try{valid=await verify(e.data,r);}catch(_e){}if(!valid||pending!==r||stopped)return;const d=e.data;n.status.textContent=messages[d.code];
   if(d.code==='STAFF_CODE_CHANGE_READY'){draft=Object.freeze({...draft,revision:d.revision});reviewed=true;n.review.hidden=false;n.summary.textContent=draft.employeeCode+'（'+draft.expectedName+'） → '+draft.newEmployeeCode;}
   else if(r.command==='COMMIT'&&['ENROLLMENT_BUSY','STAFF_CODE_CHANGE_UNAVAILABLE','WRITE_UNAVAILABLE'].includes(d.code)){uncertain=true;}
   else{uncertain=false;draft=null;reviewed=false;n.review.hidden=true;}
   if(d.code==='WRITE_REVIEW_REQUIRED')blocked=true;finish();
  });
  n.form.addEventListener('submit',e=>{e.preventDefault();if(pending||draft||stopped||blocked||!n.form.reportValidity())return;
   draft=Object.freeze({employeeCode:n.old.value.trim().toUpperCase(),expectedName:n.name.value.trim(),expectedHireDate:n.date.value,newEmployeeCode:n.new.value.trim().toUpperCase(),operationId:random(16),revision:''});send('PREVIEW');});
  n.commit.addEventListener('click',()=>{if(reviewed)send('COMMIT');});
  n.reset.addEventListener('click',()=>{if(pending||uncertain||stopped||blocked)return;draft=null;reviewed=false;n.review.hidden=true;n.summary.textContent='';n.status.textContent='入力内容を確認してください。';controls();});
  g.addEventListener('pagehide',()=>{stopped=true;draft=null;reviewed=false;for(const k of ['old','name','date','new'])n[k].value='';n.summary.textContent='';n.review.hidden=true;finish();});controls();
 }
 async function bootstrap(){const status=document.getElementById('code-change-status');try{await g.liff.init({liffId:config.liffId});if(!g.liff.isLoggedIn()){status.textContent='LINEログインの確認・やり直しからログインしてください。';return;}init({liff:g.liff,gasUrl:config.gasUrl});status.textContent='変更する従業員の現在情報を入力してください。';}catch(_e){status.textContent='LINEログインを確認できません。ログインの確認・やり直しをご利用ください。';}finally{status.setAttribute('aria-busy','false');}}
 g.TlhStaffCodeChange=Object.freeze({init,verify,config});if(document.currentScript?.dataset.bootstrap==='true')bootstrap();
})(window);
