/**
 * 【D12 / 現役】責務: 対象の読取照合→管理者の明示確認→属性訂正/利用停止。
 * 構成: 入力snapshot→HMAC付きrevision→固定操作draft→form POST→固定結果。
 * 削除影響: D12だけ停止。D11登録・診断・保存済み履歴は残る。
 * 概念: controller / optimistic concurrency / immutable retry / message authentication。
 * 初歩: 結果不明なら同じoperationIdで再送する。新しい操作で重複履歴を作らない。
 * 拡張: 社員番号変更・再紐付け・再入社・給与訂正は別Service/設計が必要。
 * 境界: 氏名/token/指紋はPOST body/メモリだけ。URL/ログ/保存領域へ出さない。
 * 検証: staff-maintenance.test.mjs、模擬ブラウザ、LINE実機を区別する。
 */
(function(global) {
  'use strict';
  const TYPE='TLH_BRIDGE_STAFF_MAINTENANCE';
  const messages=Object.freeze({
    STAFF_REVIEW_INVITED:'対象を確認しました。招待待ちです。',
    STAFF_REVIEW_ACTIVE:'対象を確認しました。有効な従業員登録です。',
    STAFF_REVIEW_INACTIVE:'対象を確認しました。停止済みのため変更できません。',
    STAFF_DETAILS_CORRECTED:'氏名・入社日を訂正しました。未使用招待は取り消しています。',
    STAFF_ACCESS_STOPPED:'従業員の利用を停止しました。アカウント・管理者権限・履歴は残しています。',
    STAFF_OPERATION_ALREADY_DONE:'この操作は完了済みです。追加の変更はしていません。',
    STAFF_NO_CHANGE:'変更内容がありません。保存していません。',
    STAFF_TARGET_NOT_FOUND:'対象の社員番号が見つかりません。',
    STAFF_TARGET_CHANGED:'確認後に記録が変わりました。対象を確認し直してください。',
    STAFF_TARGET_INACTIVE:'対象は停止済みです。変更していません。',
    EMPLOYEE_DETAILS_MISMATCH:'現在の氏名・入社日が保存情報と一致しません。変更していません。',
    INVALID_EMPLOYEE_INPUT:'社員番号・氏名・入社日を確認してください。',
    TLH_ADMIN_REQUIRED:'管理者権限が必要です。',
    LINE_VERIFY_REJECTED:'LINE本人確認が失敗しました。LINEから開き直してください。',
    STAFF_MAINTENANCE_REVIEW:'対象の履歴確認が必要です。変更せず開発担当に知らせてください。',
    STAFF_STORAGE_NOT_READY:'保存先の設定確認が必要です。開発担当に知らせてください。',
    WRITE_REVIEW_REQUIRED:'記録の整合性確認が必要です。操作を止めて開発担当に知らせてください。',
    WRITE_UNAVAILABLE:'処理を完了できませんでした。変更は取り消されています。対象を確認し直してください。',
    ENROLLMENT_BUSY:'別の登録処理中です。同じ操作で再試行してください。',
    MAINTENANCE_UNAVAILABLE:'結果を確認できません。同じ操作で再試行してください。',
    INVALID_REQUEST:'送信内容を確認できませんでした。',
  });
  const isReview=code=>['STAFF_REVIEW_INVITED','STAFF_REVIEW_ACTIVE','STAFF_REVIEW_INACTIVE'].includes(code);
  function random(size){return Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');}
  async function verifyResponse(data,request){
    if(!data||!request||data.type!==TYPE||data.nonce!==request.nonce||data.action!==request.action||
      typeof data.code!=='string'||!Object.hasOwn(messages,data.code)||typeof data.revision!=='string'||
      !(data.revision===''||/^[a-f0-9]{64}$/.test(data.revision))||
      (isReview(data.code)&&(request.action!=='bridgeCheckStaffMaintenance'||!data.revision))||
      (!isReview(data.code)&&data.revision!=='')||typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(request.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),b=>parseInt(b,16)),
      enc.encode([TYPE,data.nonce,data.action,data.code,data.revision].join('\n')));
  }
  function init(options){
    const ids=['maintenance-target-form','maintenance-target-fields','maintenance-code','maintenance-old-name',
      'maintenance-old-date','maintenance-check','maintenance-reviewed','maintenance-correct-form',
      'maintenance-new-fields','maintenance-new-name','maintenance-new-date','maintenance-correct',
      'maintenance-stop','maintenance-reset','maintenance-status'];
    const n=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
    let pending=null,review=null,draft=null,blocked=false;
    const status=n['maintenance-status'];
    function controls(){
      n['maintenance-target-fields'].disabled=!!pending||!!review||!!draft||blocked;
      n['maintenance-new-fields'].disabled=!!pending||!!draft||blocked;
      n['maintenance-check'].disabled=!!pending||!!review||!!draft||blocked;
      n['maintenance-reset'].disabled=!!pending||!!draft||blocked;
      const enabled=!!review&&review.code!=='STAFF_REVIEW_INACTIVE'&&!pending&&!blocked;
      n['maintenance-correct'].disabled=!enabled||(!!draft&&draft.action!=='bridgeCorrectStaffDetails');
      n['maintenance-stop'].disabled=!enabled||(!!draft&&draft.action!=='bridgeStopStaffAccess');
    }
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function clearReview(){review=null;n['maintenance-reviewed'].hidden=true;}
    async function send(action,fields){
      if(pending||blocked)return;
      if(global!==global.top||!crypto.subtle){status.textContent='安全な通信を開始できません。LINEから開き直してください。';return;}
      const idToken=options.liff&&options.liff.getIDToken();
      if(typeof idToken!=='string'||!idToken){status.textContent='LINE本人確認情報がありません。';return;}
      const request={action,nonce:random(16),responseKey:random(32),fields};pending=request;controls();
      status.textContent='処理中です。';
      request.timer=setTimeout(()=>{if(pending!==request)return;status.textContent='応答を確認できません。同じ操作で再試行してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhMaintenanceFrame';form.hidden=true;
      Object.entries({...fields,action,idToken,nonce:request.nonce,responseKey:request.responseKey}).forEach(([name,value])=>{
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
      });
      document.body.appendChild(form);
      try{form.submit();}catch(_error){status.textContent='送信結果を確認できません。同じ操作で再試行してください。';finish();}finally{form.remove();}
    }
    function invoke(action,fields){send(action,fields).catch(()=>{status.textContent='送信結果を確認できません。同じ操作で再試行してください。';finish();});}
    global.addEventListener('message',async event=>{
      const request=pending;
      if(!request||!(event.origin==='null'||/^https:\/\/(?:[a-z0-9-]+\.)*(?:googleusercontent|google)\.com$/.test(event.origin)))return;
      try{
        const d=event.data,data={type:d&&d.type,nonce:d&&d.nonce,action:d&&d.action,code:d&&d.code,revision:d&&d.revision,mac:d&&d.mac};
        if(!await verifyResponse(data,request)||pending!==request)return;
        status.textContent=messages[data.code];
        if(isReview(data.code)){
          review={...request.fields,revision:data.revision,code:data.code};
          n['maintenance-new-name'].value=review.expectedName;n['maintenance-new-date'].value=review.expectedHireDate;
          n['maintenance-reviewed'].hidden=data.code==='STAFF_REVIEW_INACTIVE';
        }else if(data.code!=='ENROLLMENT_BUSY'&&data.code!=='MAINTENANCE_UNAVAILABLE'){
          draft=null;clearReview();
        }
        if(['WRITE_REVIEW_REQUIRED','STAFF_STORAGE_NOT_READY','STAFF_MAINTENANCE_REVIEW'].includes(data.code))blocked=true;
        finish();
      }catch(_error){/* 未検証の応答と例外は利用者へ出さない。 */}
    });
    n['maintenance-target-form'].addEventListener('submit',event=>{
      event.preventDefault();if(pending||blocked||review||draft||!n['maintenance-target-form'].reportValidity())return;
      invoke('bridgeCheckStaffMaintenance',{employeeCode:n['maintenance-code'].value.trim().toUpperCase(),
        expectedName:n['maintenance-old-name'].value.trim(),expectedHireDate:n['maintenance-old-date'].value});
    });
    function perform(action){
      if(pending||blocked||!review||review.code==='STAFF_REVIEW_INACTIVE'||(draft&&draft.action!==action))return;
      if(!draft){
        const fields={employeeCode:review.employeeCode,expectedName:review.expectedName,expectedHireDate:review.expectedHireDate,revision:review.revision};
        if(action==='bridgeCorrectStaffDetails'){
          if(!n['maintenance-correct-form'].reportValidity())return;
          fields.name=n['maintenance-new-name'].value.trim();fields.hireDate=n['maintenance-new-date'].value;
          if(!global.confirm(fields.employeeCode+' / '+fields.expectedName+' の情報を訂正します。\n氏名: '+fields.expectedName+' → '+fields.name+
            '\n入社日: '+(fields.expectedHireDate||'未指定')+' → '+(fields.hireDate||'未指定')+'\n未使用招待も取り消します。続けますか？'))return;
        }else if(!global.confirm(fields.employeeCode+' / '+fields.expectedName+' の従業員利用を今すぐ停止します。未使用招待も取り消します。\nアカウント・管理者権限・履歴は残します。退職日の登録や再紐付けは行いません。続けますか？'))return;
        draft={action,fields:{...fields,operationId:random(16)}};
      }
      controls();invoke(draft.action,draft.fields);
    }
    n['maintenance-correct-form'].addEventListener('submit',event=>{event.preventDefault();perform('bridgeCorrectStaffDetails');});
    n['maintenance-stop'].addEventListener('click',()=>perform('bridgeStopStaffAccess'));
    n['maintenance-reset'].addEventListener('click',()=>{if(pending||blocked||draft)return;clearReview();status.textContent='';controls();});
    controls();
  }
  global.TlhStaffMaintenance=Object.freeze({init,verifyResponse});
})(window);
