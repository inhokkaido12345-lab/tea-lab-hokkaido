/**
 * 通信表示: aria-busyを実pendingに同期し、CSSだけで回す。成功/失敗/timeout後は停止。認可/送信条件は不変。
 * 【D14 / 現役・打刻UI、受付は初期閉鎖】
 * 責務: 読取準備→状態別コマンド→本人確認/明示同意→固定打刻IDの再送。
 * 構成: HMAC付き状態/revision→immutable draft→form POST→結果検証。
 * 削除影響: D14だけ停止。D13照会/登録/停止と原簿は残る。
 * 概念: command controller / optimistic concurrency / idempotency / immutable retry。
 * 初歩: 返信nonceは毎回新しく、打刻eventIdは同操作の再送で変えない。
 * 拡張: 過去時刻・代理打刻・給与/履歴表示は別設計。勝手に受付を開けない。
 * 改造箇所: commands/allowedはGAS WorkStateの遷移/PunchService/BridgePunchと両集計テストも同期。
 * 境界: ID/token/鍵/指紋はメモリ/POSTだけ。URL/ログ/ブラウザ保存へ出さない。
 * 復帰: 署名付き本人確認拒否/証明の欠落だけでログイン案内。draftが残る間は遷移せず固定IDを保持。
 * 改造: requireLogin/controlsとindex.htmlのpunch-login、punch.test.mjsを同期。周期確認/自動loginを追加しない。
 * 検証: punch.test.mjs→CI→本人の読取。現行受付はON、新環境の既定値とは別。実打刻を試験で作らない。
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
    LINE_VERIFY_REJECTED:'LINEでログインし直してください。',INVALID_REQUEST:'送信内容を確認できませんでした。',
  });
  function random(size){return Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');}
  /**
   * @param {Object} d 受信結果。type/action/nonce/code/revision/macを全て照合。
   * @param {Object} r メモリ内の送信記録。responseKeyと保存時fieldsを保持する。
   * @return {Promise<boolean>} 署名と操作が一致すればtrue。未知code/偽装/別打刻成功はfalse。
   * Web Crypto失敗はrejectしcallerが処理する。BridgePunchの署名順/辞書と通信テストを同期する。
   */
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
  /**
   * @param {{liff:Object,gasUrl:string}} options index.htmlからのLIFFと公開GAS /exec URL。
   * @return {undefined} DOM/操作を結ぶ。必須DOM欠落は初期化エラーになり得る。
   * pendingは通信、readyは確認結果、draftは固定eventId/入力。retryでdraftを再生成しない。
   * id変更はHTML/テストを同期。表示だけで自動打刻しない。
   */
  function init(options){
    const check=document.getElementById('punch-check'),retry=document.getElementById('punch-retry'),status=document.getElementById('punch-status');
    const login=document.getElementById('punch-login');
    const buttons=Object.fromEntries(Object.entries(commands).map(([type,c])=>[type,document.getElementById(c.id)]));
    let pending=null,ready=null,draft=null,draftSubmitted=false,blocked=false,loginRequired=false,loginPending=false,stopped=false;
    function controls(){status.setAttribute?.('aria-busy',String(!!pending||loginPending));
      check.disabled=!!pending||!!draft||blocked||loginRequired||loginPending||stopped;
      retry.hidden=!draft;retry.disabled=!!pending||blocked||loginPending||stopped;
      if(login){login.hidden=!loginRequired||!!draft||blocked||stopped;login.disabled=!!pending||loginPending||blocked||stopped;}
      for(const [type,button]of Object.entries(buttons)){
        button.hidden=!ready||!allowed[ready.code].includes(type);button.disabled=!!pending||!!draft||blocked||loginRequired||loginPending||stopped;
      }
    }
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    /** 本人確認失敗は未保存の証明ではない。以前の送信が保存済みの可能性もあるためdraftを捨てない。 */
    function requireLogin(){
      // 送信前に証明がなくなっただけなら保存は開始していない。初回loginを妨げない。
      if(draft&&!draftSubmitted)draft=null;
      ready=null;loginRequired=true;
      status.textContent=draft?'LINE本人確認が必要です。打刻の保存結果は未確認です。この画面を閉じず、同じ打刻を再送して確認してください。再送できない場合は管理者に記録の確認を依頼してください。':'LINEでログインし直してください。下のボタンから進めます。';
      controls();
    }
    // 本人が押した時だけ既存SDKで復帰。未確定の打刻がある間は遷移禁止（Storageへの秘密保存もしない）。
    login?.addEventListener('click',()=>{
      if(!loginRequired||draft||pending||blocked||loginPending||stopped)return;
      loginPending=true;ready=null;controls();
      try{
        if(options.liff.isInClient?.()){
          status.textContent='LINEアプリから開き直します。';global.location.assign('https://miniapp.line.me/2011940133-JXUDzLnG');return;
        }
        status.textContent='LINEで再ログインします。完了すると打刻画面へ戻ります。';
        if(options.liff.isLoggedIn())options.liff.logout();
        options.liff.login({redirectUri:global.location.origin+global.location.pathname});
      }catch(_error){loginPending=false;status.textContent='LINEログインを開始できませんでした。もう一度お試しください。';controls();}
    });
    async function send(action,fields={}){
      if(pending||blocked||loginPending||stopped)return;
      if(global!==global.top||!crypto.subtle){status.textContent='安全な通信を開始できません。LINEから開き直してください。';return;}
      let idToken;try{idToken=options.liff&&options.liff.getIDToken();}catch(_error){}
      if(typeof idToken!=='string'||!idToken){requireLogin();return;}
      const r={action,fields,nonce:random(16),responseKey:random(32)};pending=r;controls();status.textContent='処理中です。';
      r.timer=setTimeout(()=>{if(pending!==r)return;status.textContent=draft?'結果を確認できません。同じ打刻を再送してください。':'応答を確認できません。打刻前の状態を確認し直してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhPunchFrame';form.hidden=true;
      Object.entries({...fields,action,nonce:r.nonce,responseKey:r.responseKey,idToken}).forEach(([name,value])=>{
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
      });document.body.appendChild(form);
      if(action===WRITE)draftSubmitted=true; // 例外でも送信の成否を推測せず、以後は同じ固定IDで確認する。
      try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_error){status.textContent='送信結果を確認できません。同じ操作で再試行してください。';finish();}finally{form.remove();}
    }
    function invoke(action,fields){send(action,fields).catch(()=>{status.textContent='送信結果を確認できません。同じ操作で再試行してください。';finish();});}
    global.addEventListener('message',async event=>{
      const r=pending;if(!r||!(event.origin==='null'||/^https:\/\/(?:[a-z0-9-]+\.)*(?:googleusercontent|google)\.com$/.test(event.origin)))return;
      try{
        const d=event.data,data={type:d&&d.type,nonce:d&&d.nonce,action:d&&d.action,code:d&&d.code,revision:d&&d.revision,mac:d&&d.mac};
        if(!await verifyResponse(data,r)||pending!==r)return;status.textContent=messages[data.code];
        if(data.code!=='LINE_VERIFY_REJECTED')loginRequired=false;
        if(data.code==='LINE_VERIFY_REJECTED'){requireLogin();}
        else if(Object.hasOwn(allowed,data.code)){ready={code:data.code,revision:data.revision};}
        else if(!['PUNCH_UNAVAILABLE','PUNCH_NOT_SAVED','PUNCH_BUSY','WORK_STATE_BUSY'].includes(data.code)){ready=null;draft=null;}
        if(['WRITE_REVIEW_REQUIRED','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_CORRECTIONS_PENDING'].includes(data.code))blocked=true;
        finish();
        if(r.action===WRITE&&(/_DONE$/.test(data.code)||data.code==='PUNCH_ALREADY_RECORDED'))options.onRecorded?.(); // 確定した保存だけで読取表示を更新。不明結果では再送しない。
      }catch(_error){/* 未検証の応答を表示しない。 */}
    });
    check.addEventListener('click',()=>{if(pending||draft||blocked||loginRequired||loginPending||stopped)return;ready=null;controls();invoke(READ);});
    Object.entries(buttons).forEach(([type,button])=>button.addEventListener('click',()=>{
      if(pending||draft||blocked||loginRequired||loginPending||stopped||!ready||!allowed[ready.code].includes(type))return;
      if(!global.confirm(commands[type].label+'：このLINEの本人打刻を現在のサーバー時刻で記録します。続けますか？'))return;
      draft={eventId:'evt_'+random(16),eventType:type,revision:ready.revision};draftSubmitted=false;controls();invoke(WRITE,draft);
    }));
    retry.addEventListener('click',()=>{if(draft&&!pending&&!blocked)invoke(WRITE,draft);});
    // bfcacheからの復帰はauto-read.jsが新しいGETへ戻す。退場後の遅延返信で打刻可能にしない。
    global.addEventListener('pagehide',()=>{stopped=true;ready=null;draft=null;draftSubmitted=false;loginPending=false;finish();});
    controls();
  }
  global.TlhPunch=Object.freeze({init,verifyResponse});
})(window);
