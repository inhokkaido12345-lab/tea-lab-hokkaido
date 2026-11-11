/**
 * シフト画面のcontroller。HTML→入力snapshot→既存GASの署名返信→カレンダー/本人限定申請。
 * 削除影響: シフト画面だけ停止。打刻/共通Account/保存済みの予定は残る。
 * 概念: state→DTO検査→textContent描画、single flight、immutable retry、版の競合検知。
 * 改造: command/DTO/署名順はBridgeSchedule/Serviceと同期。認可と勤務時間計算はGAS側。
 * 境界: 理由/時刻/token/応答鍵をURL・Storage・ログへ置かない。返信元frame/HMACの両方を検査。
 * 検証: schedule-ui.test.mjsと実Service連結。見本の許可条件を本番へ移さない。
 */
// 管理者の正本編集と本人申請の表示境界はcontrols。HTMLの初期hiddenも同時更新する。
// 削除すると希望受付/承認/公開の画面が停止するが、シート/原打刻のデータは削除しない。
// 回帰確認: schedule-sheet-authorityと既存schedule系試験。hiddenを認可判定にしない。
(function(global){'use strict';
  const TYPE='TLH_BRIDGE_SCHEDULE',ACTION='bridgeScheduleV1';
  const messages={SCHEDULE_NOT_COLLECTING:'受付状態を更新して確認し直してください。',SCHEDULE_READY:'最新のシフトを表示しました。',SCHEDULE_SAVED:'保存しました。',SCHEDULE_ALREADY_DONE:'保存済みの操作です。最新状態を表示しました。',SCHEDULE_CONSENT_REQUIRED:'変更案を保存しました。本人の同意後に管理者が承認します。',SCHEDULE_INVALID:'日付・時刻・入力内容を確認してください。',SCHEDULE_CHANGED:'確認後に内容が変わりました。更新して確認し直してください。',SCHEDULE_PERMISSION_REQUIRED:'この画面の利用権限がありません。',SCHEDULE_EMPLOYEE_REQUIRED:'有効な従業員登録を確認できません。',SCHEDULE_NOT_OPEN:'この月の状態を更新して確認し直してください。',SCHEDULE_PUBLISHED_LOCKED:'確定済みです。従業員ごとの変更案・変更申請を使ってください。',SCHEDULE_DEADLINE_CLOSED:'通常の希望締切を過ぎています。年休等の申出は別の区分で提出できます。',SCHEDULE_DEADLINE_NOT_REACHED:'希望締切前は確定公開できません。締切設定を確認してください。',SCHEDULE_REQUEST_PENDING:'同じ日・区分の申請が未処理です。先に内容を確認・取消ししてください。',SCHEDULE_OPERATION_REUSED:'操作番号と内容が一致しません。更新して状態を確認してください。',SCHEDULE_WORK_ASSESSMENT_REQUIRED:'用事の勤務算入が未確認です。管理者が分類と根拠を確定してください。',SCHEDULE_REQUIRED_WORK:'会社が指示する用事を勤務対象から外すことはできません。',SCHEDULE_LEAVE_CONFLICT:'全日休暇と勤務予定が重なっています。',SCHEDULE_REVIEW_REQUIRED:'シフト保存先の整合性確認が必要です。手編集せず、管理者へ連絡してください。',SCHEDULE_STORAGE_INVALID:'シフト保存先の構成を確認してください。',SCHEDULE_WRITE_UNAVAILABLE:'保存できませんでした。変更は戻されています。同じ操作で再確認できます。',SCHEDULE_CAPACITY:'対象データが処理上限を超えています。管理者へ連絡してください。',SCHEDULE_UNAVAILABLE:'シフトを取得できませんでした。更新して確認してください。',WRITE_REVIEW_REQUIRED:'原簿の整合性確認が必要です。',ENROLLMENT_BUSY:'他の操作が処理中です。時間を置いて更新してください。'};
  messages.LINE_VERIFY_REJECTED='LINEログインの有効性を確認できません。下のボタンからログインし直してください。';
  Object.assign(messages,{SCHEDULE_SHEET_SOURCE_REQUIRED:'シフトの作成・訂正は正本スプレッドシートで行ってください。',SCHEDULE_SHEET_CONTENT_REQUIRED:'申請・下書きと正本シートの内容が一致しません。シートを確認して取り込み直してください。',SCHEDULE_SHEET_CHANGED:'確認後に正本シートが変わりました。取り込み直してください。',SCHEDULE_SHEET_AUX_REQUIRED:'用事・休暇詳細・共有イベントの入力タブを用意してください。',SCHEDULE_SHEET_FORMAT_REQUIRED:'正本シートの形式を確認してください。',SCHEDULE_SHEET_ROSTER_REQUIRED:'正本シートに全従業員の行が必要です。',SCHEDULE_SHEET_CONFIGURATION_REQUIRED:'正本シートの接続設定を確認してください。',SCHEDULE_SHEET_BINDING_REQUIRED:'入力ファイルの識別設定が必要です。月別シートがないため作成を止めています。設定担当者へ連絡してください。',SCHEDULE_SHEET_BINDING_INVALID:'入力ファイルの店舗識別設定が一致しません。設定担当者へ連絡してください。',SCHEDULE_SHEET_INVALID:'正本シートの入力を確認してください。'});
  const code=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(v),text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
  const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  function validPlan(p){return p&&date(p.day)&&Array.isArray(p.periods)&&p.periods.length<=10&&p.periods.every(q=>time(q.start)&&time(q.end)&&typeof q.endNextDay==='boolean'&&Number.isInteger(q.breakMinutes)&&q.breakMinutes>=0)&&Array.isArray(p.appointments)&&p.appointments.length<=20&&p.appointments.every(q=>text(q.title,200)&&text(q.location,200)&&(!q.start||time(q.start))&&(!q.end||time(q.end))&&typeof q.countsAsWork==='boolean')&&p.leave&&['NONE','PUBLIC_OFF','PAID','OTHER'].includes(p.leave.type)&&text(p.leave.note,500)&&text(p.note,1000)&&(p.publicNote===undefined||text(p.publicNote,1000));}
  function validate(s,month,admin,period){
    if(s?.inputMode!==undefined&&s.inputMode!=='SHEET')return false;
    if(period&&s?.period!==period)return false;
    if(s?.period!==undefined&&!'FIRST SECOND MONTH'.split(' ').includes(s.period))return false;
    const range=global.TlhScheduleView.periodRange(month,s?.period);
    if(s?.rangeStart!==undefined&&(s.rangeStart!==range.start||s.rangeEnd!==range.end))return false;
    // 署名が正しくても別の月/役割/本人のデータなら描画しない。HMACと業務DTO検査は両方必要。
    if(s&&s.publishedAt!==undefined&&!(s.publishedAt===''||s.phase==='PUBLISHED'&&iso(s.publishedAt)))return false;
    if(!s||s.version!==1||s.month!==month||s.admin!==admin||!Number.isSafeInteger(s.monthRevision)||s.monthRevision<0||!['NOT_OPEN','DRAFT','COLLECTING','PUBLISHED'].includes(s.phase)||!(s.deadline===''||iso(s.deadline))||!iso(s.serverNow)||!text(s.employeeCode,32))return false;
    if(s.requestDeadlines!==undefined||s.deadlineRevision!==undefined){
      if(!Number.isSafeInteger(s.deadlineRevision)||s.deadlineRevision<0||!Array.isArray(s.requestDeadlines)||s.requestDeadlines.length>1000)return false;
      let previous=0;for(const r of s.requestDeadlines){if(!r||Object.keys(r).sort().join(',')!=='deadline,endDay,revision,startDay'||!date(r.startDay)||!date(r.endDay)||r.startDay>r.endDay||!iso(r.deadline)||!Number.isSafeInteger(r.revision)||r.revision<=previous||r.revision>s.deadlineRevision)return false;previous=r.revision;}
    }
    if(!Array.isArray(s.employees)||s.employees.length>1000||!s.employees.every(p=>code(p.employeeCode)&&text(p.employeeName,80)&&(!Object.hasOwn(p,'registrationStatus')||['PENDING_LINK','REGISTERED'].includes(p.registrationStatus))))return false;
    for(const key of ['plans','ownPlans','drafts','requests','events','draftEvents'])if(!Array.isArray(s[key])||s[key].length>10000)return false;
    if(!admin&&(s.employees.length||s.drafts.length||s.draftEvents.length))return false;
    const identity=p=>p&&code(p.employeeCode)&&text(p.employeeName,80)&&date(p.day)&&p.day>=range.start&&p.day<=range.end&&Number.isSafeInteger(p.revision)&&p.revision>0;
    if(!s.plans.every(p=>identity(p)&&Array.isArray(p.periods)&&p.periods.length<=10&&p.periods.every(q=>time(q.start)&&time(q.end)&&typeof q.endNextDay==='boolean'&&Number.isInteger(q.breakMinutes)&&q.breakMinutes>=0)&&Array.isArray(p.workIntervals)&&p.workIntervals.every(q=>iso(q.startAtUtc)&&iso(q.endAtUtc))&&(Number.isInteger(p.plannedMinutes)&&p.plannedMinutes>=0||s.inputMode==='SHEET'&&p.plannedMinutes===null&&!p.periods.length&&!p.workIntervals.length&&p.leaveType==='NONE')&&['NONE','PUBLIC_OFF','LEAVE'].includes(p.leaveType)&&(p.publicNote===undefined||text(p.publicNote,1000))))return false;
    if(![...s.ownPlans,...s.drafts].every(p=>identity(p)&&validPlan(p.plan))||!s.ownPlans.every(p=>p.employeeCode===s.employeeCode))return false;
    if(!s.requests.every(r=>r&&/^[-A-Za-z0-9_]{1,100}$/.test(r.requestId)&&code(r.employeeCode)&&text(r.employeeName,80)&&Number.isSafeInteger(r.revision)&&r.revision>0&&['PENDING','APPROVED','REJECTED','CANCELLED','AWAITING_CONSENT'].includes(r.status)&&['SHIFT_PREFERENCE','ANNUAL_LEAVE','STATUTORY_LEAVE','ADMIN_CHANGE'].includes(r.kind)&&r.payload&&validPlan(r.payload.plan)&&r.payload.plan.day>=range.start&&r.payload.plan.day<=range.end&&text(r.payload.reason,500)&&(!r.payload.decisionReason||text(r.payload.decisionReason,500))&&iso(r.submittedAt)&&(!admin?r.employeeCode===s.employeeCode:true)))return false;
    if(s.requests.some(r=>r.payload.sheetPreference!==undefined&&!(s.inputMode==='SHEET'&&r.status==='APPROVED'&&r.kind==='SHIFT_PREFERENCE'&&r.payload.plan.leave.type==='PUBLIC_OFF'&&r.payload.plan.leave.unit==='DAY'&&!r.payload.plan.periods.length&&!r.payload.plan.appointments.length&&r.payload.sheetPreference&&Object.keys(r.payload.sheetPreference).sort().join(',')==='conflict,version'&&r.payload.sheetPreference.version===1&&typeof r.payload.sheetPreference.conflict==='boolean')))return false;
    return [...s.events,...s.draftEvents].every(e=>date(e.day)&&e.day>=range.start&&e.day<=range.end&&text(e.title,200)&&text(e.note,500));
  }
  // 承認結果の定型案内。自由記載やシートURLをHTMLへ差し込まず、検証済みメタデータだけ使う。
  // 希望休の承認と勤務の確定は別。競合しても既存勤務を削除せず、管理者が正本を調整する。
  function preferenceNotice(result){return result.conflict?
    '希望休を承認し、正本シートの非公開備考へ「希望休」「【希望休と競合】」を追記しました。既存のシフト・予定は残しています。スプレッドシートを開いて編集してください。':
    '希望休を承認し、正本シートの非公開備考へ「希望休」を記入しました。勤務欄・確定シフトは変更していません。シフト作成時に確認してください。';}
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
  function related(source,target){for(let i=0;source&&i<6;i++){if(source===target)return true;try{if(source.parent===source)break;source=source.parent;}catch(_e){break;}}return false;}
  /** 両半月を別々に検査し、同じ本人/月/役割/取得時刻の月暦だけ採用する。 */
  function validateMonth(v,month,admin){return !!v&&Object.keys(v).sort().join(',')==='halves,month,version'&&v.version===1&&v.month===month&&v.halves&&Object.keys(v.halves).sort().join(',')==='FIRST,SECOND'&&['FIRST','SECOND'].every(part=>validate(v.halves[part],month,admin,part))&&v.halves.FIRST.employeeCode===v.halves.SECOND.employeeCode&&v.halves.FIRST.inputMode===v.halves.SECOND.inputMode&&v.halves.FIRST.serverNow===v.halves.SECOND.serverNow&&v.halves.FIRST.deadlineRevision===v.halves.SECOND.deadlineRevision&&JSON.stringify(v.halves.FIRST.requestDeadlines)===JSON.stringify(v.halves.SECOND.requestDeadlines);}
  /**
   * シフトのREADで公式認証が拒否された場合の明示的な復帰。通常取得エラーでは起動しない。
   * 単独ページと統合画面で一つのbuttonへ一度だけ登録する。SDK再初期化/独自認可URLは不要。
   * ログインは本人の押下だけ。結果不明の保存中はblockedで遷移を止め、秘密/操作IDを保存しない。
   * 魔改造: 復帰先はorigin+pathnameだけ。query/hash/tokenをコピーせず、退場後の押下も拒否する。
   * 削除すると認証切れから復帰できない。署名/別iframe/連打/離脱/保存結果不明の試験を維持する。
   */
  function createLoginRecovery(options){
    let needed=false,navigating=false,stopped=false;
    const button=options.button;
    function update(){button.hidden=!needed||stopped;button.disabled=stopped||navigating||!!options.blocked?.();}
    button.addEventListener('click',()=>{
      if(!needed||navigating||stopped||options.blocked?.()||global!==global.top)return;
      navigating=true;update();options.changed?.();
      try{
        if(options.liff.isInClient?.()){global.location.assign('https://miniapp.line.me/2011940133-JXUDzLnG');return;}
        if(options.liff.isLoggedIn())options.liff.logout();
        options.liff.login({redirectUri:global.location.origin+global.location.pathname});
      }catch(_e){navigating=false;update();options.failed?.();options.changed?.();}
    });
    global.addEventListener('pagehide',()=>{stopped=true;needed=false;update();});update();
    return Object.freeze({require(){needed=true;button.textContent='LINEでログインし直す';update();options.changed?.();},locked:()=>needed||navigating,update});
  }
  function init(options){
    const ids=['login','scope','availability','month','refresh','status','summary','published-at','calendar','requests','frame','editor','day','employee','leave','note','public-note','reason','kind','periods','appointments','add-period','add-appointment','save','month-form','deadline','event-form','event-day','event-title','event-note','publish','retry'];
    // 同一タブの本人/管理者をIDと返信iframeごと分離。defaultは既存単独ページと互換。
    const byId=id=>document.getElementById(id.replace(/^schedule-/,options.idPrefix||'schedule-'));
    const n=Object.fromEntries(ids.map(k=>[k,byId('schedule-'+k)]));
    const admin=options.audience==='admin',reportUi=options.report===false?{clear(){},setShared(){},setEnabled(){}}:global.TlhScheduleReport.init();let monthSnapshots=null;const isRead=command=>['read','monthRead'].includes(command);let snapshot=null,pending=null,uncertain=null,stopped=false,dirtyEditor=false;const periods=[],appointments=[];
    const login=createLoginRecovery({button:n.login,liff:options.liff,blocked:()=>stopped||!!pending||!!uncertain||!!options.loginBlocked?.(),changed:controls,failed:()=>{n.status.textContent='LINEログインを開始できませんでした。もう一度お試しください。';}});
    function el(tag,value,parent){const e=document.createElement(tag);if(value!==undefined)e.textContent=value;parent?.appendChild(e);return e;}
    // 閲覧は月全体。保存先の半月キー/期待版は対象日から求め、利用者へ選ばせない。
    const wholeMonth=()=>!admin&&options.monthly&&!!monthSnapshots&&n.scope.value!=='MONTH';
    const requestSnapshot=day=>wholeMonth()?monthSnapshots[Number((day||n.day.value).slice(8))>15?'SECOND':'FIRST']:snapshot;
    // 後の期間設定を日付ごとに優先。該当しなければ既存の半月締切へ戻す。
    const deadlineFor=(s,day)=>[...(s.requestDeadlines||[])].reverse().find(r=>r.startDay<=day&&day<=r.endDay)?.deadline??s.deadline;
    function requestNotice(){
      const banner=admin?null:byId('schedule-request-deadline');if(!banner)return;
      const s=requestSnapshot(),deadline=s?deadlineFor(s,n.day.value):'';banner.textContent=!s?'希望休の締切を確認しています。':(n.day.value||s.month)+'の希望締切：'+(deadline?new Date(deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'+(s.phase==='PUBLISHED'?'／確定後の変更申請は随時':Date.parse(s.serverNow)>=Date.parse(deadline)?'／締切済み':''):'未設定。希望を申請できます。締切設定後はその締切に従います。');
    }
    function sharedMonth(){
      const halves=['FIRST','SECOND'].map(k=>monthSnapshots[k]),published=halves.filter(s=>s.phase==='PUBLISHED');
      const unpublishedDays=[];for(const s of halves.filter(s=>s.phase!=='PUBLISHED')){const r=global.TlhScheduleView.periodRange(s.month,s.period);for(let i=Number(r.start.slice(8));i<=Number(r.end.slice(8));i++)unpublishedDays.push(s.month+'-'+String(i).padStart(2,'0'));}
      return{phase:published.length?'PUBLISHED':'NOT_OPEN',month:snapshot.month,period:'MONTH',publishedAt:published.map(s=>s.publishedAt).sort().at(-1)||'',plans:published.flatMap(s=>s.plans),events:published.flatMap(s=>s.events),unpublishedDays};
    }
    function canRequest(){
      const s=requestSnapshot();if(!s)return false;
      if(s.phase==='PUBLISHED')return true;
      // 締切未設定の正規状態だけ受付可。署名拒否/通信失敗/壊れたCOLLECTINGを受付可にしない。
      const deadline=deadlineFor(s,n.day.value);if(['NOT_OPEN','DRAFT'].includes(s.phase)&&deadline==='')return true;
      if(n.kind.value!=='SHIFT_PREFERENCE'||n.leave.value==='PAID')return true;
      return ['NOT_OPEN','DRAFT','COLLECTING'].includes(s.phase)&&Date.parse(s.serverNow)<Date.parse(deadline);
    }
    function controls(){
      // disabledは誤操作防止。操作の権限はGASが毎回決める。通信失敗を許可として扱わない。
      const locked=stopped||login.locked()||!!pending||!!uncertain||!snapshot;
      n.editor.disabled=locked;n['month-form'].disabled=locked;n['event-form'].disabled=locked||!admin;n.publish.disabled=locked||!admin||snapshot?.phase==='PUBLISHED'||snapshot?.phase==='NOT_OPEN'||snapshot?.phase==='DRAFT';
      n.save.disabled=locked||!admin&&!canRequest();
      // 管理者の編集は署名済み旧モードだけ。未確認/失敗/退場では隠し、本人申請とは区別する。
      const sheet=admin&&snapshot?.inputMode==='SHEET',hideAdminEditor=admin&&(!snapshot||sheet);n.editor.hidden=hideAdminEditor;n['event-form'].hidden=!admin||!snapshot||sheet;n.editor.disabled=n.editor.disabled||sheet;n['event-form'].disabled=n['event-form'].disabled||sheet;n.save.disabled=n.save.disabled||sheet;
      if(admin){for(const id of ['schedule-compose','schedule-event-section','schedule-compose-nav']){const node=byId(id);if(node)node.hidden=hideAdminEditor;}const banner=byId('schedule-source-banner');if(banner)banner.hidden=!sheet;}
      n.availability.textContent=locked?'受付状態を確認中、または操作できない状態です。上の通信結果を確認してください。':admin?'下書きの作成・公開・確定後の変更案を操作できます。':canRequest()?(requestSnapshot().phase==='PUBLISHED'?'確定後の変更申請を送信できます。':'希望・申出を送信できます。'):(['NOT_OPEN','DRAFT'].includes(requestSnapshot().phase)&&!iso(deadlineFor(requestSnapshot(),n.day.value))?'受付状態を確認できません。最新状態を読み直してください。':'通常の希望受付は締切済みです。年休等の申出は別の区分で提出できます。');
      if(sheet)n.availability.textContent='シフト・備考・用事・共有イベントは正本シートで編集し、取込み画面で反映します。全日の希望休は、承認時に非公開備考へ「希望休」を自動記入します。既存予定があれば「【希望休と競合】」を併記するため、シートで調整してください。勤務変更・年休等は承認前に申請と同じ内容をシートへ記入してください。';
      n.scope.disabled=stopped||login.locked()||!!pending||!!uncertain;
      // 過去の月全体保存が存在する場合だけ互換入口を出す。通常の月暦へ半月フィルターを戻さない。
      const legacyPicker=byId('schedule-legacy-picker');if(legacyPicker)legacyPicker.hidden=!snapshot||!(snapshot.legacyAvailable||n.scope.value==='MONTH');
      n.month.disabled=stopped||login.locked()||!!pending||!!uncertain;n.refresh.disabled=stopped||login.locked()||!!pending;n.retry.hidden=!uncertain;n.retry.disabled=stopped||!!pending;
      login.update();n.status.setAttribute('aria-busy',String(!!pending));
      reportUi.setEnabled(!locked&&(wholeMonth()?['FIRST','SECOND'].some(k=>monthSnapshots[k].phase==='PUBLISHED'):snapshot?.phase==='PUBLISHED'));requestNotice();
      options.onNavigationLock?.(stopped||!!pending||!!uncertain);
    }
    function clear(){dirtyEditor=false;snapshot=null;monthSnapshots=null;const banner=admin?null:byId('schedule-request-deadline');if(banner)banner.textContent='希望休の締切を確認しています。';reportUi.clear();n.calendar.replaceChildren();n.requests.replaceChildren();n.summary.textContent='';n['published-at'].textContent='';n.employee.replaceChildren();n.reason.value='';n['event-note'].value='';n['event-title'].value='';fill(null);controls();}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function field(parent,label,type,value=''){const l=el('label',label,parent),i=el('input',undefined,l);i.type=type;i.value=value;return i;}
    function select(parent,label,values,value){const l=el('label',label,parent),s=el('select',undefined,l);for(const [v,title]of values){const o=el('option',title,s);o.value=v;}s.value=value;return s;}
    function period(value){
      if(periods.length>=10)return;const row=el('div',undefined,n.periods);row.className='schedule-period';
      const r={row,start:field(row,'出勤','time',value?.start),end:field(row,'退勤','time',value?.end),next:select(row,'退勤日',[['false','当日'],['true','翌日']],String(value?.endNextDay||false)),rest:field(row,'予定休憩（分）','number',String(value?.breakMinutes||0))};r.rest.min='0';r.rest.max='1440';
      const remove=el('button','この区間を外す',row);remove.type='button';remove.className='text-button';remove.addEventListener('click',()=>{if(pending||uncertain||stopped)return;dirtyEditor=true;periods.splice(periods.indexOf(r),1);row.remove();});periods.push(r);
    }
    function appointment(value){
      if(appointments.length>=20)return;const row=el('div',undefined,n.appointments);row.className='schedule-period';
      const r={row,title:field(row,'用事の名称','text',value?.title),location:field(row,'場所','text',value?.location),start:field(row,'開始（任意）','time',value?.start),end:field(row,'終了（任意）','time',value?.end),next:select(row,'終了日',[['false','当日'],['true','翌日']],String(value?.endNextDay||false)),counts:select(row,'勤務への算入',[['true','勤務に含める'],['false','勤務に含めない']],String(value?.countsAsWork??true)),required:select(row,'会社の指示・拘束',[['unknown','未確認'],['true','あり'],['false','なし']],value?.requiredByEmployer===null||value?.requiredByEmployer===undefined?'unknown':String(value.requiredByEmployer)),classification:field(row,'算入判定の根拠','text',value?.classificationReason)};
      const remove=el('button','この用事を外す',row);remove.type='button';remove.className='text-button';remove.addEventListener('click',()=>{if(pending||uncertain||stopped)return;dirtyEditor=true;appointments.splice(appointments.indexOf(r),1);row.remove();});appointments.push(r);
    }
    function fill(p){periods.length=0;appointments.length=0;n.periods.replaceChildren();n.appointments.replaceChildren();n.leave.value=p?.leave.type||(admin?'NONE':'PUBLIC_OFF');n.note.value=p?.note||'';n['public-note'].value=p?.publicNote||'';(p?.periods||[]).forEach(period);(p?.appointments||[]).forEach(appointment);}
    function selected(){return snapshot?.drafts.find(p=>p.employeeCode===n.employee.value&&p.day===n.day.value);}
    function loadEditor(){if(!snapshot||pending||uncertain)return;fill(admin?selected()?.plan:requestSnapshot().ownPlans.find(p=>p.day===n.day.value)?.plan);controls();}
    function inputPlan(){return{periods:periods.map(r=>({start:r.start.value,end:r.end.value,endNextDay:r.next.value==='true',breakMinutes:Number(r.rest.value)})),appointments:appointments.map(r=>({title:r.title.value,location:r.location.value,start:r.start.value,end:r.end.value,endNextDay:r.next.value==='true',countsAsWork:r.counts.value==='true',requiredByEmployer:r.required.value==='unknown'?null:r.required.value==='true',classificationReason:r.classification.value})),leave:{type:n.leave.value,unit:'DAY',minutes:null,note:''},note:n.note.value,...(n['public-note'].value?{publicNote:n['public-note'].value}:{})};}
    // 魔改造: 入力欄追加はfill（読込/消去）・inputPlan（送信）・validPlan（応答検査）を一組で変える。
    // 公開欄ならGASの許可項目と出力列も更新する。入力に足しただけで全員公開しない。
    function planText(p){return(p.periods.map(q=>q.start+'–'+q.end+(q.endNextDay?'（翌日）':'')+' / 休憩'+q.breakMinutes+'分').join('、')||({NONE:'勤務区間なし',PUBLIC_OFF:'公休・休み',PAID:'有給',OTHER:'その他休暇'}[p.leave.type]))+(p.appointments.length?' / 用事: '+p.appointments.map(a=>a.title+' '+a.start+'–'+a.end+(a.countsAsWork?'（勤務に含む）':'（算入外）')).join('、'):'')+(p.publicNote?' / 全員公開: '+p.publicNote:'')+(p.note?' / 非公開メモ: '+p.note:'');}
    function base(source=requestSnapshot()){return{month:n.month.value,...(source?.period?{period:source.period}:n.scope.value?{period:n.scope.value}:{}),audience:options.audience,expectedMonthRevision:source.monthRevision};}
    function requestBase(command,r){return{...base(requestSnapshot(r.payload.plan.day)),requestId:r.requestId,expectedRequestRevision:r.revision};}
    function write(command,input,question){if(stopped||pending||uncertain||!snapshot||!global.confirm(question))return;void send({command,input:JSON.stringify(input),operationId:random(16)});}
    function button(parent,label,command,fields,question){const b=el('button',label,parent);b.type='button';b.addEventListener('click',()=>{if(pending||uncertain||stopped)return;try{write(command,fields(),question);}catch(error){if(error.message!=='CANCELLED')n.status.textContent='入力内容を確認してください。';}});return b;}
    function render(s){
      // 一般化: 一つの保存モデルから複数の画面モデルを作る。管理画面のDOMを印刷へ流用しない。
      // 出力担当へ渡すのは共有plans/eventsだけ。ownPlans/drafts/requestsは渡さない。
      if(monthSnapshots&&s.month===n.month.value&&Object.hasOwn(monthSnapshots,s.period))monthSnapshots[s.period]=s;
      dirtyEditor=false;snapshot=s;n.calendar.replaceChildren();n.requests.replaceChildren();
      reportUi.setShared(wholeMonth()?sharedMonth():{phase:s.phase,month:s.month,publishedAt:s.publishedAt,plans:s.plans,events:s.events,period:s.period,rangeStart:s.rangeStart,rangeEnd:s.rangeEnd});
      // 全員が見ている公開版の更新日。下書き/希望の保存では更新せず、署名済みサーバー時刻をJST表示。
      n['published-at'].textContent=s.publishedAt?'確定シフト 最終更新：'+new Date(s.publishedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})+'（日本時間）':'この月のシフトはまだ確定公開されていません。';
      if(monthSnapshots&&s.period!=='MONTH')n['published-at'].textContent=['FIRST','SECOND'].map((part,i)=>{const current=monthSnapshots[part];return(i?'後半':'前半')+'：'+(current.publishedAt?'最終更新 '+new Date(current.publishedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未公開');}).join(' ｜ ');
      const range=global.TlhScheduleView.periodRange(s.month,wholeMonth()?'MONTH':s.period);
      n.day.min=range.start;n.day.max=range.end;n['event-day'].min=range.start;n['event-day'].max=range.end;
      if(!date(n.day.value)||n.day.value<range.start||n.day.value>range.end)n.day.value=range.start;
      byId('schedule-legacy-option').hidden=!s.legacyAvailable;
      const periodLabel=s.period==='FIRST'?'前半（1〜15日）':s.period==='SECOND'?'後半（16日〜月末）':'月全体（従来データ）';
      const state={NOT_OPEN:'未作成・締切未設定（希望申請可）',DRAFT:'下書き作成中・締切未設定（希望申請可）',COLLECTING:Date.parse(s.serverNow)>=Date.parse(s.deadline)?'初回希望締切済み・下書き作成':'希望受付中・下書き作成',PUBLISHED:'確定公開済み'}[s.phase];n.summary.textContent=s.month+' '+periodLabel+'：'+state+(s.deadline?' / 希望締切 '+new Date(s.deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'');
      // 未認証名簿は管理者の予定対象。本人認可や共有DTOには転用しない。GAS/検査/登録後引継ぎも同期。
      n.employee.replaceChildren();for(const p of s.employees){const o=el('option',p.employeeCode+'（'+p.employeeName+'）'+(p.registrationStatus==='PENDING_LINK'?'［未認証］':''),n.employee);o.value=p.employeeCode;}
      if(admin)n.publish.textContent=(s.period==='FIRST'?'前半（1〜15日）':s.period==='SECOND'?'後半（16日〜月末）':'月全体')+'の下書きを確定公開';
      n.deadline.value=s.deadline?new Date(Date.parse(s.deadline)+32400000).toISOString().slice(0,16):'';
      if(!options.lazyCalendar||byId('schedule-overview')?.open)renderCalendar(s);
      if(wholeMonth()){n.summary.textContent=s.month+' 月間シフト';for(const part of ['FIRST','SECOND'])renderRequests(monthSnapshots[part],true);if(!['FIRST','SECOND'].some(k=>monthSnapshots[k].requests.length))el('p','この月の申請はありません。',n.requests);}else renderRequests(s);
      loadEditor();
      controls();
    }

    /** 日別索引はこの描画中だけ有効。本人用の索引は共有出力へ渡さない。 */
    function renderCalendar(s){
      if(!admin){
        const range=global.TlhScheduleView.periodRange(s.month,s.period),unpublishedDays=[];
        if(s.phase!=='PUBLISHED')for(let i=Number(range.start.slice(8));i<=Number(range.end.slice(8));i++)unpublishedDays.push(s.month+'-'+String(i).padStart(2,'0'));
        const shared=wholeMonth()?sharedMonth():{month:s.month,period:s.period,plans:s.plans,events:s.events,unpublishedDays};
        n.calendar.className='schedule-calendar schedule-month-calendar schedule-matrix-calendar';
        global.TlhScheduleReport.renderMatrix(n.calendar,global.TlhScheduleView.matrix(shared),s.employeeCode);
        el('p','時刻は日本時間。休は予定休憩。勤務日数は表の期間内の勤務予定日数です。斜線は公休です。予定未設定・未公開とは別です。横にスクロールして確認できます。',n.calendar).className='footnote';
        // 本人限定の用事/非公開メモは共有表の外へ。印刷用modelには渡さない。
        const own=monthSnapshots?['FIRST','SECOND'].flatMap(k=>monthSnapshots[k].ownPlans):s.ownPlans;
        if(own.length){const details=el('details',undefined,n.calendar);details.className='tool-help';el('summary','自分の用事・特記事項（本人限定）',details);for(const p of own){if(p.employeeCode!==s.employeeCode)continue;el('h3',p.day,details);el('p',planText(p.plan),details);}}
        return;
      }
      const parts=monthSnapshots&&s.period!=='MONTH'?[monthSnapshots.FIRST,monthSnapshots.SECOND]:[s],range=global.TlhScheduleView.periodRange(s.month,parts.length===2?'MONTH':s.period),first=Number(range.start.slice(8)),count=Number(range.end.slice(8)),source=parts.flatMap(part=>admin?part.drafts:part.plans);
      n.calendar.className='schedule-calendar'+(parts.length===2?' schedule-month-calendar':'');
      const plansByDay=global.TlhScheduleView.groupByDay(source);
      const eventsByDay=global.TlhScheduleView.groupByDay(parts.flatMap(part=>admin?part.draftEvents:part.events));
      const ownByDay=global.TlhScheduleView.groupByDay(parts.flatMap(part=>part.ownPlans));
      for(const name of '日月火水木金土')el('div',name,n.calendar).className='schedule-weekday';
      for(let i=0;i<new Date(range.start+'T00:00:00Z').getUTCDay();i++){const blank=el('div','',n.calendar);blank.className='schedule-blank';blank.setAttribute('aria-hidden','true');}
      n.save.textContent=admin?(s.phase==='PUBLISHED'?'変更案を本人へ送る':'この予定を下書き保存'):'希望・申出を提出する';
      for(let i=first;i<=count;i++){
        const day=s.month+'-'+String(i).padStart(2,'0'),card=el('article',undefined,n.calendar);card.className='schedule-day';const week=new Date(day+'T00:00:00Z').getUTCDay();
        el('h3',i+'日（'+'日月火水木金土'[week]+'）',card);card.dataset.weekday=String(week);
        const events=eventsByDay.get(day)||[];for(const e of events)el('p',e.title+(e.note?' / '+e.note:''),card).className='schedule-event';
        const plans=plansByDay.get(day)||[];if(!plans.length)el('p',admin||(parts.length===2?parts[i<=15?0:1]:s).phase==='PUBLISHED'?'予定未設定':'未公開',card).className='subtle';
        for(const p of plans){const line=el('div',undefined,card);el('strong',p.employeeName+'（'+p.employeeCode+'）',line);
          el('p',admin?planText(p.plan):sharedPlanText(p),line);
          if(!admin&&p.publicNote)el('p','共有事項：'+p.publicNote,line).className='schedule-public-note';
          // 共通のカレンダーへ他人の用事を混ぜない。署名済みの本人限定DTOだけを別の詳細欄へ。
          if(!admin&&p.employeeCode===s.employeeCode){const mine=ownByDay.get(p.day)?.[0];if(mine){const detail=el('details',undefined,line);detail.className='tool-help';el('summary','自分の用事・特記事項',detail);el('p',planText(mine.plan),detail);}}
          if(admin&&s.inputMode!=='SHEET'){const edit=el('button','この予定を編集',line);edit.type='button';edit.className='text-button';edit.addEventListener('click',()=>{if(pending||uncertain)return;n.employee.value=p.employeeCode;n.day.value=p.day;loadEditor();n.day.focus();});}
        }
      }
    }

    /** 共有DTO専用の表示。本人の用事詳細や希望理由をこの関数へ混ぜない。 */
    function sharedPlanText(plan){
      if(plan.plannedMinutes===null)return'予定未設定（勤務時間の計算対象外）';
      const work=global.TlhScheduleView.workText(plan.workIntervals,plan.day);
      const rest=plan.periods.reduce((sum,period)=>sum+period.breakMinutes,0);
      const fallback={PUBLIC_OFF:'公休',LEAVE:'休暇'}[plan.leaveType]||'勤務区間なし';
      return (work||fallback)+' / 予定休憩 '+rest+'分 / 予定実働 '+plan.plannedMinutes+'分';
    }

    /** 申請/同意/承認の操作を表示。ボタン押下時の版検査と保存は従来のwrite/GASへ任せる。 */
    function renderRequests(s,suppressEmpty=false){
      for(const r of s.requests){const card=el('article',undefined,n.requests);card.className='record-item';el('h3',r.employeeName+'（'+r.employeeCode+'） / '+r.payload.plan.day,card);el('p',({SHIFT_PREFERENCE:'希望',ANNUAL_LEAVE:'年休の申出',STATUTORY_LEAVE:'制度上の申出',ADMIN_CHANGE:'管理者からの変更案'}[r.kind])+' / '+({PENDING:'管理者確認待ち',AWAITING_CONSENT:'本人同意待ち',APPROVED:'承認済み',REJECTED:'見送り・同意なし',CANCELLED:'取消済み'}[r.status]),card);el('p',planText(r.payload.plan),card);el('p','理由：'+r.payload.reason,card);if(r.payload.decisionReason)el('p','判断理由：'+r.payload.decisionReason,card);if(r.payload.sheetPreference)el('p',preferenceNotice(r.payload.sheetPreference),card);
        if(admin&&r.status==='PENDING'){
          const reasonLabel=el('label','判断理由',card),reasonField=el('textarea',undefined,reasonLabel);reasonField.maxLength=500;reasonField.rows=2;
          for(const [decision,label]of [['APPROVE','この内容を承認'],['REJECT','見送りを記録']]){
            const action=button(card,label,'review',()=>{const reason=reasonField.value;if(!reason.trim()){reasonField.focus();throw Error('REASON_REQUIRED');}const current=s.drafts.find(p=>p.employeeCode===r.employeeCode&&p.day===r.payload.plan.day);return{...requestBase('review',r),expectedPlanRevision:s.phase==='PUBLISHED'?s.monthRevision:current?.revision||0,decision,reason};},r.employeeName+' / '+r.payload.plan.day+'\n'+planText(r.payload.plan)+'\n'+(decision==='APPROVE'&&s.inputMode==='SHEET'&&r.kind==='SHIFT_PREFERENCE'&&r.payload.plan.leave.type==='PUBLIC_OFF'&&r.payload.plan.leave.unit==='DAY'&&!r.payload.plan.periods.length&&!r.payload.plan.appointments.length?'希望休を非公開備考へ記入します。既存の勤務・予定は残し、競合する場合はシートでの編集が必要です。承認中は対象セルを編集しないでください。\n':'')+label+'しますか？');
            if(decision==='REJECT')action.className='schedule-reject';
          }
        }
        if(!admin&&r.status==='PENDING'&&r.kind!=='ADMIN_CHANGE')button(card,'この申請を取り消す','cancel',()=>requestBase('cancel',r),'この未処理申請を取り消しますか？確定予定は変更しません。');
        if(!admin&&r.status==='AWAITING_CONSENT')for(const accept of [true,false])button(card,accept?'この変更案に同意する':'同意しない','consent',()=>({...requestBase('consent',r),accept}),planText(r.payload.plan)+'\n'+(accept?'この変更内容に同意しますか？管理者の承認後に反映します。':'同意しないと回答しますか？'));
      }
      if(!suppressEmpty&&!s.requests.length)el('p','この期間の申請はありません。',n.requests);
    }
    async function send(request){
      // 保存前に内容をJSON文字列へ固定。同じ操作の再確認では編集後の入力や新しいoperationIdを使わない。
      // 「返信がない」は「未保存」とは限らない。未確定結果を自動再送すると二重登録の原因になる。
      if(pending||stopped||login.locked())return;
      if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      const proof=options.liff.getIDToken();if(typeof proof!=='string'||!proof){if(isRead(request.command))login.require();clear();n.status.textContent='LINEログインが必要です。';return;}
      const r={...request,nonce:random(16),key:random(32)};pending=r;if(isRead(r.command))clear();controls();n.status.textContent='通信中です。';
      const unknown=()=>{if(pending!==r)return;if(!isRead(r.command))uncertain={command:r.command,input:r.input,operationId:r.operationId};n.status.textContent=isRead(r.command)?'取得できませんでした。更新してください。':'保存結果を確認できません。更新で状態を見るか、同じ操作で結果を再確認してください。';finish();};r.timer=setTimeout(unknown,30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target=options.frameName||'tlhScheduleFrame';form.hidden=true;
      Object.entries({action:ACTION,command:r.command,input:r.input,operationId:r.operationId,idToken:proof,nonce:r.nonce,responseKey:r.key}).forEach(([name,value])=>{const i=document.createElement('input');i.type='hidden';i.name=name;i.value=value;form.appendChild(i);});document.body.appendChild(form);try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){unknown();}finally{form.remove();}
    }
    async function read(){if(pending||uncertain||stopped||login.locked())return;const monthly=options.monthly&&n.scope.value!=='MONTH';await send({command:monthly?'monthRead':'read',input:JSON.stringify({month:n.month.value,...(!monthly&&n.scope.value?{period:n.scope.value}:{}),audience:options.audience}),operationId:''});}
    global.addEventListener('message',async event=>{
      const r=pending,d=event.data;if(!r||stopped||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      if(!d||d.type!==TYPE||d.action!==ACTION||d.command!==r.command||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||typeof d.data!=='string'||d.data.length>1500000||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return;
      let ok=false;try{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.key),{name:'HMAC',hash:'SHA-256'},false,['verify']);ok=await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),v=>parseInt(v,16)),enc.encode([TYPE,ACTION,d.command,d.nonce,d.code,d.data].join('\n')));}catch(_e){}if(!ok||pending!==r||stopped)return;
      if(d.code==='LINE_VERIFY_REJECTED'){if(!isRead(r.command)||d.data!=='')return;finish();clear();login.require();n.status.textContent=messages.LINE_VERIFY_REJECTED;return;}
      let value=null;if(d.data){try{value=JSON.parse(d.data);}catch(_e){return;}const expected=JSON.parse(r.input);if(r.command==='monthRead'){if(!validateMonth(value,expected.month,admin))return;monthSnapshots=value.halves;value=monthSnapshots[n.scope.value]||monthSnapshots.FIRST;}else if(!validate(value,expected.month,admin,expected.period))return;}
      if(['SCHEDULE_READY','SCHEDULE_SAVED','SCHEDULE_ALREADY_DONE','SCHEDULE_CONSENT_REQUIRED'].includes(d.code)&&!value)return;
      if(value){if(!isRead(r.command))uncertain=null;finish();render(value);}else{
        if(!isRead(r.command))uncertain=['SCHEDULE_UNAVAILABLE','SCHEDULE_REVIEW_REQUIRED'].includes(d.code)?{command:r.command,input:r.input,operationId:r.operationId}:null;
        clear();finish();
      }
      if(!isRead(r.command)&&value&&['SCHEDULE_SAVED','SCHEDULE_ALREADY_DONE','SCHEDULE_CONSENT_REQUIRED'].includes(d.code))options.onSaved?.();
      const reviewed=admin&&r.command==='review'&&value&&['SCHEDULE_SAVED','SCHEDULE_ALREADY_DONE'].includes(d.code)?value.requests.find(item=>item.requestId===JSON.parse(r.input).requestId&&item.status==='APPROVED'&&item.payload.sheetPreference):null;
      n.status.textContent=d.code==='SCHEDULE_PERMISSION_REQUIRED'&&!admin?'希望の提出には有効な従業員登録が必要です。管理者に登録・LINE紐付け・利用状態を確認してください。':reviewed?preferenceNotice(reviewed.payload.sheetPreference):messages[d.code];
    });
    n.refresh.addEventListener('click',()=>void read());n.month.addEventListener('change',()=>{if(!pending&&!uncertain){if(options.onMonthChange)options.onMonthChange();else void read();}});n.retry.addEventListener('click',()=>{if(uncertain&&!pending)void send({...uncertain});});
    n.scope.addEventListener('change',()=>{if(pending||uncertain)return;if(monthSnapshots&&Object.hasOwn(monthSnapshots,n.scope.value)&&monthSnapshots.FIRST.month===n.month.value)render(monthSnapshots[n.scope.value]);else void read();});
    // 自動再取得で未送信の希望を消さないための表示側だけのdirty状態。Storageや保存判定には使わない。
    n.editor.addEventListener('input',()=>{dirtyEditor=true;});n.editor.addEventListener('change',()=>{dirtyEditor=true;});
    n.kind.addEventListener('change',controls);n.leave.addEventListener('change',controls);
    n.day.addEventListener('change',loadEditor);n.employee.addEventListener('change',loadEditor);n['add-period'].addEventListener('click',()=>{if(snapshot&&!pending&&!uncertain){period();dirtyEditor=true;}});n['add-appointment'].addEventListener('click',()=>{if(snapshot&&!pending&&!uncertain){appointment();dirtyEditor=true;}});
    n.save.addEventListener('click',()=>{
      if(!snapshot||pending||uncertain||!admin&&!canRequest())return;const plan=inputPlan(),input={...base(),day:n.day.value,plan,reason:n.reason.value};
      if(!date(input.day)||input.day<n.day.min||input.day>n.day.max){n.status.textContent='選択中の期間に含まれる日付を入力してください。';n.day.focus();return;}
      if((!admin||snapshot.phase==='PUBLISHED')&&!input.reason.trim()){n.status.textContent='希望・変更の理由を入力してください。';n.reason.focus();return;}
      if(plan.periods.some(p=>!time(p.start)||!time(p.end)||!Number.isInteger(p.breakMinutes)||p.breakMinutes<0)){n.status.textContent='勤務区間の出退勤時刻と予定休憩を確認してください。';return;}
      if(plan.leave.type!=='NONE'&&(plan.periods.length||plan.appointments.some(p=>p.countsAsWork))){n.status.textContent='全日の休暇と勤務を同時に指定できません。勤務区間と用事の算入を確認してください。';return;}
      if(admin){input.employeeCode=n.employee.value;input.expectedPlanRevision=snapshot.phase==='PUBLISHED'?snapshot.monthRevision:selected()?.revision||0;write('plan',input,'対象：'+n.employee.value+' / '+input.day+'\n'+(snapshot.phase==='PUBLISHED'?'変更案を本人へ送り、同意を確認します。':'この日の予定を下書き保存します。')+'\n続けますか？');}
      else{input.kind=n.kind.value;if(requestSnapshot().deadlineRevision!==undefined)input.expectedDeadlineRevision=requestSnapshot().deadlineRevision;input.expectedPlanRevision=requestSnapshot().phase==='PUBLISHED'?requestSnapshot().monthRevision:0;write('request',input,input.day+' の希望・申出を提出します。提出だけでは予定は確定しません。続けますか？');}
    });
    byId('schedule-month-save').addEventListener('click',()=>{if(!snapshot)return;let deadline;try{deadline=new Date(n.deadline.value+':00+09:00').toISOString();}catch(_e){n.status.textContent='締切日時を入力してください。';return;}write('month',{...base(),deadline},'選択中の期間の希望受付と締切を設定しますか？');});
    byId('schedule-event-save').addEventListener('click',()=>{if(!snapshot)return;write('event',{...base(),day:n['event-day'].value,title:n['event-title'].value,note:n['event-note'].value,expectedEventRevision:snapshot.draftEvents.find(e=>e.day===n['event-day'].value)?.revision||0},'営業上のイベントを下書き保存しますか？個人の用事は予定の用事欄へ入力してください。');});
    n.publish.addEventListener('click',()=>{if(snapshot)write('publish',base(),global.TlhScheduleView.periodRange(snapshot.month,snapshot.period).start+'〜'+global.TlhScheduleView.periodRange(snapshot.month,snapshot.period).end+' の下書きを全員へ確定公開します。未設定の日は未設定のままです。内容を確認しましたか？');});
    global.addEventListener('pagehide',()=>{stopped=true;uncertain=null;finish();clear();n.reason.value='';n.note.value='';n.periods.replaceChildren();n.appointments.replaceChildren();periods.length=0;appointments.length=0;});
    if(options.lazyCalendar){const overview=byId('schedule-overview');overview?.addEventListener('toggle',()=>{if(overview.open&&snapshot)renderCalendar(snapshot);else n.calendar.replaceChildren();});}
    if(options.monthly&&!n.scope.value)n.scope.value='FIRST';
    controls();return Object.freeze({read,hasUnsavedInput(){return dirtyEditor||!!pending||!!uncertain;}});
  }
  global.TlhSchedule=Object.freeze({init,validate,validateMonth,validatePlan:validPlan,createLoginRecovery});
  if(document.currentScript?.dataset.bootstrap==='true')global.addEventListener('DOMContentLoaded',async()=>{
    const login=document.getElementById('schedule-login'),status=document.getElementById('schedule-status');
    try{global.TlhAutoRead.init();await global.liff.init({liffId:'2011940133-JXUDzLnG'});if(!global.liff.isLoggedIn()){createLoginRecovery({button:login,liff:global.liff,failed:()=>{status.textContent='LINEログインを開始できませんでした。';}}).require();status.textContent='LINEログインが必要です。';status.setAttribute('aria-busy','false');return;}
      document.getElementById('schedule-month').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
      document.getElementById('schedule-scope').value='FIRST';
      const ui=init({gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec',liff:global.liff,audience:document.body.dataset.audience,monthly:true});await ui.read();
    }catch(_e){status.textContent='接続を開始できません。LINEから開き直してください。';status.setAttribute('aria-busy','false');}
  });
})(window);
