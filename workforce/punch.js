/**
 * 【D14 / 現役・打刻UI、受付は初期閉鎖】
 * 責務: 読取準備→状態別コマンド→本人確認/明示同意→固定打刻IDの再送。
 * 構成: HMAC付き状態/revision→immutable draft→form POST→結果検証。
 * 削除影響: D14だけ停止。D13照会/登録/停止と原簿は残る。
 * 概念: command controller / optimistic concurrency / idempotency / immutable retry。
 * 初歩: 返信nonceは毎回新しく、打刻eventIdは同操作の再送で変えない。
 * 拡張: 過去時刻・代理打刻・給与/履歴表示は別設計。勝手に受付を開けない。
 * 境界: ID/token/鍵/指紋はメモリ/POSTだけ。URL/ログ/ブラウザ保存へ出さない。
 * 検証: punch.test.mjs→CI→LINE受付閉鎖確認。模擬保存と実打刻を区別する。
 */
(function(global){
  'use strict';
  const TYPE='TLH_BRIDGE_PUNCH',READ='bridgeGetPunchReadiness',WRITE='bridgeRecordPunch';
  const commands={CLOCK_IN:{id:'punch-in',label:'出勤する'},BREAK_START:{id:'punch-break-start',label:'休憩を開始する'},
    BREAK_END:{id:'punch-break-end',label:'休憩を終了する'},CLOCK_OUT:{id:'punch-out',label:'退勤する'}};
  const allowed={PUNCH_READY_OFF:['CLOCK_IN'],PUNCH_READY_WORKING:['BREAK_START','CLOCK_OUT'],PUNCH_READY_BREAK:['BREAK_END']};
  const messages=Object.freeze({
    PUNCH_READY_OFF:'勤務外',PUNCH_READY_WORKING:'勤務中',PUNCH_READY_BREAK:'休憩中',
    PUNCH_CLOCK_IN_DONE:'出勤を記録しました。',PUNCH_BREAK_START_DONE:'休憩開始を記録しました。',
    PUNCH_BREAK_END_DONE:'休憩終了を記録しました。',PUNCH_CLOCK_OUT_DONE:'退勤を記録しました。',
    PUNCH_ALREADY_RECORDED:'この打刻は保存済みです。追加の記録はしていません。',
    PUNCH_DISABLED:'打刻受付は停止中です。',PUNCH_STATE_CHANGED:'確認後に状態が変わりました。打刻前の状態を確認し直してください。',
    PUNCH_INVALID_TRANSITION:'現在の勤務状態ではこの打刻はできません。状態を確認し直してください。',
    PUNCH_ID_CONFLICT:'打刻の識別情報を確認できません。状態を確認し直してください。',
    PUNCH_NOT_SAVED:'打刻は保存されていません。同じ打刻で再試行してください。',
    PUNCH_BUSY:'処理中です。同じ打刻で再試行してください。',
    PUNCH_UNAVAILABLE:'結果を確認できません。同じ操作で再試行してください。',
    WORK_STATE_BUSY:'別の処理中です。同じ操作で再試行してください。',
    WORK_STATE_ACCOUNT_REQUIRED:'TLHアカウントが未登録です。',WORK_STATE_ACCOUNT_UNAVAILABLE:'アカウントの状態を管理者に確認してください。',
    WORK_STATE_EMPLOYEE_REQUIRED:'有効な従業員登録がありません。',WORK_STATE_ROLE_REQUIRED:'有効な従業員権限がありません。',
    WORK_STATE_NOT_STARTED:'入社日前のため打刻できません。',WORK_STATE_REVIEW_REQUIRED:'登録情報または打刻履歴の確認が必要です。開発担当に知らせてください。',
    WORK_STATE_CORRECTIONS_PENDING:'打刻修正の反映確認が必要です。開発担当に知らせてください。',
    WORK_STATE_STORAGE_NOT_READY:'保存先の設定確認が必要です。開発担当に知らせてください。',
    WRITE_REVIEW_REQUIRED:'記録の整合性確認が必要です。操作を止めて開発担当に知らせてください。',
    LINE_VERIFY_REJECTED:'LINE本人確認が失敗しました。LINEから開き直してください。',INVALID_REQUEST:'送信内容を確認できませんでした。',
  });
  function random(size){return Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');}
  async function verifyResponse(d,r){
    if(!d||!r||d.type!==TYPE||d.action!==r.action||d.nonce!==r.nonce||typeof d.code!=='string'||!Object.hasOwn(messages,d.code)||
      typeof d.revision!=='string'||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return false;
    const ready=Object.hasOwn(allowed,d.code);
    if(ready?(r.action!==READ||!/^[a-f0-9]{64}$/.test(d.revision)):d.revision!=='')return false;
    if(/^PUNCH_(?:CLOCK_IN|CLOCK_OUT|BREAK_START|BREAK_END)_DONE$/.test(d.code)&&
      (r.action!==WRITE||!r.fields||d.code!=='PUNCH_'+r.fields.eventType+'_DONE'))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,d.action,d.code,d.revision].join('\n')));
  }
  function init(options){
    const check=document.getElementById('punch-check'),retry=document.getElementById('punch-retry'),status=document.getElementById('punch-status');
    const buttons=Object.fromEntries(Object.entries(commands).map(([type,c])=>[type,document.getElementById(c.id)]));
    let pending=null,ready=null,draft=null,blocked=false;
    function controls(){
      check.disabled=!!pending||!!draft||blocked;
      retry.hidden=!draft;retry.disabled=!!pending||blocked;
      for(const [type,button]of Object.entries(buttons)){
        button.hidden=!ready||!allowed[ready.code].includes(type);button.disabled=!!pending||!!draft||blocked;
      }
    }
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    async function send(action,fields={}){
      if(pending||blocked)return;
      if(global!==global.top||!crypto.subtle){status.textContent='安全な通信を開始できません。LINEから開き直してください。';return;}
      const idToken=options.liff&&options.liff.getIDToken();if(typeof idToken!=='string'||!idToken){status.textContent='LINE本人確認情報がありません。';return;}
      const r={action,fields,nonce:random(16),responseKey:random(32)};pending=r;controls();status.textContent='処理中です。';
      r.timer=setTimeout(()=>{if(pending!==r)return;status.textContent=draft?'結果を確認できません。同じ打刻を再送してください。':'応答を確認できません。打刻前の状態を確認し直してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhPunchFrame';form.hidden=true;
      Object.entries({...fields,action,nonce:r.nonce,responseKey:r.responseKey,idToken}).forEach(([name,value])=>{
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
      });document.body.appendChild(form);
      try{form.submit();}catch(_error){status.textContent='送信結果を確認できません。同じ操作で再試行してください。';finish();}finally{form.remove();}
    }
    function invoke(action,fields){send(action,fields).catch(()=>{status.textContent='送信結果を確認できません。同じ操作で再試行してください。';finish();});}
    global.addEventListener('message',async event=>{
      const r=pending;if(!r||!(event.origin==='null'||/^https:\/\/(?:[a-z0-9-]+\.)*(?:googleusercontent|google)\.com$/.test(event.origin)))return;
      try{
        const d=event.data,data={type:d&&d.type,nonce:d&&d.nonce,action:d&&d.action,code:d&&d.code,revision:d&&d.revision,mac:d&&d.mac};
        if(!await verifyResponse(data,r)||pending!==r)return;status.textContent=messages[data.code];
        if(Object.hasOwn(allowed,data.code)){ready={code:data.code,revision:data.revision};}
        else if(!['PUNCH_UNAVAILABLE','PUNCH_NOT_SAVED','PUNCH_BUSY','WORK_STATE_BUSY'].includes(data.code)){ready=null;draft=null;}
        if(['WRITE_REVIEW_REQUIRED','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_CORRECTIONS_PENDING'].includes(data.code))blocked=true;
        finish();
      }catch(_error){/* 未検証の応答を表示しない。 */}
    });
    check.addEventListener('click',()=>{if(pending||draft||blocked)return;ready=null;controls();invoke(READ);});
    Object.entries(buttons).forEach(([type,button])=>button.addEventListener('click',()=>{
      if(pending||draft||blocked||!ready||!allowed[ready.code].includes(type))return;
      if(!global.confirm(commands[type].label+'：このLINEの本人打刻を現在のサーバー時刻で記録します。続けますか？'))return;
      draft={eventId:'evt_'+random(16),eventType:type,revision:ready.revision};controls();invoke(WRITE,draft);
    }));
    retry.addEventListener('click',()=>{if(draft&&!pending&&!blocked)invoke(WRITE,draft);});
    controls();
  }
  global.TlhPunch=Object.freeze({init,verifyResponse});
})(window);
