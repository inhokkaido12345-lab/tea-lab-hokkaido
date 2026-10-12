/**
 * 【D15 / 現役・本人の本日開始分の完了勤務表示】
 * 責務: 明示照会→HMAC/集計型検証→日付・完了回数・時間だけ表示する。
 * 構成: 独立controller/iframe。LINE証明と一回用nonce/鍵をPOST本文で送る。
 * 削除影響: 本日集計と、durationを共有するD16時間表示が停止。D13/D14/登録や原簿は残る。
 * 概念: read-only view / authenticated DTO / stale response rejection。
 * 初歩: 時間はサーバー合計。端末時計で未終了分を増やしたり給与へ換算しない。
 * 拡張: D16暦月は別controllerで実装。任意日/給与/個別打刻は別仕様と認可・署名・テストが必要。
 * 境界: token/鍵/集計をURL・ログ・ブラウザ保存へ出さず、textContentだけ使う。
 * 検証: daily-summary.test.mjs→CI→LINE。読取照会から自動登録/打刻を行わない。
 */
(function(global){
  'use strict';
  const TYPE='TLH_BRIDGE_DAILY_SUMMARY',ACTION='bridgeGetDailySummary';
  const messages=Object.freeze({
    DAILY_SUMMARY_READY:'集計を確認しました。',
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
    DAILY_SUMMARY_UNAVAILABLE:'本日分を確認できませんでした。もう一度確認してください。',
    LINE_VERIFY_REJECTED:'LINE本人確認が失敗しました。LINEから開き直してください。',
    INVALID_REQUEST:'送信内容を確認できませんでした。',
  });
  function random(size){return Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');}
  /** JSONを型検査するだけで表示しない。件数・整数時間・加減算・暦日・許可状態を厳密に検査する。 */
  function parseSummary(text){
    if(typeof text!=='string'||text.length>512)return null;
    try{
      const s=JSON.parse(text),keys=['workDate','completedShifts','grossMs','breakMs','workedMs','openState'];
      if(!s||Array.isArray(s)||Object.keys(s).sort().join(',')!==keys.sort().join(',')||
        typeof s.workDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.workDate)||
        new Date(s.workDate+'T00:00:00Z').toISOString().slice(0,10)!==s.workDate||
        !Number.isSafeInteger(s.completedShifts)||s.completedShifts<0||s.completedShifts>2500||
        !['grossMs','breakMs','workedMs'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||
        s.grossMs-s.breakMs!==s.workedMs||
        (s.completedShifts===0&&s.grossMs!==0)||(s.completedShifts>0&&s.grossMs===0)||
        typeof s.openState!=='string'||!['OFF','WORKING','BREAK'].includes(s.openState))return null;
      return s;
    }catch(_error){return null;}
  }
  async function verifyResponse(data,request){
    if(!data||!request||data.type!==TYPE||data.action!==ACTION||data.action!==request.action||data.nonce!==request.nonce||
      typeof data.code!=='string'||!Object.hasOwn(messages,data.code)||typeof data.summary!=='string'||data.summary.length>512||
      typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    if(data.code==='DAILY_SUMMARY_READY'?!parseSummary(data.summary):data.summary!=='')return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(request.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),b=>parseInt(b,16)),
      enc.encode([TYPE,data.nonce,data.action,data.code,data.summary].join('\n')));
  }
  /** 端数は切捨てない。給与用の丸めではなく、整数ミリ秒をそのまま表示。 */
  function duration(ms){
    const hours=Math.floor(ms/3600000),minutes=Math.floor(ms%3600000/60000),seconds=Math.floor(ms%60000/1000),fraction=ms%1000;
    return hours+'時間 '+minutes+'分 '+seconds+(fraction?'.'+String(fraction).padStart(3,'0'):'')+'秒';
  }
  function init(options){
    const button=document.getElementById('daily-summary-check'),status=document.getElementById('daily-summary-status'),
      result=document.getElementById('daily-summary-result');
    let pending=null,blocked=false;
    function clear(){result.hidden=true;for(const id of ['date','count','gross','break','worked','open'])document.getElementById('daily-summary-'+id).textContent='';}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;button.disabled=blocked;}
    async function check(){
      if(pending||blocked)return;
      clear();
      if(global!==global.top||!crypto.subtle){status.textContent='安全な通信を開始できません。LINEから開き直してください。';return;}
      const idToken=options.liff&&options.liff.getIDToken();
      if(typeof idToken!=='string'||!idToken){status.textContent='LINE本人確認情報がありません。';return;}
      const request={action:ACTION,nonce:random(16),responseKey:random(32)};pending=request;button.disabled=true;status.textContent='確認中です。';
      request.timer=setTimeout(()=>{if(pending!==request)return;status.textContent='応答を確認できませんでした。もう一度確認してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhDailySummaryFrame';form.hidden=true;
      Object.entries({action:request.action,nonce:request.nonce,responseKey:request.responseKey,idToken}).forEach(([name,value])=>{
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
        if(data.code==='DAILY_SUMMARY_READY'){
          const s=parseSummary(data.summary);
          for(const [id,value] of Object.entries({date:s.workDate,count:s.completedShifts+'回',gross:duration(s.grossMs),
            break:duration(s.breakMs),worked:duration(s.workedMs),open:s.openState==='OFF'?'未終了の勤務はありません。':'未終了の勤務があります。合計には加算していません。'})){
            document.getElementById('daily-summary-'+id).textContent=value;
          }
          result.hidden=false;
        }
        blocked=['WRITE_REVIEW_REQUIRED','WORK_STATE_STORAGE_NOT_READY','WORK_STATE_REVIEW_REQUIRED','WORK_STATE_CORRECTIONS_PENDING'].includes(data.code);
        finish();
      }catch(_error){/* 未検証の個人集計や内部例外は表示しない。 */}
    });
  }
  global.TlhDailySummary=Object.freeze({init,verifyResponse,parseSummary,duration});
})(window);
