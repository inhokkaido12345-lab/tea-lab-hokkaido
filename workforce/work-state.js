/**
 * 【D13 / 現役・本人の勤務状態表示】
 * 責務: 明示的な読取要求と、HMAC検証済み固定状態の表示だけ。
 * 構成: click→LINE証明/一回用nonce/鍵→form POST→固定codeを照合。
 * 削除影響: 勤務状態表示だけ停止。登録/停止や原簿の保存内容は残る。
 * 概念: read-only controller / message authentication / stale-response rejection。
 * 初歩: 「確認」は打刻ではない。ブラウザ時刻から勤務状態を推測しない。
 * 拡張: 打刻操作や日時/給与表示は別API・仕様・テストを追加してから。
 * 境界: 氏名/ID/原簿を受け取らず、token/鍵をURL・ログ・ブラウザ保存に出さない。
 * 検証: work-state.test.mjs→CI→LINE実機。実社員の登録・打刻は行わない。
 */
(function(global){
  'use strict';
  const TYPE='TLH_BRIDGE_WORK_STATE',ACTION='bridgeGetWorkState';
  const messages=Object.freeze({
    WORK_STATE_OFF:'勤務外',WORK_STATE_WORKING:'勤務中',WORK_STATE_BREAK:'休憩中',
    WORK_STATE_ACCOUNT_REQUIRED:'TLHアカウントが未登録です。',
    WORK_STATE_ACCOUNT_UNAVAILABLE:'アカウントの状態を管理者に確認してください。',
    WORK_STATE_EMPLOYEE_REQUIRED:'有効な従業員登録がありません。',
    WORK_STATE_ROLE_REQUIRED:'有効な従業員権限がありません。管理者に確認してください。',
    WORK_STATE_NOT_STARTED:'入社日前のため勤務状態を表示できません。',
    WORK_STATE_REVIEW_REQUIRED:'登録情報または打刻履歴の確認が必要です。管理者に知らせてください。',
    WORK_STATE_CORRECTIONS_PENDING:'打刻修正の反映確認が必要です。管理者に知らせてください。',
    WRITE_REVIEW_REQUIRED:'記録の整合性確認が必要です。操作を止めて開発担当に知らせてください。',
    WORK_STATE_STORAGE_NOT_READY:'保存先の設定確認が必要です。開発担当に知らせてください。',
    WORK_STATE_BUSY:'別の処理中です。もう一度確認してください。',
    WORK_STATE_UNAVAILABLE:'勤務状態を確認できませんでした。もう一度確認してください。',
    LINE_VERIFY_REJECTED:'LINE本人確認が失敗しました。LINEから開き直してください。',
    INVALID_REQUEST:'送信内容を確認できませんでした。',
  });
  function random(size){return Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');}
  async function verifyResponse(data,request){
    if(!data||!request||data.type!==TYPE||data.action!==ACTION||data.action!==request.action||data.nonce!==request.nonce||
      typeof data.code!=='string'||!Object.hasOwn(messages,data.code)||typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(request.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,data.nonce,data.action,data.code].join('\n')));
  }
  function init(options){
    const button=document.getElementById('work-state-check'),status=document.getElementById('work-state-status');
    let pending=null,blocked=false;
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;button.disabled=blocked;}
    async function check(){
      if(pending||blocked)return;
      if(global!==global.top||!crypto.subtle){status.textContent='安全な通信を開始できません。LINEから開き直してください。';return;}
      const idToken=options.liff&&options.liff.getIDToken();
      if(typeof idToken!=='string'||!idToken){status.textContent='LINE本人確認情報がありません。';return;}
      const request={action:ACTION,nonce:random(16),responseKey:random(32)};pending=request;button.disabled=true;status.textContent='確認中です。';
      request.timer=setTimeout(()=>{if(pending!==request)return;status.textContent='応答を確認できませんでした。もう一度確認してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhWorkStateFrame';form.hidden=true;
      Object.entries({action:request.action,nonce:request.nonce,responseKey:request.responseKey,idToken}).forEach(([name,value])=>{
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
      });
      document.body.appendChild(form);
      try{form.submit();}catch(_error){status.textContent='送信できませんでした。もう一度確認してください。';finish();}finally{form.remove();}
    }
    button.addEventListener('click',()=>check().catch(()=>{status.textContent='安全な通信を開始できませんでした。';finish();}));
    global.addEventListener('message',async event=>{
      const request=pending;
      if(!request||!(event.origin==='null'||/^https:\/\/(?:[a-z0-9-]+\.)*(?:googleusercontent|google)\.com$/.test(event.origin)))return;
      try{
        const d=event.data,data={type:d&&d.type,nonce:d&&d.nonce,action:d&&d.action,code:d&&d.code,mac:d&&d.mac};
        if(!await verifyResponse(data,request)||pending!==request)return;
        status.textContent=messages[data.code];
        blocked=['WRITE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_CORRECTIONS_PENDING'].includes(data.code);
        finish();
      }catch(_error){/* 未検証の応答や例外の内容は表示しない。 */}
    });
  }
  global.TlhWorkState=Object.freeze({init,verifyResponse});
})(window);
