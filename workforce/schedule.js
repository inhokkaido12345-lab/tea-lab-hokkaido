/**
 * シフト画面のcontroller。HTML→入力snapshot→既存GASの署名返信→カレンダー/本人限定申請。
 * 削除影響: シフト画面だけ停止。打刻/共通Account/保存済みの予定は残る。
 * 概念: state→DTO検査→textContent描画、single flight、immutable retry、版の競合検知。
 * 改造: command/DTO/署名順はBridgeSchedule/Serviceと同期。認可と勤務時間計算はGAS側。
 * 境界: 理由/時刻/token/応答鍵をURL・Storage・ログへ置かない。返信元frame/HMACの両方を検査。
 * 検証: schedule-ui.test.mjsと実Service連結。見本の許可条件を本番へ移さない。
 */
(function(global){'use strict';
  const TYPE='TLH_BRIDGE_SCHEDULE',ACTION='bridgeScheduleV1';
  const messages={SCHEDULE_NOT_COLLECTING:'この月は下書き作成中です。通常の希望受付はまだ開始していません。',SCHEDULE_READY:'最新のシフトを表示しました。',SCHEDULE_SAVED:'保存しました。',SCHEDULE_ALREADY_DONE:'保存済みの操作です。最新状態を表示しました。',SCHEDULE_CONSENT_REQUIRED:'変更案を保存しました。本人の同意後に管理者が承認します。',SCHEDULE_INVALID:'日付・時刻・入力内容を確認してください。',SCHEDULE_CHANGED:'確認後に内容が変わりました。更新して確認し直してください。',SCHEDULE_PERMISSION_REQUIRED:'この画面の利用権限がありません。',SCHEDULE_EMPLOYEE_REQUIRED:'有効な従業員登録を確認できません。',SCHEDULE_NOT_OPEN:'管理者がこの月の希望受付を設定してください。',SCHEDULE_PUBLISHED_LOCKED:'確定済みです。従業員ごとの変更案・変更申請を使ってください。',SCHEDULE_DEADLINE_CLOSED:'通常の希望締切を過ぎています。年休等の申出は別の区分で提出できます。',SCHEDULE_DEADLINE_NOT_REACHED:'希望締切前は確定公開できません。締切設定を確認してください。',SCHEDULE_REQUEST_PENDING:'同じ日・区分の申請が未処理です。先に内容を確認・取消ししてください。',SCHEDULE_OPERATION_REUSED:'操作番号と内容が一致しません。更新して状態を確認してください。',SCHEDULE_WORK_ASSESSMENT_REQUIRED:'用事の勤務算入が未確認です。管理者が分類と根拠を確定してください。',SCHEDULE_REQUIRED_WORK:'会社が指示する用事を勤務対象から外すことはできません。',SCHEDULE_LEAVE_CONFLICT:'全日休暇と勤務予定が重なっています。',SCHEDULE_REVIEW_REQUIRED:'シフト保存先の整合性確認が必要です。手編集せず、管理者へ連絡してください。',SCHEDULE_STORAGE_INVALID:'シフト保存先の構成を確認してください。',SCHEDULE_WRITE_UNAVAILABLE:'保存できませんでした。変更は戻されています。同じ操作で再確認できます。',SCHEDULE_CAPACITY:'対象データが処理上限を超えています。管理者へ連絡してください。',SCHEDULE_UNAVAILABLE:'シフトを取得できませんでした。更新して確認してください。',WRITE_REVIEW_REQUIRED:'原簿の整合性確認が必要です。',ENROLLMENT_BUSY:'他の操作が処理中です。時間を置いて更新してください。'};
  const code=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(v),text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
  const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  function validPlan(p){return p&&date(p.day)&&Array.isArray(p.periods)&&p.periods.length<=10&&p.periods.every(q=>time(q.start)&&time(q.end)&&typeof q.endNextDay==='boolean'&&Number.isInteger(q.breakMinutes)&&q.breakMinutes>=0)&&Array.isArray(p.appointments)&&p.appointments.length<=20&&p.appointments.every(q=>text(q.title,200)&&text(q.location,200)&&(!q.start||time(q.start))&&(!q.end||time(q.end))&&typeof q.countsAsWork==='boolean')&&p.leave&&['NONE','PUBLIC_OFF','PAID','OTHER'].includes(p.leave.type)&&text(p.leave.note,500)&&text(p.note,1000)&&(p.publicNote===undefined||text(p.publicNote,1000));}
  function validate(s,month,admin){
    // 署名が正しくても別の月/役割/本人のデータなら描画しない。HMACと業務DTO検査は両方必要。
    if(s&&s.publishedAt!==undefined&&!(s.publishedAt===''||s.phase==='PUBLISHED'&&iso(s.publishedAt)))return false;
    if(!s||s.version!==1||s.month!==month||s.admin!==admin||!Number.isSafeInteger(s.monthRevision)||s.monthRevision<0||!['NOT_OPEN','DRAFT','COLLECTING','PUBLISHED'].includes(s.phase)||!(s.deadline===''||iso(s.deadline))||!iso(s.serverNow)||!text(s.employeeCode,32))return false;
    if(!Array.isArray(s.employees)||s.employees.length>1000||!s.employees.every(p=>code(p.employeeCode)&&text(p.employeeName,80)))return false;
    for(const key of ['plans','ownPlans','drafts','requests','events','draftEvents'])if(!Array.isArray(s[key])||s[key].length>10000)return false;
    if(!admin&&(s.employees.length||s.drafts.length||s.draftEvents.length))return false;
    const identity=p=>p&&code(p.employeeCode)&&text(p.employeeName,80)&&date(p.day)&&p.day.startsWith(month+'-')&&Number.isSafeInteger(p.revision)&&p.revision>0;
    if(!s.plans.every(p=>identity(p)&&Array.isArray(p.periods)&&p.periods.length<=10&&p.periods.every(q=>time(q.start)&&time(q.end)&&typeof q.endNextDay==='boolean'&&Number.isInteger(q.breakMinutes)&&q.breakMinutes>=0)&&Array.isArray(p.workIntervals)&&p.workIntervals.every(q=>iso(q.startAtUtc)&&iso(q.endAtUtc))&&Number.isInteger(p.plannedMinutes)&&p.plannedMinutes>=0&&['NONE','PUBLIC_OFF','LEAVE'].includes(p.leaveType)&&(p.publicNote===undefined||text(p.publicNote,1000))))return false;
    if(![...s.ownPlans,...s.drafts].every(p=>identity(p)&&validPlan(p.plan))||!s.ownPlans.every(p=>p.employeeCode===s.employeeCode))return false;
    if(!s.requests.every(r=>r&&/^[-A-Za-z0-9_]{1,100}$/.test(r.requestId)&&code(r.employeeCode)&&text(r.employeeName,80)&&Number.isSafeInteger(r.revision)&&r.revision>0&&['PENDING','APPROVED','REJECTED','CANCELLED','AWAITING_CONSENT'].includes(r.status)&&['SHIFT_PREFERENCE','ANNUAL_LEAVE','STATUTORY_LEAVE','ADMIN_CHANGE'].includes(r.kind)&&r.payload&&validPlan(r.payload.plan)&&text(r.payload.reason,500)&&(!r.payload.decisionReason||text(r.payload.decisionReason,500))&&iso(r.submittedAt)&&(!admin?r.employeeCode===s.employeeCode:true)))return false;
    return [...s.events,...s.draftEvents].every(e=>date(e.day)&&e.day.startsWith(month+'-')&&text(e.title,200)&&text(e.note,500));
  }
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
  function related(source,target){for(let i=0;source&&i<6;i++){if(source===target)return true;try{if(source.parent===source)break;source=source.parent;}catch(_e){break;}}return false;}
  function init(options){
    const ids=['month','refresh','status','summary','published-at','calendar','requests','frame','editor','day','employee','leave','note','public-note','reason','kind','periods','appointments','add-period','add-appointment','save','month-form','deadline','event-form','event-day','event-title','event-note','publish','retry'];
    const n=Object.fromEntries(ids.map(k=>[k,document.getElementById('schedule-'+k)]));
    const admin=options.audience==='admin',reportUi=global.TlhScheduleReport.init();let snapshot=null,pending=null,uncertain=null,stopped=false;const periods=[],appointments=[];
    function el(tag,value,parent){const e=document.createElement(tag);if(value!==undefined)e.textContent=value;parent?.appendChild(e);return e;}
    function controls(){
      // disabledは誤操作防止。操作の権限はGASが毎回決める。通信失敗を許可として扱わない。
      const locked=stopped||!!pending||!!uncertain||!snapshot;
      n.editor.disabled=locked||!admin&&snapshot?.phase==='NOT_OPEN';n['month-form'].disabled=locked;n['event-form'].disabled=locked||!admin;n.publish.disabled=locked||!admin||snapshot?.phase==='PUBLISHED'||snapshot?.phase==='NOT_OPEN'||snapshot?.phase==='DRAFT';
      n.month.disabled=stopped||!!pending||!!uncertain;n.refresh.disabled=stopped||!!pending;n.retry.hidden=!uncertain;n.retry.disabled=stopped||!!pending;
      n.status.setAttribute('aria-busy',String(!!pending));
      reportUi.setEnabled(!locked&&snapshot?.phase==='PUBLISHED');
    }
    function clear(){snapshot=null;reportUi.clear();n.calendar.replaceChildren();n.requests.replaceChildren();n.summary.textContent='';n['published-at'].textContent='';n.employee.replaceChildren();n.reason.value='';n['event-note'].value='';n['event-title'].value='';fill(null);controls();}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function field(parent,label,type,value=''){const l=el('label',label,parent),i=el('input',undefined,l);i.type=type;i.value=value;return i;}
    function select(parent,label,values,value){const l=el('label',label,parent),s=el('select',undefined,l);for(const [v,title]of values){const o=el('option',title,s);o.value=v;}s.value=value;return s;}
    function period(value){
      if(periods.length>=10)return;const row=el('div',undefined,n.periods);row.className='schedule-period';
      const r={row,start:field(row,'出勤','time',value?.start),end:field(row,'退勤','time',value?.end),next:select(row,'退勤日',[['false','当日'],['true','翌日']],String(value?.endNextDay||false)),rest:field(row,'予定休憩（分）','number',String(value?.breakMinutes||0))};r.rest.min='0';r.rest.max='1440';
      const remove=el('button','この区間を外す',row);remove.type='button';remove.className='text-button';remove.addEventListener('click',()=>{if(pending||uncertain||stopped)return;periods.splice(periods.indexOf(r),1);row.remove();});periods.push(r);
    }
    function appointment(value){
      if(appointments.length>=20)return;const row=el('div',undefined,n.appointments);row.className='schedule-period';
      const r={row,title:field(row,'用事の名称','text',value?.title),location:field(row,'場所','text',value?.location),start:field(row,'開始（任意）','time',value?.start),end:field(row,'終了（任意）','time',value?.end),next:select(row,'終了日',[['false','当日'],['true','翌日']],String(value?.endNextDay||false)),counts:select(row,'勤務への算入',[['true','勤務に含める'],['false','勤務に含めない']],String(value?.countsAsWork??true)),required:select(row,'会社の指示・拘束',[['unknown','未確認'],['true','あり'],['false','なし']],value?.requiredByEmployer===null||value?.requiredByEmployer===undefined?'unknown':String(value.requiredByEmployer)),classification:field(row,'算入判定の根拠','text',value?.classificationReason)};
      const remove=el('button','この用事を外す',row);remove.type='button';remove.className='text-button';remove.addEventListener('click',()=>{if(pending||uncertain||stopped)return;appointments.splice(appointments.indexOf(r),1);row.remove();});appointments.push(r);
    }
    function fill(p){periods.length=0;appointments.length=0;n.periods.replaceChildren();n.appointments.replaceChildren();n.leave.value=p?.leave.type||(admin?'NONE':'PUBLIC_OFF');n.note.value=p?.note||'';n['public-note'].value=p?.publicNote||'';(p?.periods||[]).forEach(period);(p?.appointments||[]).forEach(appointment);}
    function selected(){return snapshot?.drafts.find(p=>p.employeeCode===n.employee.value&&p.day===n.day.value);}
    function loadEditor(){if(!snapshot||pending||uncertain)return;fill(admin?selected()?.plan:snapshot.ownPlans.find(p=>p.day===n.day.value)?.plan);}
    function inputPlan(){return{periods:periods.map(r=>({start:r.start.value,end:r.end.value,endNextDay:r.next.value==='true',breakMinutes:Number(r.rest.value)})),appointments:appointments.map(r=>({title:r.title.value,location:r.location.value,start:r.start.value,end:r.end.value,endNextDay:r.next.value==='true',countsAsWork:r.counts.value==='true',requiredByEmployer:r.required.value==='unknown'?null:r.required.value==='true',classificationReason:r.classification.value})),leave:{type:n.leave.value,unit:'DAY',minutes:null,note:''},note:n.note.value,...(n['public-note'].value?{publicNote:n['public-note'].value}:{})};}
    // 魔改造: 入力欄追加はfill（読込/消去）・inputPlan（送信）・validPlan（応答検査）を一組で変える。
    // 公開欄ならGASの許可項目と出力列も更新する。入力に足しただけで全員公開しない。
    function planText(p){return(p.periods.map(q=>q.start+'–'+q.end+(q.endNextDay?'（翌日）':'')+' / 休憩'+q.breakMinutes+'分').join('、')||({NONE:'勤務区間なし',PUBLIC_OFF:'公休・休み',PAID:'有給',OTHER:'その他休暇'}[p.leave.type]))+(p.appointments.length?' / 用事: '+p.appointments.map(a=>a.title+' '+a.start+'–'+a.end+(a.countsAsWork?'（勤務に含む）':'（算入外）')).join('、'):'')+(p.publicNote?' / 全員公開: '+p.publicNote:'')+(p.note?' / 非公開メモ: '+p.note:'');}
    function base(){return{month:n.month.value,audience:options.audience,expectedMonthRevision:snapshot.monthRevision};}
    function requestBase(command,r){return{...base(),requestId:r.requestId,expectedRequestRevision:r.revision};}
    function write(command,input,question){if(stopped||pending||uncertain||!snapshot||!global.confirm(question))return;void send({command,input:JSON.stringify(input),operationId:random(16)});}
    function button(parent,label,command,fields,question){const b=el('button',label,parent);b.type='button';b.addEventListener('click',()=>{if(pending||uncertain||stopped)return;try{write(command,fields(),question);}catch(error){if(error.message!=='CANCELLED')n.status.textContent='入力内容を確認してください。';}});return b;}
    function render(s){
      // 一般化: 一つの保存モデルから複数の画面モデルを作る。管理画面のDOMを印刷へ流用しない。
      // 出力担当へ渡すのは共有plans/eventsだけ。ownPlans/drafts/requestsは渡さない。
      snapshot=s;n.calendar.replaceChildren();n.requests.replaceChildren();
      reportUi.setShared({phase:s.phase,month:s.month,publishedAt:s.publishedAt,plans:s.plans,events:s.events});
      // 全員が見ている公開版の更新日。下書き/希望の保存では更新せず、署名済みサーバー時刻をJST表示。
      n['published-at'].textContent=s.publishedAt?'確定シフト 最終更新：'+new Date(s.publishedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})+'（日本時間）':'この月のシフトはまだ確定公開されていません。';
      const state={NOT_OPEN:'未作成（希望受付前でも下書き作成できます）',DRAFT:'下書き作成中・希望受付は未開始',COLLECTING:Date.parse(s.serverNow)>=Date.parse(s.deadline)?'初回希望締切済み・下書き作成':'希望受付中・下書き作成',PUBLISHED:'確定公開済み'}[s.phase];n.summary.textContent=s.month+'：'+state+(s.deadline?' / 初回希望締切 '+new Date(s.deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'');
      n.employee.replaceChildren();for(const p of s.employees){const o=el('option',p.employeeCode+'（'+p.employeeName+'）',n.employee);o.value=p.employeeCode;}
      if(s.deadline)n.deadline.value=new Date(Date.parse(s.deadline)+32400000).toISOString().slice(0,16);
      const count=new Date(Date.UTC(Number(s.month.slice(0,4)),Number(s.month.slice(5)),0)).getUTCDate(),source=admin?s.drafts:s.plans;
      for(const name of '日月火水木金土')el('div',name,n.calendar).className='schedule-weekday';
      for(let i=0;i<new Date(s.month+'-01T00:00:00Z').getUTCDay();i++){const blank=el('div','',n.calendar);blank.className='schedule-blank';blank.setAttribute('aria-hidden','true');}
      n.save.textContent=admin?(s.phase==='PUBLISHED'?'変更案を本人へ送る':'この予定を下書き保存'):'希望・申出を提出する';
      for(let i=1;i<=count;i++){
        const day=s.month+'-'+String(i).padStart(2,'0'),card=el('article',undefined,n.calendar);card.className='schedule-day';const week=new Date(day+'T00:00:00Z').getUTCDay();
        el('h3',i+'日（'+'日月火水木金土'[week]+'）',card);card.dataset.weekday=String(week);
        const events=(admin?s.draftEvents:s.events).filter(e=>e.day===day);for(const e of events)el('p',e.title+(e.note?' / '+e.note:''),card).className='schedule-event';
        const plans=source.filter(p=>p.day===day);if(!plans.length)el('p','予定未設定',card).className='subtle';
        for(const p of plans){const line=el('div',undefined,card);el('strong',p.employeeName+'（'+p.employeeCode+'）',line);
          const local=iso=>new Date(Date.parse(iso)+32400000).toISOString();
          el('p',admin?planText(p.plan):(p.workIntervals.map(q=>local(q.startAtUtc).slice(11,16)+'–'+local(q.endAtUtc).slice(11,16)+(local(q.endAtUtc).slice(0,10)!==p.day?'（翌日）':'')).join('、')||(p.leaveType==='PUBLIC_OFF'?'公休':p.leaveType==='LEAVE'?'休暇':'勤務区間なし'))+' / 予定休憩 '+p.periods.reduce((sum,q)=>sum+q.breakMinutes,0)+'分 / 予定実働 '+p.plannedMinutes+'分',line);
          if(!admin&&p.publicNote)el('p','共有事項：'+p.publicNote,line).className='schedule-public-note';
          // 共通のカレンダーへ他人の用事を混ぜない。署名済みの本人限定DTOだけを別の詳細欄へ。
          if(!admin&&p.employeeCode===s.employeeCode){const mine=s.ownPlans.find(q=>q.day===p.day);if(mine){const detail=el('details',undefined,line);detail.className='tool-help';el('summary','自分の用事・特記事項',detail);el('p',planText(mine.plan),detail);}}
          if(admin){const edit=el('button','この予定を編集',line);edit.type='button';edit.className='text-button';edit.addEventListener('click',()=>{if(pending||uncertain)return;n.employee.value=p.employeeCode;n.day.value=p.day;loadEditor();n.day.focus();});}
        }
      }
      for(const r of s.requests){const card=el('article',undefined,n.requests);card.className='record-item';el('h3',r.employeeName+'（'+r.employeeCode+'） / '+r.payload.plan.day,card);el('p',({SHIFT_PREFERENCE:'希望',ANNUAL_LEAVE:'年休の申出',STATUTORY_LEAVE:'制度上の申出',ADMIN_CHANGE:'管理者からの変更案'}[r.kind])+' / '+({PENDING:'管理者確認待ち',AWAITING_CONSENT:'本人同意待ち',APPROVED:'承認済み',REJECTED:'見送り・同意なし',CANCELLED:'取消済み'}[r.status]),card);el('p',planText(r.payload.plan),card);el('p','理由：'+r.payload.reason,card);if(r.payload.decisionReason)el('p','判断理由：'+r.payload.decisionReason,card);
        if(admin&&r.status==='PENDING'){
          const reasonLabel=el('label','判断理由',card),reasonField=el('textarea',undefined,reasonLabel);reasonField.maxLength=500;reasonField.rows=2;
          for(const [decision,label]of [['APPROVE','この内容を承認'],['REJECT','見送りを記録']]){
            const action=button(card,label,'review',()=>{const reason=reasonField.value;if(!reason.trim()){reasonField.focus();throw Error('REASON_REQUIRED');}const current=s.drafts.find(p=>p.employeeCode===r.employeeCode&&p.day===r.payload.plan.day);return{...requestBase('review',r),expectedPlanRevision:s.phase==='PUBLISHED'?s.monthRevision:current?.revision||0,decision,reason};},r.employeeName+' / '+r.payload.plan.day+'\n'+planText(r.payload.plan)+'\n'+label+'しますか？');
            if(decision==='REJECT')action.className='schedule-reject';
          }
        }
        if(!admin&&r.status==='PENDING'&&r.kind!=='ADMIN_CHANGE')button(card,'この申請を取り消す','cancel',()=>requestBase('cancel',r),'この未処理申請を取り消しますか？確定予定は変更しません。');
        if(!admin&&r.status==='AWAITING_CONSENT')for(const accept of [true,false])button(card,accept?'この変更案に同意する':'同意しない','consent',()=>({...requestBase('consent',r),accept}),planText(r.payload.plan)+'\n'+(accept?'この変更内容に同意しますか？管理者の承認後に反映します。':'同意しないと回答しますか？'));
      }
      if(!s.requests.length)el('p','この月の申請はありません。',n.requests);loadEditor();controls();
    }
    async function send(request){
      // 保存前に内容をJSON文字列へ固定。同じ操作の再確認では編集後の入力や新しいoperationIdを使わない。
      // 「返信がない」は「未保存」とは限らない。未確定結果を自動再送すると二重登録の原因になる。
      if(pending||stopped)return;
      if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      const proof=options.liff.getIDToken();if(typeof proof!=='string'||!proof){clear();n.status.textContent='LINEログインが必要です。';return;}
      const r={...request,nonce:random(16),key:random(32)};pending=r;if(r.command==='read')clear();controls();n.status.textContent='通信中です。';
      const unknown=()=>{if(pending!==r)return;if(r.command!=='read')uncertain={command:r.command,input:r.input,operationId:r.operationId};n.status.textContent=r.command==='read'?'取得できませんでした。更新してください。':'保存結果を確認できません。更新で状態を見るか、同じ操作で結果を再確認してください。';finish();};r.timer=setTimeout(unknown,30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhScheduleFrame';form.hidden=true;
      Object.entries({action:ACTION,command:r.command,input:r.input,operationId:r.operationId,idToken:proof,nonce:r.nonce,responseKey:r.key}).forEach(([name,value])=>{const i=document.createElement('input');i.type='hidden';i.name=name;i.value=value;form.appendChild(i);});document.body.appendChild(form);try{form.submit();}catch(_e){unknown();}finally{form.remove();}
    }
    async function read(){if(pending||stopped)return;await send({command:'read',input:JSON.stringify({month:n.month.value,audience:options.audience}),operationId:''});}
    global.addEventListener('message',async event=>{
      const r=pending,d=event.data;if(!r||stopped||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      if(!d||d.type!==TYPE||d.action!==ACTION||d.command!==r.command||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||typeof d.data!=='string'||d.data.length>1500000||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return;
      let ok=false;try{const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.key),{name:'HMAC',hash:'SHA-256'},false,['verify']);ok=await crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),v=>parseInt(v,16)),enc.encode([TYPE,ACTION,d.command,d.nonce,d.code,d.data].join('\n')));}catch(_e){}if(!ok||pending!==r||stopped)return;
      let value=null;if(d.data){try{value=JSON.parse(d.data);}catch(_e){return;}if(!validate(value,JSON.parse(r.input).month,admin))return;}
      if(['SCHEDULE_READY','SCHEDULE_SAVED','SCHEDULE_ALREADY_DONE','SCHEDULE_CONSENT_REQUIRED'].includes(d.code)&&!value)return;
      if(value){if(r.command!=='read')uncertain=null;finish();render(value);}else{
        if(r.command!=='read')uncertain=['SCHEDULE_UNAVAILABLE','SCHEDULE_REVIEW_REQUIRED'].includes(d.code)?{command:r.command,input:r.input,operationId:r.operationId}:null;
        clear();finish();
      }
      n.status.textContent=messages[d.code];
    });
    n.refresh.addEventListener('click',()=>void read());n.month.addEventListener('change',()=>{if(!pending&&!uncertain)void read();});n.retry.addEventListener('click',()=>{if(uncertain&&!pending)void send({...uncertain});});
    n.day.addEventListener('change',loadEditor);n.employee.addEventListener('change',loadEditor);n['add-period'].addEventListener('click',()=>{if(snapshot&&!pending&&!uncertain)period();});n['add-appointment'].addEventListener('click',()=>{if(snapshot&&!pending&&!uncertain)appointment();});
    n.save.addEventListener('click',()=>{
      if(!snapshot||pending||uncertain)return;const plan=inputPlan(),input={...base(),day:n.day.value,plan,reason:n.reason.value};
      if(!date(input.day)||!input.day.startsWith(n.month.value+'-')){n.status.textContent='表示中の月の日付を入力してください。';n.day.focus();return;}
      if((!admin||snapshot.phase==='PUBLISHED')&&!input.reason.trim()){n.status.textContent='希望・変更の理由を入力してください。';n.reason.focus();return;}
      if(plan.periods.some(p=>!time(p.start)||!time(p.end)||!Number.isInteger(p.breakMinutes)||p.breakMinutes<0)){n.status.textContent='勤務区間の出退勤時刻と予定休憩を確認してください。';return;}
      if(plan.leave.type!=='NONE'&&(plan.periods.length||plan.appointments.some(p=>p.countsAsWork))){n.status.textContent='全日の休暇と勤務を同時に指定できません。勤務区間と用事の算入を確認してください。';return;}
      if(admin){input.employeeCode=n.employee.value;input.expectedPlanRevision=snapshot.phase==='PUBLISHED'?snapshot.monthRevision:selected()?.revision||0;write('plan',input,'対象：'+n.employee.value+' / '+input.day+'\n'+(snapshot.phase==='PUBLISHED'?'変更案を本人へ送り、同意を確認します。':'この日の予定を下書き保存します。')+'\n続けますか？');}
      else{input.kind=n.kind.value;input.expectedPlanRevision=snapshot.phase==='PUBLISHED'?snapshot.monthRevision:0;write('request',input,input.day+' の希望・申出を提出します。提出だけでは予定は確定しません。続けますか？');}
    });
    document.getElementById('schedule-month-save').addEventListener('click',()=>{if(!snapshot)return;let deadline;try{deadline=new Date(n.deadline.value+':00+09:00').toISOString();}catch(_e){n.status.textContent='締切日時を入力してください。';return;}write('month',{...base(),deadline},'この月の初回希望締切を設定しますか？');});
    document.getElementById('schedule-event-save').addEventListener('click',()=>{if(!snapshot)return;write('event',{...base(),day:n['event-day'].value,title:n['event-title'].value,note:n['event-note'].value,expectedEventRevision:snapshot.draftEvents.find(e=>e.day===n['event-day'].value)?.revision||0},'営業上のイベントを下書き保存しますか？個人の用事は予定の用事欄へ入力してください。');});
    n.publish.addEventListener('click',()=>{if(snapshot)write('publish',base(),'この月の下書きを全員へ確定公開します。未設定の日は未設定のままです。内容を確認しましたか？');});
    global.addEventListener('pagehide',()=>{stopped=true;uncertain=null;finish();clear();n.reason.value='';n.note.value='';n.periods.replaceChildren();n.appointments.replaceChildren();periods.length=0;appointments.length=0;});
    controls();return Object.freeze({read});
  }
  global.TlhSchedule=Object.freeze({init,validate});
  if(document.currentScript?.dataset.bootstrap==='true')global.addEventListener('DOMContentLoaded',async()=>{
    const login=document.getElementById('schedule-login'),status=document.getElementById('schedule-status');
    login.addEventListener('click',()=>global.liff.login());
    try{global.TlhAutoRead.init();await global.liff.init({liffId:'2011940133-JXUDzLnG'});if(!global.liff.isLoggedIn()){login.hidden=false;status.textContent='LINEログインが必要です。';status.setAttribute('aria-busy','false');return;}
      document.getElementById('schedule-month').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
      const ui=init({gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec',liff:global.liff,audience:document.body.dataset.audience});await ui.read();
    }catch(_e){status.textContent='接続を開始できません。LINEから開き直してください。';status.setAttribute('aria-busy','false');}
  });
})(window);
