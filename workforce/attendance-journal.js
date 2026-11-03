/**
 * 日別記録の読取専用UI。LINE→POST→固定通信枠/子孫origin・nonce/action/HMAC→表へtextContent。
 * 消すと日別ページとホームの本日記録が停止。既存punch.jsと原簿は不変。端末時計で実働を足さない。
 * UI2: initのcards/todayは表示先と選択日の指定だけ。署名/DTO検査後にrenderCards、対象変更/退場で消去。
 * 概念: authenticated DTO / read model。表示する人の選択は認可ではなく、GASが毎回検証する。
 * 改造: DTOはAttendanceJournalService/Bridge/両repo試験と同期。予定超過を法定時間外へ改称しない。
 * 個人時刻・token・社員番号・鍵はPOST/メモリ限定。URL/ログ/Storageへ保存しない。
 * 検証: attendance-journal.test.mjs→全UI回帰→LINE本人/管理者読取。自動送信/打刻/申請をしない。
 */
(function(global){
  'use strict';
  const config=Object.freeze({liffId:'2011940133-JXUDzLnG',gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec'});
  const TYPE='TLH_BRIDGE_ATTENDANCE_JOURNAL',ACTION='bridgeGetAttendanceJournal';
  const messages=Object.freeze({JOURNAL_READY:'日別記録を読み込みました。',INVALID_REQUEST:'月と社員番号を確認してください。',
    JOURNAL_EMPLOYEE_REQUIRED:'有効な従業員登録が見つかりません。',JOURNAL_UNAVAILABLE:'記録を取得できません。登録・管理者権限・台帳を確認してください。',
    WORK_STATE_ACCOUNT_REQUIRED:'TLHアカウントが未登録です。',WORK_STATE_ACCOUNT_UNAVAILABLE:'アカウントを管理者に確認してください。',
    WORK_STATE_EMPLOYEE_REQUIRED:'有効な従業員登録がありません。',WORK_STATE_ROLE_REQUIRED:'有効な従業員権限がありません。',
    WORK_STATE_NOT_STARTED:'入社日前です。',WORK_STATE_REVIEW_REQUIRED:'記録の確認が必要です。管理者に知らせてください。',
    WORK_STATE_CORRECTIONS_PENDING:'打刻訂正の反映確認が必要です。',WORK_STATE_BUSY:'別の処理中です。',ENROLLMENT_BUSY:'別の処理中です。',
    WRITE_REVIEW_REQUIRED:'記録の確認が必要です。管理者に知らせてください。'});
  const stateLabels={NO_RECORD:'未打刻',WORKING:'勤務中',BREAK:'休憩中',COMPLETED:'退勤済み'};
  const fields=['day','clockIn','clockOut','breakMs','workedMs','state','plannedStart','plannedEnd','plannedBreakMinutes','plannedWorkedMs','excessMs'];
  const duration=ms=>ms===null?'—':Math.floor(ms/3600000)+'時間'+String(Math.floor(ms/60000)%60).padStart(2,'0')+'分';
  const clock=iso=>iso?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)):'—';
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
  /** 署名確認後もDTOの型・日付・集計整合を検証。不正データを部分表示しない。 */
  function parseJournal(text,month){
    if(typeof text!=='string'||text.length>40000)return null;
    let j;try{j=JSON.parse(text);}catch(_e){return null;}
    if(!j||Object.keys(j).sort().join(',')!=='days,month'||j.month!==month||!Array.isArray(j.days)||!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month))return null;
    const count=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate();if(j.days.length!==count)return null;
    for(let i=0;i<count;i++){
      const r=j.days[i],int=v=>Number.isSafeInteger(v)&&v>=0,stamp=v=>typeof v==='string'&&(v===''||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v));
      if(!r||Object.keys(r).sort().join(',')!==fields.slice().sort().join(',')||r.day!==month+'-'+String(i+1).padStart(2,'0')||!Object.hasOwn(stateLabels,r.state)||
        !['clockIn','clockOut','plannedStart','plannedEnd'].every(k=>stamp(r[k]))||!int(r.breakMs)||
        !['workedMs','plannedBreakMinutes','plannedWorkedMs','excessMs'].every(k=>r[k]===null||int(r[k])))return null;
      if(r.state==='NO_RECORD'?(r.clockIn!==''||r.clockOut!==''||r.workedMs!==null||r.breakMs!==0):!r.clockIn)return null;
      if(r.state==='COMPLETED'?(!r.clockOut||r.workedMs===null||Date.parse(r.clockOut)<=Date.parse(r.clockIn)):(r.clockOut!==''||r.workedMs!==null))return null;
      if(r.plannedStart){
        const gross=Date.parse(r.plannedEnd)-Date.parse(r.plannedStart);
        if(!r.plannedEnd||!int(r.plannedBreakMinutes)||gross<=0||gross>48*3600000||r.plannedWorkedMs!==gross-r.plannedBreakMinutes*60000)return null;
      }else if(r.plannedEnd||r.plannedBreakMinutes!==null||r.plannedWorkedMs!==null)return null;
      if(r.excessMs!==(r.state==='COMPLETED'&&r.plannedWorkedMs!==null?Math.max(0,r.workedMs-r.plannedWorkedMs):null))return null;
    }
    return j;
  }
  /** 直下Window/最大8段の子孫だけを許可。親参照失敗/別窓は拒否し、署名も別途必須。 */
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch(_e){}return false;}
  /**
   * 来歴/署名/DTO検査を通った日別値だけをカード化。実働未確定と0を区別する。
   * @param {HTMLElement} container 表示先。既存table/通信状態には触れない。
   * @param {Object} journal parseJournalで検査済みの指定月。
   * @param {string} day 本日表示ならJST日付、月表示なら空文字。
   * 削除影響: カード表示のみ停止。原簿は不変。変更はCSS/画面/署名拒否回帰と確認する。
   */
  function renderCards(container,journal,day){
    container.replaceChildren();
    const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
    if(!day){
      const completed=journal.days.filter(row=>row.state==='COMPLETED'),metrics=node('div','','metric-grid');
      for(const [label,value]of [['実働合計',duration(completed.reduce((sum,row)=>sum+row.workedMs,0))],['完了勤務日数',completed.length+'日'],['予定超過',completed.some(row=>row.excessMs===null)?'予定未設定あり':duration(completed.reduce((sum,row)=>sum+row.excessMs,0))]]){
        const item=node('div','');item.appendChild(node('span',label));item.appendChild(node('strong',value));metrics.appendChild(item);
      }container.appendChild(metrics);
      container.appendChild(node('p','完了分のみ集計・時刻は日本時間','footnote'));
    }
    const selected=journal.days.filter(row=>day?row.day===day:row.state!=='NO_RECORD'||row.plannedStart);
    if(!selected.length)container.appendChild(node('p','この期間の勤務・予定はありません。','empty-note'));
    for(const row of selected){
      const card=node('article','','record-item'),head=node('div','','record-head');
      head.appendChild(node('strong',row.day));head.appendChild(node('span',stateLabels[row.state],'record-status'));card.appendChild(head);
      card.appendChild(node('p',row.clockIn?clock(row.clockIn)+' — '+(row.clockOut?clock(row.clockOut):'未退勤'):'まだ打刻はありません','record-times'));
      card.appendChild(node('p','実働 '+duration(row.workedMs)+' / 休憩 '+(row.state==='NO_RECORD'?'—':duration(row.breakMs)),'record-detail'));
      card.appendChild(node('p',row.plannedStart?'予定 '+clock(row.plannedStart)+' — '+clock(row.plannedEnd)+'\n予定休憩 '+row.plannedBreakMinutes+'分':'予定は登録されていません','record-plan'));
      card.appendChild(node('p','予定超過 '+duration(row.excessMs),'record-excess footnote'));container.appendChild(card);
    }
  }
  async function verifyResponse(d,r){
    if(!d||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||typeof d.code!=='string'||!Object.hasOwn(messages,d.code)||typeof d.journal!=='string'||
      typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac)||(d.code!=='JOURNAL_READY'&&d.journal!==''))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,d.action,d.code,d.journal].join('\n')));
  }
  /** initは通信しない。結果/対象変更/退場で表を消し、前の人の記録を残さない。 */
  function init(options){
    const n=Object.fromEntries(['month','mode','employee','target','check','status','table','caption','rows','frame'].map(k=>[k,document.getElementById('journal-'+k)]));
    let pending=null,stopped=false;
    const clear=()=>{n.table.hidden=true;n.rows.replaceChildren();n.caption.textContent='';if(options.cards)options.cards.replaceChildren();};
    const controls=()=>{for(const k of ['month','mode','employee','check'])n[k].disabled=!!pending||stopped;};
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    for(const key of ['month','mode','employee'])n[key].addEventListener('input',()=>{clear();n.target.hidden=n.mode.value!=='admin';});
    n.check.addEventListener('click',()=>{
      if(pending||stopped)return;clear();
      // ホームの本日は操作時点で選ぶ。日跨ぎ後も起動時の月へ固定しない。保存時刻には使わない。
      let day='';if(options.today){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=k=>parts.find(p=>p.type===k).value;day=get('year')+'-'+get('month')+'-'+get('day');n.month.value=day.slice(0,7);}
      if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      const proof=options.liff.getIDToken(),month=n.month.value,mode=n.mode.value,employeeCode=mode==='admin'?n.employee.value.trim():'';
      if(!proof){n.status.textContent='LINEログインが必要です。';return;}
      if(!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month)||!['self','admin'].includes(mode)||(mode==='admin'&&!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(employeeCode))){n.status.textContent=messages.INVALID_REQUEST;return;}
      const r={nonce:random(16),responseKey:random(32),month:month,mode:mode,day:day};pending=r;controls();n.status.textContent='読み込み中です。';
      r.timer=setTimeout(()=>{if(pending!==r)return;n.status.textContent='応答を確認できません。記録の変更は行っていません。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhJournalFrame';form.hidden=true;
      Object.entries({action:ACTION,idToken:proof,nonce:r.nonce,responseKey:r.responseKey,month,mode,employeeCode}).forEach(([name,value])=>{const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);});
      document.body.appendChild(form);try{form.submit();}catch(_e){n.status.textContent='送信できませんでした。';finish();}finally{form.remove();}
    });
    global.addEventListener('message',async e=>{
      const r=pending;if(!r||!related(e.source,n.frame.contentWindow)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
      let valid=false;try{valid=await verifyResponse(e.data,r);}catch(_e){}if(!valid||pending!==r)return;
      const d=e.data;
      if(d.code==='JOURNAL_READY'){
        const j=parseJournal(d.journal,r.month);if(!j)return;
        for(const row of j.days){
          const tr=document.createElement('tr');
          const values=[row.day,stateLabels[row.state],clock(row.clockIn),clock(row.clockOut),duration(row.breakMs),duration(row.workedMs),
            clock(row.plannedStart),clock(row.plannedEnd),row.plannedBreakMinutes===null?'予定なし':row.plannedBreakMinutes+'分',duration(row.excessMs)];
          for(const value of values){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}n.rows.appendChild(tr);
        }
        n.caption.textContent=j.month+' / '+(r.mode==='admin'?'指定した従業員':'自分')+' / 日本時間';n.table.hidden=false;
        if(options.cards)renderCards(options.cards,j,r.day);
      }
      n.status.textContent=messages[d.code];finish();
    });
    global.addEventListener('pagehide',()=>{stopped=true;clear();n.employee.value='';finish();});controls();
  }
  async function bootstrap(){
    const status=document.getElementById('journal-status'),login=document.getElementById('journal-login');
    document.getElementById('journal-month').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
    try{await global.liff.init({liffId:config.liffId});login.hidden=global.liff.isLoggedIn();
      login.addEventListener('click',()=>global.liff.login({redirectUri:global.location.origin+global.location.pathname}));
      status.textContent=login.hidden?'表示する月を選んで確認してください。':'LINEログインが必要です。';init({liff:global.liff,gasUrl:config.gasUrl,cards:document.getElementById('journal-cards')});
    }catch(_e){status.textContent='LINEログインを準備できません。';}
  }
  global.TlhAttendanceJournal=Object.freeze({init,parseJournal,verifyResponse,renderCards,config});
  if(document.currentScript&&document.currentScript.dataset.bootstrap==='true')bootstrap();
})(window);
