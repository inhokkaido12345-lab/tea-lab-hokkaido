/**
 * 管理者用シフトの入口だけを担当する。編集はシート、画面は作成/希望受付/承認/公開。
 * 本人の希望申請はschedule.js。CSV選択・月間セル編集・下書き一覧はここへ戻さない。
 * 一般化: state→検証済みDTO→表示。公開はREAD→明示確認→反映→公開の状態機械。
 * 削除影響: 管理者のシフト操作だけ停止。原打刻/シート/本人の申請は消えない。
 * 魔改造: command/署名/DTOはBridgeSchedule・Service・契約テストを同時に更新する。
 * 境界: 保存結果不明は同じIDで再確認。通信失敗を未保存と推測しない。Storage/ログに秘密を置かない。
 */
(function(global){'use strict';
  const TYPE='TLH_BRIDGE_SCHEDULE',ACTION='bridgeScheduleV1';
  const READS=new Set(['batchRead','sheetRead']);
  const SUCCESS=new Set(['SCHEDULE_READY','SCHEDULE_SAVED','SCHEDULE_ALREADY_DONE','SCHEDULE_CONSENT_REQUIRED','SCHEDULE_SHEET_READY']);
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
  const messages={
    SCHEDULE_READY:'最新の状態を確認しました。',SCHEDULE_SAVED:'保存しました。',SCHEDULE_ALREADY_DONE:'同じ操作は保存済みです。',SCHEDULE_CONSENT_REQUIRED:'確定済みの変更案を保存しました。本人の同意・管理者の承認後に反映されます。',
    SCHEDULE_SHEET_READY:'入力シートを確認しました。',SCHEDULE_INVALID:'入力内容を確認してください。',SCHEDULE_CHANGED:'確認後にアプリの状態が変わりました。読み込み直してください。',SCHEDULE_PERMISSION_REQUIRED:'管理者権限を確認できません。',SCHEDULE_EMPLOYEE_REQUIRED:'従業員の登録状態を確認してください。',
    SCHEDULE_REQUEST_PENDING:'未処理の申請と変更が重なっています。希望休で申請を確認してください。',SCHEDULE_OPERATION_REUSED:'操作番号と内容が一致しません。保存状態を確認してください。',SCHEDULE_NOT_OPEN:'希望受付の期間・締切を設定してください。',SCHEDULE_NOT_COLLECTING:'希望受付の設定を確認してください。',SCHEDULE_PUBLISHED_LOCKED:'この期間は公開済みです。',SCHEDULE_DEADLINE_NOT_REACHED:'希望締切後に公開できます。',SCHEDULE_DEADLINE_CLOSED:'希望締切を過ぎています。',
    SCHEDULE_SHEET_SOURCE_REQUIRED:'正本スプレッドシートへの接続設定が必要です。',SCHEDULE_SHEET_CONTENT_REQUIRED:'シートと申請・下書きが一致しません。シートを確認してください。',SCHEDULE_SHEET_CHANGED:'確認後にシートが編集されました。公開を止めました。もう一度確認してください。',SCHEDULE_SHEET_CONFIGURATION_REQUIRED:'入力シートの接続設定を確認してください。',SCHEDULE_SHEET_NOT_FOUND:'該当月の入力シートを作成してください。',SCHEDULE_SHEET_INVALID:'入力シートの形式・店舗・内容を確認してください。',SCHEDULE_SHEET_FORMAT_REQUIRED:'入力シートの3行形式を確認してください。',SCHEDULE_SHEET_ROSTER_REQUIRED:'入力シートに全従業員の行が必要です。',SCHEDULE_SHEET_AUX_REQUIRED:'用事・休暇・イベントの入力タブを確認してください。',
    SCHEDULE_REVIEW_REQUIRED:'保存先の整合性確認が必要です。同じ操作で確認してください。',SCHEDULE_SHEET_REVIEW_REQUIRED:'シートへの保存結果を確認できません。同じ操作で確認してください。',SCHEDULE_STORAGE_INVALID:'保存先の構成を確認してください。',SCHEDULE_WRITE_UNAVAILABLE:'保存できず、変更は戻されています。内容を確認してください。',SCHEDULE_UNAVAILABLE:'応答を確認できません。保存操作は同じ操作で再確認してください。',SCHEDULE_CAPACITY:'処理上限を超えています。',SCHEDULE_LEAVE_CONFLICT:'休暇と勤務が重なっています。シートを確認してください。',SCHEDULE_REQUIRED_WORK:'会社指示の用事を勤務対象から外せません。',SCHEDULE_WORK_ASSESSMENT_REQUIRED:'用事の勤務算入をシートで確認してください。',WRITE_REVIEW_REQUIRED:'原簿の整合性確認が必要です。',ENROLLMENT_BUSY:'他の処理が動作中です。時間を置いて確認してください。',LINE_VERIFY_REJECTED:'LINEでログインし直してください。'
  };
  const unknownCodes=new Set(['SCHEDULE_UNAVAILABLE','SCHEDULE_REVIEW_REQUIRED','SCHEDULE_SHEET_REVIEW_REQUIRED','WRITE_REVIEW_REQUIRED']);
  function related(source,target){try{for(let i=0;source&&i<8;i++){if(source===target)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch(_e){}return false;}
  async function verify(data,request){
    if(!data||data.type!==TYPE||data.action!==ACTION||data.command!==request.command||data.nonce!==request.nonce||!Object.hasOwn(messages,data.code)||typeof data.data!=='string'||data.data.length>1500000||typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(request.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),x=>parseInt(x,16)),enc.encode([TYPE,ACTION,data.command,data.nonce,data.code,data.data].join('\n')));
  }
  function init(options){
    const ids=['month','period','refresh','status','login','frame','edit-tab','requests-tab','edit-panel','requests-panel','sheet-create','sheet-open','deadline','deadline-save','requests','publish','phase','confirm','question','reason-label','reason','approve','cancel','retry'];
    const n=Object.fromEntries(ids.map(id=>[id,document.getElementById('schedule-management-'+id)]));
    let snapshot=null,pending=null,uncertain=null,confirmation=null,flow=null,stopped=false,failed=false,category='edit';
    const contract=global.TlhScheduleManagementContract;
    const login=global.TlhSchedule.createLoginRecovery({button:n.login,liff:options.liff,blocked:()=>stopped||!!pending||!!uncertain||!!confirmation||!!options.loginBlocked?.(),changed:controls,failed:()=>{n.status.textContent='LINEログインを開始できませんでした。';}});
    const selected=()=>snapshot?.halves[n.period.value];
    function controls(){
      const busy=stopped||!!pending||!!uncertain||!!confirmation||!!flow,ready=!!snapshot&&selected()?.inputMode==='SHEET'&&!login.locked()&&!busy;
      n.month.disabled=busy||login.locked();n.period.disabled=busy||login.locked();
      n['edit-tab'].disabled=busy;n['requests-tab'].disabled=busy;
      n['edit-tab'].setAttribute('aria-selected',String(category==='edit'));n['requests-tab'].setAttribute('aria-selected',String(category==='requests'));
      n['edit-panel'].hidden=category!=='edit';n['requests-panel'].hidden=category!=='requests';
      n['sheet-create'].disabled=!ready;n['deadline-save'].disabled=!ready;n.deadline.disabled=!ready;
      n.publish.disabled=!ready||!['COLLECTING','PUBLISHED'].includes(selected()?.phase);
      n.publish.textContent=selected()?.phase==='PUBLISHED'?'シートの変更を反映する':'下書きを公開する';
      n.refresh.disabled=busy||login.locked();n.refresh.hidden=!failed;
      n.retry.hidden=!uncertain;n.retry.disabled=stopped||!!pending;
      n.confirm.hidden=!confirmation;n.approve.disabled=stopped||!!pending;n.cancel.disabled=stopped||!!pending;
      n['reason-label'].hidden=!confirmation?.reason;n.reason.disabled=!confirmation?.reason||!!pending;
      // 動的な申請ボタンにも同じ待機ガードを適用。disabledは表示用で、GASの認可は毎回行う。
      for(const button of n.requests.querySelectorAll('button'))button.disabled=!ready;
      login.update();n.status.setAttribute('aria-busy',String(!!pending));
      options.onNavigationLock?.(busy);
    }
    function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent?.appendChild(node);return node;}
    function base(){return{month:snapshot.month,period:n.period.value,audience:'admin',expectedMonthRevision:selected().monthRevision};}
    function render(){
      const s=selected();n.requests.replaceChildren();
      if(!s){n.phase.textContent='';controls();return;}
      n.phase.textContent=(n.period.value==='FIRST'?'前半':'後半')+'：'+({NOT_OPEN:'希望受付未設定',DRAFT:'下書き',COLLECTING:'希望受付中',PUBLISHED:'公開済み'}[s.phase])+(s.deadline?' / 締切 '+new Date(s.deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'');
      n.deadline.value=s.deadline?new Date(Date.parse(s.deadline)+9*3600000).toISOString().slice(0,16):'';
      const requests=s.requests.filter(r=>['PENDING','AWAITING_CONSENT'].includes(r.status));
      for(const r of requests){
        const card=el('article',undefined,n.requests);card.className='record-item';
        el('h4',r.employeeName+'（'+r.employeeCode+'） / '+r.payload.plan.day,card);
        const plan=r.payload.plan,kind={SHIFT_PREFERENCE:'希望',ANNUAL_LEAVE:'年休の申出',STATUTORY_LEAVE:'制度上の申出',ADMIN_CHANGE:'勤務変更'}[r.kind];
        el('p',kind+'：'+(plan.periods.map(p=>p.start+'〜'+(p.endNextDay?'翌':'')+p.end).join('、')||({PUBLIC_OFF:'希望休',PAID:'有給',OTHER:'その他休暇',NONE:'勤務区間なし'}[plan.leave.type])),card);
        if(plan.note)el('p','非公開メモ：'+plan.note,card);if(plan.publicNote)el('p','公開特記事項：'+plan.publicNote,card);
        for(const item of plan.appointments)el('p','用事：'+item.title+' / '+item.location+' / '+item.start+'〜'+item.end,card);
        el('p','理由：'+r.payload.reason,card);
        if(r.status==='AWAITING_CONSENT'){el('p','本人の同意を待っています。',card);continue;}
        const label=el('label','判断理由',card),reason=el('textarea',undefined,label);reason.maxLength=500;reason.rows=2;
        for(const [decision,title]of [['APPROVE','承認する'],['REJECT','見送る']]){
          const button=el('button',title,card);button.type='button';if(decision==='REJECT')button.className='schedule-reject';
          button.addEventListener('click',()=>{
            if(!canAct())return;if(!reason.value.trim()||reason.value.length>500){n.status.textContent='判断理由を入力してください。';reason.focus();return;}
            const draft=s.drafts.find(p=>p.employeeCode===r.employeeCode&&p.day===plan.day);
            const input={...base(),requestId:r.requestId,expectedRequestRevision:r.revision,expectedPlanRevision:s.phase==='PUBLISHED'?s.monthRevision:draft?.revision||0,decision,reason:reason.value};
            review({command:'review',input},r.employeeName+'（'+r.employeeCode+'） '+plan.day+' の申請を'+title+'。全日の希望休は正本シートの非公開備考へ追記し、既存予定との競合はシートで調整します。');
          });
        }
      }
      if(!requests.length)el('p','この期間の承認待ちはありません。',n.requests);controls();
    }
    function canAct(){return !stopped&&!pending&&!uncertain&&!confirmation&&!flow&&!login.locked()&&!!snapshot&&selected()?.inputMode==='SHEET';}
    function clear(){snapshot=null;n.requests.replaceChildren();n['sheet-open'].hidden=true;n['sheet-open'].removeAttribute('href');n.phase.textContent='';n.deadline.value='';}
    function updateBatch(value){snapshot=value;if(value.inputSheetUrl){n['sheet-open'].href=value.inputSheetUrl;n['sheet-open'].hidden=false;}render();}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function review(job,question,reason=false){confirmation={...job,reason};n.question.textContent=question;n.reason.value='';controls();}
    async function send(command,input,operationId=READS.has(command)?'':random(16)){
      if(stopped||pending||login.locked())return;
      if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      let proof;try{proof=options.liff.getIDToken();}catch(_e){}
      if(typeof proof!=='string'||!proof){failed=true;flow=null;confirmation=null;if(READS.has(command)){clear();login.require();}n.status.textContent='LINEログインが必要です。';controls();return;}
      const request={command,input:typeof input==='string'?input:JSON.stringify(input),operationId,nonce:random(16),responseKey:random(32)};
      pending=request;controls();n.status.textContent=READS.has(command)?'読み込み中です。':'保存して結果を確認しています。';
      function unknown(){if(stopped||pending!==request)return;failed=true;if(!READS.has(command))uncertain={command,input:request.input,operationId};else flow=null;finish();n.status.textContent=READS.has(command)?'取得できませんでした。再読み込みしてください。':'保存結果を確認できません。同じ操作で結果を再確認してください。';}
      request.timer=setTimeout(unknown,30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhScheduleManagementFrame';form.hidden=true;
      for(const [name,value]of Object.entries({action:ACTION,command,input:request.input,operationId,idToken:proof,nonce:request.nonce,responseKey:request.responseKey})){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);}
      document.body.appendChild(form);try{global.TlhCurrentWorkplace?global.TlhCurrentWorkplace.submit(form):form.submit();}catch(_e){unknown();}finally{form.remove();}
    }
    async function load(){if(stopped||pending||uncertain||confirmation||flow||login.locked())return;try{contract.days(n.month.value);}catch(_e){n.status.textContent='月を確認してください。';return;}clear();await send('batchRead',{month:n.month.value,audience:'admin'});}
    function publishImported(){
      if(!flow?.confirmed)return;
      if(selected().phase==='PUBLISHED'){flow=null;n.status.textContent='シート変更の反映結果を確認しました。確定勤務の変更は本人同意・承認後に反映されます。';controls();return;}
      // 月の版はサーバー応答、内容のdigestは本人が確認したREADから固定して引き継ぐ。
      void send('publish',{...base(),period:flow.period,expectedMonthRevision:snapshot.halves[flow.period].monthRevision,sourceDigest:flow.digest});
    }
    global.addEventListener('message',async event=>{
      const request=pending;if(!request||stopped||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||/^https:\/\/[a-zA-Z0-9.-]+\.googleusercontent\.com$/.test(event.origin)))return;
      let valid=false;try{valid=await verify(event.data,request);}catch(_e){}if(!valid||pending!==request||stopped)return;
      const reply=event.data,expected=JSON.parse(request.input);let value=null;
      if(reply.code==='LINE_VERIFY_REJECTED'&&READS.has(request.command)&&reply.data===''){finish();clear();flow=null;failed=true;login.require();n.status.textContent=messages.LINE_VERIFY_REJECTED;controls();return;}
      if(reply.data){try{value=JSON.parse(reply.data);}catch(_e){return;}
        if(['sheetRead','sheetCreate'].includes(request.command)){if(!contract.sheet(value,expected.month,request.command))return;}
        else if(['batchRead','sheetImport'].includes(request.command)){if(!contract.validate(value,expected.month))return;}
        else if(!global.TlhSchedule.validate(value,expected.month,true,expected.period))return;
      }
      if(SUCCESS.has(reply.code)&&!value)return;
      if(!SUCCESS.has(reply.code)){
        failed=true;if(!READS.has(request.command)&&unknownCodes.has(reply.code))uncertain={command:request.command,input:request.input,operationId:request.operationId};
        else{uncertain=null;flow=null;}
        if(reply.code==='SCHEDULE_PERMISSION_REQUIRED')clear();finish();n.status.textContent=messages[reply.code];return;
      }
      uncertain=null;failed=false;finish();
      if(['sheetRead','sheetCreate'].includes(request.command)){
        updateBatch(value.snapshot);n['sheet-open'].href=value.sheet.url;n['sheet-open'].hidden=false;
        if(request.command==='sheetCreate'){n.status.textContent=value.sheet.created?'入力シートを作成しました。':'作成済みの入力を保持して確認しました。';options.onSaved?.();return;}
        if(!flow)return;
        const a=value.authority;if(!a){flow=null;n.status.textContent=messages.SCHEDULE_SHEET_SOURCE_REQUIRED;controls();return;}
        flow.digest=a.sourceDigest;flow.authority=a;
        const count=a.preview.changes.length,events=a.preview.eventChanges;
        review({command:'publish-flow'},value.month+'のシート変更 '+count+'日分・共有イベント '+events+'期間を反映します。対象は月全体です。'+(selected().phase==='PUBLISHED'?'公開済み勤務の変更は本人の同意・承認待ちになります。':(flow.period==='FIRST'?'前半':'後半')+'だけを全員に公開します。')+'空欄は削除として反映します。シートを確認済みですか？',a.preview.changes.some(c=>c.published));return;
      }
      if(['batchRead','sheetImport'].includes(request.command))updateBatch(value);else{snapshot.halves[expected.period]=value;render();}
      if(request.command==='sheetImport'&&flow){options.onSaved?.();publishImported();return;}
      if(request.command==='publish'){flow=null;n.status.textContent='シートの反映を確認し、選択期間を公開しました。';}
      else if(request.command==='review'){
        const approved=value.requests.find(r=>r.requestId===expected.requestId&&r.status==='APPROVED'&&r.payload.sheetPreference);
        n.status.textContent=approved?(approved.payload.sheetPreference.conflict?'承認し、非公開備考へ希望休と【希望休と競合】を追記しました。既存シフトは残っています。スプレッドシートで調整してください。':'承認し、非公開備考へ希望休を追記しました。'):messages[reply.code];
      }else n.status.textContent=snapshot?.halves.FIRST.inputMode!=='SHEET'?messages.SCHEDULE_SHEET_SOURCE_REQUIRED:messages[reply.code];
      if(!READS.has(request.command))options.onSaved?.();controls();
    });
    n.refresh.addEventListener('click',()=>void load());n.month.addEventListener('change',()=>void load());n.period.addEventListener('change',()=>{if(!pending&&!uncertain&&!confirmation&&!flow)render();});
    for(const key of ['edit','requests'])n[key+'-tab'].addEventListener('click',()=>{if(pending||uncertain||confirmation||flow)return;category=key;controls();});
    n['sheet-create'].addEventListener('click',()=>{if(canAct())review({command:'sheetCreate',input:{month:n.month.value,audience:'admin'}},n.month.value+'の入力シートを作成します。既存の入力は保持します。新しい月の従業員メモだけ、直近の過去月から初回継承します。');});
    n['deadline-save'].addEventListener('click',()=>{if(!canAct())return;let deadline;try{deadline=new Date(n.deadline.value+':00+09:00').toISOString();}catch(_e){n.status.textContent='希望締切を入力してください。';return;}review({command:'month',input:{...base(),deadline}},'選択期間の希望受付と締切を設定しますか？');});
    n.publish.addEventListener('click',()=>{if(!canAct()||n.publish.disabled)return;flow={period:n.period.value,confirmed:false};void send('sheetRead',{month:n.month.value,audience:'admin'});});
    n.approve.addEventListener('click',()=>{
      if(!confirmation||pending||uncertain||stopped)return;const job=confirmation;
      if(job.reason&&(!n.reason.value.trim()||n.reason.value.length>500)){n.status.textContent='確定済み勤務の変更理由を入力してください。';n.reason.focus();return;}
      confirmation=null;
      if(job.command==='publish-flow'){
        flow.confirmed=true;const a=flow.authority;
        if(a.preview.changes.length||a.preview.eventChanges)void send('sheetImport',{month:snapshot.month,audience:'admin',sourceDigest:a.sourceDigest,targetDigest:a.targetDigest,reason:n.reason.value});else publishImported();
      }else void send(job.command,job.input);
    });
    n.cancel.addEventListener('click',()=>{if(pending||uncertain||stopped)return;confirmation=null;flow=null;n.reason.value='';n.status.textContent='操作を取り消しました。';controls();});
    n.retry.addEventListener('click',()=>{if(uncertain&&!pending&&!stopped)void send(uncertain.command,uncertain.input,uncertain.operationId);});
    global.addEventListener('beforeunload',event=>{if(pending&&!READS.has(pending.command)||uncertain||flow?.confirmed){event.preventDefault();event.returnValue='';}});
    global.addEventListener('pagehide',()=>{stopped=true;confirmation=null;flow=null;uncertain=null;finish();clear();n.reason.value='';controls();});controls();
    return Object.freeze({load});
  }
  global.TlhScheduleManagement=Object.freeze({init,verify});
if(document.currentScript?.dataset.bootstrap==='true')global.addEventListener('DOMContentLoaded',async()=>{
 const status=document.getElementById('schedule-management-status');
 try{global.TlhAutoRead.init();await global.liff.init({liffId:'2011940133-JXUDzLnG'});
 if(!global.liff.isLoggedIn()){global.TlhSchedule.createLoginRecovery({button:document.getElementById('schedule-management-login'),liff:global.liff}).require();status.textContent='管理者のLINEログインが必要です。';return;}
 document.getElementById('schedule-management-month').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
 await init({gasUrl:global.TlhCurrentWorkplace.config.endpoint,liff:global.liff}).load();
 }catch(_e){status.textContent='通信を開始できません。画面を開き直してください。';status.setAttribute('aria-busy','false');}
});
})(window);
