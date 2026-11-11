/**
 * 管理者用シフトの入口だけを担当する。編集はシート、画面は作成/希望受付/承認/公開。
 * 呼出元: admin-schedule.html / schedule-workspace.js。先: 契約検査→既存bridgeScheduleV1。
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
    SCHEDULE_SHEET_SOURCE_REQUIRED:'正本スプレッドシートへの接続設定が必要です。',SCHEDULE_SHEET_CONTENT_REQUIRED:'シートと申請・下書きが一致しません。シートを確認してください。',SCHEDULE_SHEET_CHANGED:'確認後にシートが編集されました。公開を止めました。もう一度確認してください。',SCHEDULE_SHEET_CONFIGURATION_REQUIRED:'入力シートの接続設定を確認してください。',SCHEDULE_SHEET_NOT_FOUND:'該当月の入力シートを作成してください。',SCHEDULE_SHEET_BINDING_REQUIRED:'入力ファイルの識別設定が必要です。月別シートがないため作成を止めています。設定担当者へ連絡してください。',SCHEDULE_SHEET_BINDING_INVALID:'入力ファイルの店舗識別設定が一致しません。設定担当者へ連絡してください。',SCHEDULE_SHEET_INVALID:'入力シートの形式・店舗・内容を確認してください。',SCHEDULE_SHEET_FORMAT_REQUIRED:'入力シートの3行形式を確認してください。',SCHEDULE_SHEET_ROSTER_REQUIRED:'入力シートに全従業員の行が必要です。',SCHEDULE_SHEET_AUX_REQUIRED:'用事・休暇・イベントの入力タブを確認してください。',
    SCHEDULE_REVIEW_REQUIRED:'保存先の整合性確認が必要です。同じ操作で確認してください。',SCHEDULE_SHEET_REVIEW_REQUIRED:'シートへの保存結果を確認できません。同じ操作で確認してください。',SCHEDULE_STORAGE_INVALID:'保存先の構成を確認してください。',SCHEDULE_WRITE_UNAVAILABLE:'保存できず、変更は戻されています。内容を確認してください。',SCHEDULE_UNAVAILABLE:'応答を確認できません。保存操作は同じ操作で再確認してください。',SCHEDULE_CAPACITY:'処理上限を超えています。',SCHEDULE_LEAVE_CONFLICT:'休暇と勤務が重なっています。シートを確認してください。',SCHEDULE_REQUIRED_WORK:'会社指示の用事を勤務対象から外せません。',SCHEDULE_WORK_ASSESSMENT_REQUIRED:'用事の勤務算入をシートで確認してください。',WRITE_REVIEW_REQUIRED:'原簿の整合性確認が必要です。',ENROLLMENT_BUSY:'他の処理が動作中です。時間を置いて確認してください。',LINE_VERIFY_REJECTED:'LINEでログインし直してください。'
  };
  const unknownCodes=new Set(['SCHEDULE_UNAVAILABLE','SCHEDULE_REVIEW_REQUIRED','SCHEDULE_SHEET_REVIEW_REQUIRED','WRITE_REVIEW_REQUIRED']);
  function related(source,target){try{for(let i=0;source&&i<8;i++){if(source===target)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch(_e){}return false;}
  /** 返信本文と待機中要求を照合。型/nonce/command/HMACが一致した時だけtrue。暗号例外は受信側で拒否する。 */
  async function verify(data,request){
    if(!data||data.type!==TYPE||data.action!==ACTION||data.command!==request.command||data.nonce!==request.nonce||!Object.hasOwn(messages,data.code)||typeof data.data!=='string'||data.data.length>1500000||typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(request.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),x=>parseInt(x,16)),enc.encode([TYPE,ACTION,data.command,data.nonce,data.code,data.data].join('\n')));
  }
  /** DOMと既存LIFFを接続しloadを返す。初期化では保存しない。欠落したIDはビルド/検査で直す。 */
  function init(options){
    const ids=['sheet-confirm-slot','default-confirm-slot','month','period','refresh','status','login','frame','edit-tab','requests-tab','edit-panel','requests-panel','sheet-create','sheet-open','deadline','deadline-save','deadline-start','deadline-end','deadline-rules','requests','publish','phase','confirm','question','reason-label','reason','approve','cancel','retry'];
    const n=Object.fromEntries(ids.map(id=>[id,document.getElementById('schedule-management-'+id)]));
    if(Object.values(n).some(node=>!node))throw Error('SCHEDULE_MANAGEMENT_DOM_MISSING');
    let snapshot=null,pending=null,uncertain=null,confirmation=null,flow=null,stopped=false,failed=false,category='edit';
    const contract=global.TlhScheduleManagementContract;
    const login=global.TlhSchedule.createLoginRecovery({button:n.login,liff:options.liff,blocked:()=>stopped||!!pending||!!uncertain||!!confirmation||!!options.loginBlocked?.(),changed:controls,failed:()=>{n.status.textContent='LINEログインを開始できませんでした。';}});
    const selected=()=>snapshot?.halves[n.period.value];
    // 表示と操作待機の担当。ここで権限を作らず、通信ごとのGAS認可を残す。
    function controls(){
      const busy=stopped||!!pending||!!uncertain||!!confirmation||!!flow,ready=!!snapshot&&selected()?.inputMode==='SHEET'&&!login.locked()&&!busy;
      n.month.disabled=busy||login.locked();n.period.disabled=busy||login.locked();
      n['edit-tab'].disabled=busy;n['requests-tab'].disabled=busy;
      n['edit-tab'].setAttribute('aria-selected',String(category==='edit'));n['requests-tab'].setAttribute('aria-selected',String(category==='requests'));n['edit-tab'].tabIndex=category==='edit'?0:-1;n['requests-tab'].tabIndex=category==='requests'?0:-1;
      n['edit-panel'].hidden=category!=='edit';n['requests-panel'].hidden=category!=='requests';
      n['sheet-create'].disabled=!ready;for(const key of ['deadline','deadline-start','deadline-end','deadline-save'])n[key].disabled=!ready;
      n.publish.disabled=!ready;
      n.publish.textContent=snapshot&&['FIRST','SECOND'].some(k=>snapshot.halves[k].phase==='PUBLISHED')?'シートの変更を反映する':'下書きを公開する';
      n.refresh.disabled=busy||login.locked();n.refresh.hidden=!failed;
      n.retry.hidden=!uncertain;n.retry.disabled=stopped||!!pending;
      n.confirm.hidden=!confirmation;n.approve.disabled=stopped||!!pending;n.cancel.disabled=stopped||!!pending;
      n['reason-label'].hidden=!confirmation?.reason;n.reason.disabled=!confirmation?.reason||!!pending;
      // 動的な申請ボタンにも同じ待機ガードを適用。disabledは表示用で、GASの認可は毎回行う。
      for(const button of n.requests.querySelectorAll('button'))button.disabled=busy||login.locked()||snapshot?.halves[button.dataset.period]?.inputMode!=='SHEET';
      n.status.setAttribute('aria-busy',String(!!pending));
      options.onNavigationLock?.(busy);login.update();
    }
    function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent?.appendChild(node);return node;}
    function base(period=n.period.value){return{month:snapshot.month,period,audience:'admin',expectedMonthRevision:snapshot.halves[period].monthRevision};}
    function render(){
      const s=selected();n.requests.replaceChildren();
      if(!s){n.phase.textContent='';controls();return;}
      const published=['FIRST','SECOND'].filter(k=>snapshot.halves[k].phase==='PUBLISHED').length;
      n.phase.textContent=published===2?'月全体を公開済みです。':published===1?'以前の半月公開を含みます。次の公開で月全体を確認します。':'この月は未公開です。希望休の締切前でも公開できます。';
      const rules=s.requestDeadlines||[],last=rules.at(-1);n['deadline-start'].value=last?.startDay||snapshot.month+'-01';n['deadline-end'].value=last?.endDay||contract.days(snapshot.month).at(-1);n.deadline.value=last?new Date(Date.parse(last.deadline)+9*3600000).toISOString().slice(0,16):'';
      n['deadline-rules'].replaceChildren();for(const rule of [...rules].reverse())el('p',rule.startDay+'〜'+rule.endDay+'の希望：'+new Date(rule.deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'締切（日本時間）',n['deadline-rules']);
      if(!rules.length)el('p','この月にかかる期間指定の締切は未設定です。',n['deadline-rules']);
      for(const part of ['FIRST','SECOND']){const old=snapshot.halves[part];if(old.deadline)el('p','以前の設定：'+(old.rangeStart||snapshot.month+(part==='FIRST'?'-01':'-16'))+'〜'+(old.rangeEnd||contract.days(snapshot.month).at(part==='FIRST'?14:-1))+'の希望は '+new Date(old.deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'締切。新しい期間指定と重なる日は新しい締切を優先します。',n['deadline-rules']);}
      // 閲覧は月全体、承認先は各申請が属する保存区分と版から固定する。公開用の選択を流用しない。
      const requests=['FIRST','SECOND'].flatMap(part=>snapshot.halves[part].requests.filter(r=>['PENDING','AWAITING_CONSENT'].includes(r.status)).map(r=>({s:snapshot.halves[part],part,r}))).sort((a,b)=>a.r.payload.plan.day.localeCompare(b.r.payload.plan.day)||a.r.employeeCode.localeCompare(b.r.employeeCode));
      for(const {s,part,r} of requests){
        const card=el('article',undefined,n.requests);card.className='record-item';
        el(options.embedded?'h4':'h3',r.employeeName+'（'+r.employeeCode+'） / '+r.payload.plan.day,card);
        const plan=r.payload.plan,kind={SHIFT_PREFERENCE:'希望',ANNUAL_LEAVE:'年休の申出',STATUTORY_LEAVE:'制度上の申出',ADMIN_CHANGE:'勤務変更'}[r.kind];
        el('p',kind+'：'+(plan.periods.map(p=>p.start+'〜'+(p.endNextDay?'翌':'')+p.end+' / 休憩'+p.breakMinutes+'分').join('、')||({PUBLIC_OFF:'希望休',PAID:'有給',OTHER:'その他休暇',NONE:'勤務区間なし'}[plan.leave.type])),card);
        if(plan.leave.unit&&plan.leave.type!=='NONE')el('p','休暇単位：'+({DAY:'全日',HALF_DAY:'半日',HOURS:'時間'}[plan.leave.unit]||'要確認')+(plan.leave.minutes?' / '+plan.leave.minutes+'分':'')+(plan.leave.note?' / '+plan.leave.note:''),card);
        if(plan.note)el('p','非公開メモ：'+plan.note,card);if(plan.publicNote)el('p','公開特記事項：'+plan.publicNote,card);
        for(const item of plan.appointments)el('p','用事：'+item.title+' / '+item.location+' / '+item.start+'〜'+(item.endNextDay?'翌':'')+item.end+' / '+(item.countsAsWork?'勤務に含む':'算入外')+' / 会社指示：'+(item.requiredByEmployer===true?'あり':item.requiredByEmployer===false?'なし':'未確認')+' / '+(item.classificationReason||''),card);
        el('p','理由：'+r.payload.reason,card);
        if(r.status==='AWAITING_CONSENT'){el('p','本人の同意を待っています。',card);continue;}
        const label=el('label','判断理由',card),reason=el('textarea',undefined,label);reason.maxLength=500;reason.rows=2;
        for(const [decision,title]of [['APPROVE','承認する'],['REJECT','見送る']]){
          const button=el('button',title,card);button.type='button';button.dataset.period=part;if(decision==='REJECT')button.className='schedule-reject';
          button.addEventListener('click',()=>{
            if(!canAct(part))return;if(!reason.value.trim()||reason.value.length>500){n.status.textContent='判断理由を入力してください。';reason.focus();return;}
            const draft=s.drafts.find(p=>p.employeeCode===r.employeeCode&&p.day===plan.day);
            const input={...base(part),requestId:r.requestId,expectedRequestRevision:r.revision,expectedPlanRevision:s.phase==='PUBLISHED'?s.monthRevision:draft?.revision||0,decision,reason:reason.value};
            review({command:'review',input},r.employeeName+'（'+r.employeeCode+'） '+plan.day+' の申請を'+title+'。全日の希望休は正本シートの非公開備考へ追記し、既存予定との競合はシートで調整します。');
          });
        }
      }
      if(!requests.length)el('p','この月の承認待ちはありません。',n.requests);controls();
    }
    function canAct(part=n.period.value){return !stopped&&!pending&&!uncertain&&!confirmation&&!flow&&!login.locked()&&snapshot?.halves[part]?.inputMode==='SHEET';}
    function clear(){snapshot=null;n.requests.replaceChildren();n['sheet-open'].hidden=true;n['sheet-open'].removeAttribute('href');n.phase.textContent='';n.deadline.value='';n['deadline-start'].value='';n['deadline-end'].value='';n['deadline-rules'].replaceChildren();}
    function updateBatch(value){snapshot=value;if(value.inputSheetUrl){n['sheet-open'].href=value.inputSheetUrl;n['sheet-open'].hidden=false;}render();}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    // 確認欄は1個を移動するだけ。イベント・固定ID・再送状態を複製/作り直さない。
    function review(job,question,reason=false){n[job.command==='sheetCreate'?'sheet-confirm-slot':'default-confirm-slot'].appendChild(n.confirm);confirmation={...job,reason};n.question.textContent=question;n.reason.value='';controls();}
    // JSON本文/操作IDは保存前に固定。再確認でも同一内容、nonceと署名鍵だけ新しくする。
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
    // 明示確認済みflowだけ継続する。取込みの結果不明中はここへ進まず、同一IDの照合を待つ。
    function publishImported(){
      if(!flow?.confirmed)return;
      // 保存区分は互換の両半月、公開操作は月全体。両方の期待版を固定し一体commitする。
      void send('monthPublish',{month:snapshot.month,audience:'admin',expectedRevisions:{FIRST:snapshot.halves.FIRST.monthRevision,SECOND:snapshot.halves.SECOND.monthRevision},sourceDigest:flow.digest});
    }
    global.addEventListener('message',async event=>{
      const request=pending;if(!request||stopped||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||/^https:\/\/[a-zA-Z0-9.-]+\.googleusercontent\.com$/.test(event.origin)))return;
      let valid=false;try{valid=await verify(event.data,request);}catch(_e){}if(!valid||pending!==request||stopped)return;
      const reply=event.data,expected=JSON.parse(request.input);let value=null;
      if(reply.code==='LINE_VERIFY_REJECTED'&&READS.has(request.command)&&reply.data===''){finish();clear();flow=null;failed=true;login.require();n.status.textContent=messages.LINE_VERIFY_REJECTED;controls();return;}
      if(reply.data){try{value=JSON.parse(reply.data);}catch(_e){return;}
        if(request.command==='sheetRead'&&reply.code==='SCHEDULE_INVALID'){if(!contract.inputIssues(value,expected.month))return;}
        else if(['sheetRead','sheetCreate'].includes(request.command)){if(!contract.sheet(value,expected.month,request.command))return;}
        else if(['batchRead','sheetImport','monthPublish','deadlineRange'].includes(request.command)){if(!contract.validate(value,expected.month))return;}
        else if(!global.TlhSchedule.validate(value,expected.month,true,expected.period))return;
      }
      if(SUCCESS.has(reply.code)&&!value)return;
      if(!SUCCESS.has(reply.code)){
        failed=true;if(!READS.has(request.command)&&unknownCodes.has(reply.code))uncertain={command:request.command,input:request.input,operationId:request.operationId};
        else{uncertain=null;flow=null;}
        if(reply.code==='SCHEDULE_PERMISSION_REQUIRED')clear();finish();
        if(request.command==='sheetRead'&&reply.code==='SCHEDULE_INVALID'&&value){
          const format=value.inputIssues.filter(v=>v.kind==='WORK_FORMAT').map(v=>v.cell),rule=value.inputIssues.filter(v=>v.kind==='PLAN_RULE').map(v=>v.cell);
          n.status.textContent='入力シートに修正が必要な箇所が'+value.issueCount+'件あります。'+(format.length?' 時刻の書式：'+format.join('、')+'。09:00-18:00/60 の形式で入力してください（最後は休憩分数）。':'')+(rule.length?' 勤務条件：'+rule.join('、')+'。出退勤の順序・勤務の重複・休憩分数・休暇との重複・備考の長さを確認してください。':'')+(value.issueCount>20?' 先頭20件を表示しています。':'')+' シートを直してから、もう一度「下書きを公開する／シートの変更を反映する」を押してください。今回は取込み・公開していません。';
        }else if(reply.code==='ENROLLMENT_BUSY'){
          // Lock未取得は開始前の拒否。直前の別操作まで未保存と断定せず、READ/保存を分けて案内する。
          n.status.textContent=READS.has(request.command)?(request.command==='sheetRead'?'差分確認の読取り':'最新状態の読取り')+'を開始できませんでした。別の処理がデータを保護中です。この操作では取込み・公開は行っていません。しばらく待って「再読み込み」を押し、表示後にもう一度公開を確認してください。':
            '別の処理がデータを保護中のため、今回の操作は開始できませんでした。前の操作の保存結果が不明な場合は、その同じ操作で結果を確認してください。それ以外は、しばらく待って「再読み込み」から最新状態を確認してください。';
        }else n.status.textContent=messages[reply.code];return;
      }
      uncertain=null;failed=false;finish();
      if(['sheetRead','sheetCreate'].includes(request.command)){
        updateBatch(value.snapshot);n['sheet-open'].href=value.sheet.url;n['sheet-open'].hidden=false;
        if(request.command==='sheetCreate'){n.status.textContent=value.sheet.created?'入力シートを作成しました。':'作成済みの入力を保持して確認しました。';options.onSaved?.();return;}
        if(!flow)return;
        const a=value.authority;if(!a){flow=null;n.status.textContent=messages.SCHEDULE_SHEET_SOURCE_REQUIRED;controls();return;}
        flow.digest=a.sourceDigest;flow.authority=a;
        const count=a.preview.changes.length,events=a.preview.eventDetails.length;
        review({command:'publish-flow'},value.month+'の勤務・備考等 '+count+'件、共有イベント '+events+'件を反映し、月全体を公開します。希望休の締切とは独立です。公開済み勤務の変更は本人同意・承認待ちになります。空欄は削除として反映し、未設定の日を公休にしません。シートを確認済みですか？',a.preview.changes.some(c=>c.published));return;
      }
      if(['batchRead','sheetImport','monthPublish','deadlineRange'].includes(request.command))updateBatch(value);else{snapshot.halves[expected.period]=value;render();}
      if(request.command==='sheetImport'&&flow){options.onSaved?.();publishImported();return;}
      if(request.command==='monthPublish'){flow=null;n.status.textContent='月全体の公開・変更反映を確認しました。公開済み勤務の変更は本人同意・承認後に反映します。';}
      else if(request.command==='deadlineRange')n.status.textContent=expected.startDay+'〜'+expected.endDay+'の希望締切を '+new Date(expected.deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）に設定しました。';
      else if(request.command==='review'){
        const approved=value.requests.find(r=>r.requestId===expected.requestId&&r.status==='APPROVED'&&r.payload.sheetPreference);
        n.status.textContent=approved?(approved.payload.sheetPreference.conflict?'承認し、非公開備考へ希望休と【希望休と競合】を追記しました。既存シフトは残っています。スプレッドシートで調整してください。':'承認し、非公開備考へ希望休を追記しました。'):messages[reply.code];
      }else n.status.textContent=snapshot?.halves.FIRST.inputMode!=='SHEET'?messages.SCHEDULE_SHEET_SOURCE_REQUIRED:messages[reply.code];
      if(!READS.has(request.command))options.onSaved?.();controls();
    });
    n.refresh.addEventListener('click',()=>void load());n.month.addEventListener('change',()=>void load());n.period.addEventListener('change',()=>{if(!pending&&!uncertain&&!confirmation&&!flow)render();});
    for(const key of ['edit','requests'])n[key+'-tab'].addEventListener('click',()=>{if(pending||uncertain||confirmation||flow)return;category=key;controls();});
    for(const key of ['edit','requests'])n[key+'-tab'].addEventListener('keydown',event=>{if(pending||uncertain||confirmation||flow)return;if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();category=event.key==='Home'?'edit':event.key==='End'?'requests':category==='edit'?'requests':'edit';controls();n[category+'-tab'].focus();});
    n['sheet-create'].addEventListener('click',()=>{if(canAct())review({command:'sheetCreate',input:{month:n.month.value,audience:'admin'}},n.month.value+'の入力シートを作成します。既存の入力は保持します。新しい月の従業員メモだけ、直近の過去月から初回継承します。');});
    n['deadline-save'].addEventListener('click',()=>{
      if(!canAct())return;const startDay=n['deadline-start'].value,endDay=n['deadline-end'].value;let deadline;
      try{const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;if(!valid(startDay)||!valid(endDay)||startDay>endDay||!n.deadline.value)throw Error();deadline=new Date(n.deadline.value+':00+09:00').toISOString();}catch(_e){n.status.textContent='希望の開始日・終了日・締切日時を確認してください。';return;}
      review({command:'deadlineRange',input:{month:snapshot.month,audience:'admin',startDay,endDay,deadline,expectedDeadlineRevision:snapshot.halves.FIRST.deadlineRevision||0}},startDay+'〜'+endDay+'の希望を、'+new Date(deadline).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）に締め切ります。重なる日は今回の締切を優先し、既に届いた申請は残します。設定しますか？');
    });
    n.publish.addEventListener('click',()=>{if(!canAct()||n.publish.disabled)return;flow={confirmed:false};void send('sheetRead',{month:n.month.value,audience:'admin'});});
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
