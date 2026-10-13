/**
 * 【D16 / 現役・本人の今月開始分の完了勤務表示】
 * 責務: 明示読取→月/日数/回数/合計のHMAC・型検査→本人集計だけ表示。
 * 構成: 独立controller/iframe。時間表示だけTlhDailySummary.durationを共有する。
 * 削除影響: D16表示だけ停止。daily-summary.js削除はD15とD16時間表示を止める。
 * 概念: read-only controller / signed DTO / stale response rejection。
 * 初歩: 暦月はGASの日本時間。勤務回数と重複なし出勤日数は別の数。
 * 拡張: 給与締め/給与額/過去月/個別履歴は別仕様と認可・署名・テストを追加する。
 * 境界: token/鍵/集計をURL・ログ・ブラウザ保存へ出さない。textContentだけ使う。
 * 検証: monthly-work-summary.test.mjs→CI→LINE。照会で登録/打刻/給与保存をしない。
 */
(function(global){
  'use strict';
  const TYPE='TLH_BRIDGE_MONTHLY_WORK_SUMMARY',ACTION='bridgeGetMonthlyWorkSummary';
  const messages=Object.freeze({
    MONTHLY_WORK_SUMMARY_READY:'集計を確認しました。',
    WORK_STATE_ACCOUNT_REQUIRED:'TLHアカウントが未登録です。',
    WORK_STATE_ACCOUNT_UNAVAILABLE:'アカウントの状態を管理者に確認してください。',
    WORK_STATE_EMPLOYEE_REQUIRED:'有効な従業員登録がありません。',
    WORK_STATE_ROLE_REQUIRED:'有効な従業員権限がありません。管理者に確認してください。',
    WORK_STATE_NOT_STARTED:'入社日前のため集計を表示できません。',
    WORK_STATE_REVIEW_REQUIRED:'登録情報または打刻履歴の確認が必要です。管理者に知らせてください。',
    WORK_STATE_CORRECTIONS_PENDING:'打刻修正の反映確認が必要です。管理者に知らせてください。',
    WRITE_REVIEW_REQUIRED:'記録の整合性確認が必要です。操作を止めて開発担当に知らせてください。',
    WORK_STATE_STORAGE_NOT_READY:'保存先の設定確認が必要です。開発担当に知らせてください。',
    WORK_STATE_BUSY:'別の処理中です。もう一度確認してください。',
    MONTHLY_WORK_SUMMARY_UNAVAILABLE:'今月分を確認できませんでした。もう一度確認してください。',
    LINE_VERIFY_REJECTED:'LINE本人確認が失敗しました。LINEから開き直してください。',
    INVALID_REQUEST:'送信内容を確認できませんでした。',
  });
  function random(size){return Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');}
  /**
   * @param {string} text 受信月次summaryのJSON文字列。許可列/型/範囲/暦月を検査する。
   * @return {Object|null} 正常DTOかnull。JSON/日付検査例外は捕捉する。署名確認前に表示しない。
   * 日数は回数以下かつ暦月の日数以内。DTO変更はGAS Service/Bridge/テストを同期する。
   */
  function parseSummary(text){
    if(typeof text!=='string'||text.length>512)return null;
    try{
      const s=JSON.parse(text),keys=['workMonth','completedDays','completedShifts','grossMs','breakMs','workedMs','openState'];
      if(!s||Array.isArray(s)||Object.keys(s).sort().join(',')!==keys.sort().join(',')||
        typeof s.workMonth!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(s.workMonth))return null;
      const end=new Date(s.workMonth+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
      if(!Number.isSafeInteger(s.completedDays)||s.completedDays<0||s.completedDays>end.getUTCDate()||
        !Number.isSafeInteger(s.completedShifts)||s.completedShifts<s.completedDays||s.completedShifts>2500||
        ((s.completedShifts===0)!==(s.completedDays===0))||
        !['grossMs','breakMs','workedMs'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||s.grossMs-s.breakMs!==s.workedMs||
        (s.completedShifts===0&&s.grossMs!==0)||(s.completedShifts>0&&s.grossMs===0)||
        typeof s.openState!=='string'||!['OFF','WORKING','BREAK'].includes(s.openState))return null;
      return s;
    }catch(_error){return null;}
  }
  /**
   * @param {Object} data 月次受信結果。summary全文を署名対象にする。
   * @param {Object} request メモリ内のnonce/action/responseKey。
   * @return {Promise<boolean>} 形式/要求/HMAC一致ならtrue。Crypto失敗はrejectしcallerが処理する。
   * BridgeMonthlyWorkSummaryと署名の列順/通信テストを同期。失敗codeに集計を添えない。
   */
  async function verifyResponse(data,request){
    if(!data||!request||data.type!==TYPE||data.action!==ACTION||data.action!==request.action||data.nonce!==request.nonce||
      typeof data.code!=='string'||!Object.hasOwn(messages,data.code)||typeof data.summary!=='string'||data.summary.length>512||
      typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    if(data.code==='MONTHLY_WORK_SUMMARY_READY'?!parseSummary(data.summary):data.summary!=='')return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(request.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),b=>parseInt(b,16)),
      enc.encode([TYPE,data.nonce,data.action,data.code,data.summary].join('\n')));
  }
  /**
   * @param {{liff:Object,gasUrl:string}} options index.htmlからの接続設定。
   * @return {undefined} 明示照会/表示を結ぶ。自動登録/保存はしない。
   * 必須DOM/先に読むTlhDailySummary.duration欠落で表示エラーになり得る。
   * parseSummary/verifyResponse変更はBridgeMonthlyWorkSummaryとテストを同期。給与期間へ流用しない。
   */
  function init(options){
    const button=document.getElementById('monthly-work-check'),status=document.getElementById('monthly-work-status'),result=document.getElementById('monthly-work-result');
    let pending=null,blocked=false;
    function clear(){result.hidden=true;for(const id of ['month','days','count','gross','break','worked','open'])document.getElementById('monthly-work-'+id).textContent='';}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;button.disabled=blocked;}
    async function check(){
      if(pending||blocked)return;
      clear();
      if(global!==global.top||!crypto.subtle){status.textContent='安全な通信を開始できません。LINEから開き直してください。';return;}
      const proof=options.liff&&options.liff.getIDToken();
      if(typeof proof!=='string'||!proof){status.textContent='LINE本人確認情報がありません。';return;}
      const request={action:ACTION,nonce:random(16),responseKey:random(32)};pending=request;button.disabled=true;status.textContent='確認中です。';
      request.timer=setTimeout(()=>{if(pending!==request)return;status.textContent='応答を確認できませんでした。もう一度確認してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhMonthlyWorkFrame';form.hidden=true;
      Object.entries({action:request.action,nonce:request.nonce,responseKey:request.responseKey,idToken:proof}).forEach(([name,value])=>{
        const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);
      });
      document.body.appendChild(form);
      try{form.submit();}catch(_error){status.textContent='送信できませんでした。もう一度確認してください。';finish();}finally{form.remove();}
    }
    button.addEventListener('click',()=>check().catch(()=>{clear();status.textContent='安全な通信を開始できませんでした。';finish();}));
    global.addEventListener('message',async event=>{
      const request=pending;
      if(!request||!(event.origin==='null'||/^https:\/\/(?:[a-z0-9-]+\.)*(?:googleusercontent|google)\.com$/.test(event.origin)))return;
      try{
        const d=event.data,data={type:d&&d.type,nonce:d&&d.nonce,action:d&&d.action,code:d&&d.code,summary:d&&d.summary,mac:d&&d.mac};
        if(!await verifyResponse(data,request)||pending!==request)return;
        clear();status.textContent=messages[data.code];
        if(data.code==='MONTHLY_WORK_SUMMARY_READY'){
          const s=parseSummary(data.summary),duration=global.TlhDailySummary.duration;
          for(const [id,value] of Object.entries({month:s.workMonth,days:s.completedDays+'日',count:s.completedShifts+'回',gross:duration(s.grossMs),
            break:duration(s.breakMs),worked:duration(s.workedMs),open:s.openState==='OFF'?'未終了の勤務はありません。':'未終了の勤務があります。合計には加算していません。'})){
            document.getElementById('monthly-work-'+id).textContent=value;
          }
          result.hidden=false;
        }
        blocked=['WRITE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_CORRECTIONS_PENDING'].includes(data.code);
        finish();
      }catch(_error){/* 未検証の集計や内部例外を表示しない。 */}
    });
  }
  global.TlhMonthlyWorkSummary=Object.freeze({init,verifyResponse,parseSummary});
})(window);
