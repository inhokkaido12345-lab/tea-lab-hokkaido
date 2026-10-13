/**
 * 【D11 / 現役】責務: 管理者確認、事前登録/招待発行・取消し、本人の受取り。
 * 構成: 固定結果のHMAC検査→一回用request→明示操作と表示。
 * 削除影響: D11が使えない。D4-D10や保存済みデータは残る。
 * 概念: controller / immutable retry draft / capability / message authentication。
 * 初歩: draftは再送用の同じ入力。postMessageはHTMLでなく固定codeとして読む。
 * 拡張: 利用停止/属性訂正はstaff-maintenance.js。従業員一覧/法的退職は別設計。社員情報を応答へ追加しない。
 * 改造箇所: initの入力制約/messagesはGAS staffCodeValid_/staffDetailsValid_/期限、BridgeStaffEnrollmentと同期。
 * 境界: token/氏名はURL・ログ・保存領域へ出さない。招待秘密は管理者が本人へ個別に渡す。
 * 検証: tests/staff-enrollment.test.mjs→CI→LINE実機（実在社員を無断登録しない）。
 */
(function(global) {
  'use strict';
  const TYPE = 'TLH_BRIDGE_STAFF_ENROLLMENT';
  const messages = Object.freeze({
    STAFF_ADMIN_READY: '管理者用登録画面を開きました。',
    STAFF_INVITATION_READY: '招待を発行しました。有効期限は発行から24時間です。',
    STAFF_INVITATION_REVOKED: '未使用の招待を取り消しました。',
    NO_PENDING_INVITATION: '取り消す未使用招待がありません。',
    STAFF_REGISTERED: '従業員登録が完了しました。',
    STAFF_ALREADY_REGISTERED: 'この招待は登録済みです。追加の変更はしていません。',
    TLH_ADMIN_REQUIRED: '管理者権限が必要です。',
    LINE_VERIFY_REJECTED: 'LINE本人確認が失敗しました。LINEから開き直してください。',
    INVALID_EMPLOYEE_INPUT: '社員番号・氏名・入社日を確認してください。',
    EMPLOYEE_NOT_INVITABLE: 'この社員番号は登録済み、または停止中です。招待は発行しませんでした。',
    EMPLOYEE_DETAILS_MISMATCH: '同じ社員番号の登録情報と一致しません。既存情報は変更していません。',
    EMPLOYEE_ALREADY_LINKED: 'このLINEには既に有効な従業員登録があります。',
    INVITATION_NOT_AVAILABLE: '招待が利用できません。期限・取消し・使用済みの状態を管理者に確認してください。',
    ACCOUNT_REVIEW_REQUIRED: 'アカウントの状態を管理者に確認してください。',
    STAFF_STORAGE_NOT_READY: '保存先の設定確認が必要です。開発担当に知らせてください。',
    WRITE_REVIEW_REQUIRED: '記録の整合性確認が必要です。操作を止めて開発担当に知らせてください。',
    WRITE_UNAVAILABLE: '処理を完了できませんでした。同じ操作で再試行してください。',
    ENROLLMENT_UNAVAILABLE: '処理を完了できませんでした。',
    ENROLLMENT_BUSY: '別の登録処理中です。同じ操作で再試行してください。',
    INVALID_REQUEST: '送信内容を確認できませんでした。',
  });
  function hexRandom(size) {
    return Array.from(crypto.getRandomValues(new Uint8Array(size)), b=>b.toString(16).padStart(2,'0')).join('');
  }
  /**
   * @param {Object} data 受信固定結果。未知code/action/nonce/macを拒否する。
   * @param {Object} request 一回用応答鍵と送信内容をページメモリに保持した記録。
   * @return {Promise<boolean>} HMAC一致ならtrue。Web Crypto失敗はrejectしcallerが処理する。
   * 署名変更はBridgeStaffEnrollmentとテストを同期。名前/招待秘密を応答へ追加しない。
   */
  async function verifyResponse(data, request) {
    if (!data || !request || data.type !== TYPE || data.nonce !== request.nonce ||
        data.action !== request.action || typeof data.code !== 'string' || !Object.hasOwn(messages, data.code) ||
        typeof data.mac !== 'string' || !/^[a-f0-9]{64}$/.test(data.mac)) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(request.responseKey),
      {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
    return crypto.subtle.verify('HMAC', key,
      Uint8Array.from(data.mac.match(/../g), b=>parseInt(b,16)),
      encoder.encode([TYPE,data.nonce,data.action,data.code].join('\n')));
  }
  /**
   * @param {{liff:Object,gasUrl:string}} options index.htmlの接続設定。
   * @return {undefined} DOM/操作を結ぶ。必須DOM欠落は初期化エラーになり得る。
   * pendingは通信、draftは同入力/招待秘密の再送用。adminReadyはUIだけでGAS認可の代用ではない。
   * 項目変更はHTML/Service/Bridge/テストを同期。表示だけで登録しない。
   */
  function init(options) {
    const ids=['staff-check','staff-admin','staff-issue-form','staff-claim-form','staff-fields',
      'staff-employee-code','staff-name','staff-hire-date','staff-claim-code','staff-issue','staff-claim',
      'staff-invite-box','staff-issued-code','staff-copy','staff-revoke','staff-reset','staff-status'];
    const nodes=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
    let pending=null, draft=null, adminReady=false, issued=false, registered=false, blocked=false;
    const status=nodes['staff-status'];
    function controls() {
      for(const id of ['staff-check','staff-issue','staff-claim','staff-revoke','staff-reset']) {
        nodes[id].disabled=!!pending||blocked;
      }
      nodes['staff-issue'].disabled ||= !adminReady||issued;
      nodes['staff-revoke'].disabled ||= !adminReady;
      nodes['staff-claim'].disabled ||= registered;
      nodes['staff-claim-code'].disabled=!!pending||registered||blocked;
      nodes['staff-fields'].disabled=!!pending||!!draft||blocked;
      nodes['staff-copy'].disabled=!!pending||!issued||blocked;
    }
    function finish() {
      if(pending)clearTimeout(pending.timer);
      pending=null;controls();
    }
    async function send(action, fields={}) {
      if(pending||blocked)return;
      if(global!==global.top||!crypto.subtle) {
        status.textContent='安全な通信を開始できません。LINEから開き直してください。';return;
      }
      const idToken=options.liff&&options.liff.getIDToken();
      if(typeof idToken!=='string'||!idToken){status.textContent='LINE本人確認情報がありません。';return;}
      const request={action,nonce:hexRandom(16),responseKey:hexRandom(32)};
      pending=request;controls();status.textContent='処理中です。';
      request.timer=setTimeout(()=>{
        if(pending!==request)return;
        status.textContent='応答を確認できませんでした。同じ操作で再試行してください。';finish();
      },30000);
      const form=document.createElement('form');
      form.method='POST';form.action=options.gasUrl;form.target='tlhStaffFrame';form.hidden=true;
      Object.entries({...fields,action,nonce:request.nonce,responseKey:request.responseKey,idToken}).forEach(([name,value])=>{
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
      });
      document.body.appendChild(form);
      try{form.submit();}catch(_error){status.textContent='送信できませんでした。';finish();}finally{form.remove();}
    }
    const invoke=(action,fields)=>send(action,fields).catch(()=>{status.textContent='安全な送信を開始できませんでした。';finish();});
    global.addEventListener('message',async event=>{
      const request=pending;
      if(!request||!(event.origin==='null'||/^https:\/\/(?:[a-z0-9-]+\.)*(?:googleusercontent|google)\.com$/.test(event.origin)))return;
      try{
        const d=event.data;
        const data={type:d&&d.type,nonce:d&&d.nonce,action:d&&d.action,code:d&&d.code,mac:d&&d.mac};
        if(!await verifyResponse(data,request)||pending!==request)return;
        status.textContent=messages[data.code];
        if(data.code==='STAFF_ADMIN_READY'){adminReady=true;nodes['staff-admin'].hidden=false;}
        if(data.code==='TLH_ADMIN_REQUIRED'){adminReady=false;nodes['staff-admin'].hidden=true;}
        if(data.code==='STAFF_INVITATION_READY'&&draft){
          issued=true;nodes['staff-issued-code'].value=draft.inviteToken;nodes['staff-invite-box'].hidden=false;
        }
        if(data.code==='STAFF_INVITATION_REVOKED'||data.code==='NO_PENDING_INVITATION'){
          issued=false;draft=null;nodes['staff-issued-code'].value='';nodes['staff-invite-box'].hidden=true;
        }
        if(data.code==='STAFF_REGISTERED'||data.code==='STAFF_ALREADY_REGISTERED'){
          registered=true;nodes['staff-claim-code'].value='';
        }
        if(data.code==='WRITE_REVIEW_REQUIRED'||data.code==='STAFF_STORAGE_NOT_READY'){
          blocked=true;nodes['staff-issued-code'].value='';nodes['staff-invite-box'].hidden=true;
        }
        finish();
      }catch(_error){/* 未検証の応答/例外は表示しない。 */}
    });
    nodes['staff-check'].addEventListener('click',()=>invoke('bridgeCheckStaffEnrollment'));
    nodes['staff-issue-form'].addEventListener('submit',event=>{
      event.preventDefault();if(pending||blocked||!adminReady||issued)return;
      if(!draft){
        if(!nodes['staff-issue-form'].reportValidity())return;
        const employeeCode=nodes['staff-employee-code'].value.trim().toUpperCase();
        const name=nodes['staff-name'].value.trim(),hireDate=nodes['staff-hire-date'].value;
        if(!global.confirm(employeeCode+' の従業員を事前登録し、招待を発行します。続けますか？'))return;
        draft={employeeCode,name,hireDate,inviteToken:hexRandom(32)};
      }
      invoke('bridgeIssueStaffInvitation',draft);
    });
    nodes['staff-revoke'].addEventListener('click',()=>{
      if(pending||blocked||!adminReady)return;
      const employeeCode=draft?draft.employeeCode:nodes['staff-employee-code'].value.trim().toUpperCase();
      if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(employeeCode)){status.textContent=messages.INVALID_EMPLOYEE_INPUT;return;}
      if(!global.confirm(employeeCode+' の未使用招待を取り消します。続けますか？'))return;
      // 取消し結果が不明な間は、古いコードを再配布させない。
      issued=false;nodes['staff-issued-code'].value='';nodes['staff-invite-box'].hidden=true;
      invoke('bridgeRevokeStaffInvitation',{employeeCode});
    });
    nodes['staff-reset'].addEventListener('click',()=>{
      if(pending||blocked)return;
      if(draft&&!global.confirm('入力と表示中の招待コードを閉じます。この操作だけでは発行済み招待を取り消しません。続けますか？'))return;
      draft=null;issued=false;nodes['staff-issued-code'].value='';nodes['staff-invite-box'].hidden=true;
      status.textContent='';controls();
    });
    nodes['staff-claim-form'].addEventListener('submit',event=>{
      event.preventDefault();if(pending||blocked||registered)return;
      const inviteToken=nodes['staff-claim-code'].value.trim();
      if(!/^[a-f0-9]{64}$/.test(inviteToken)){status.textContent='招待コードを確認してください。';return;}
      if(!global.confirm('このLINEで個別招待を受け取り、従業員登録を完了します。続けますか？'))return;
      invoke('bridgeClaimStaffInvitation',{inviteToken});
    });
    nodes['staff-copy'].addEventListener('click',async()=>{
      if(!issued||pending||blocked)return;
      try{await global.navigator.clipboard.writeText(nodes['staff-issued-code'].value);status.textContent='招待コードをコピーしました。';}
      catch(_error){nodes['staff-issued-code'].focus();nodes['staff-issued-code'].select();status.textContent='招待コードを選択しました。';}
    });
    controls();
  }
  global.TlhStaffEnrollment=Object.freeze({init,verifyResponse});
})(window);
