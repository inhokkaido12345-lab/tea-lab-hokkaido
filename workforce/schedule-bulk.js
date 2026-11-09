/**
 * 月型シフトの状態→表示→一括通信。セル入力/コピペ/従業員ページ切替はページ内だけ。
 * 削除影響: 月型編集の入口が停止。既存半月画面/原簿/従業員の希望受付は維持。
 * 概念: local draft / one bulk command / fixed-id retry / authenticated snapshot。
 * 魔改造: 描画はrenderGrid、入力記号はModel、保存はsend。セルイベントでsendを呼ばない。
 * 境界: 固定iframe・nonce/command・全体HMAC・両半月DTOを照合してから表示。GASが最終認可。
 * 未保存データ/token/再送IDをStorage/URL/ログへ保存しない。離脱は破棄し自動再送しない。
 */
(function(global){'use strict';
  const ACTION='bridgeScheduleV1',TYPE='TLH_BRIDGE_SCHEDULE',PAGE_SIZE=25;
  const messages={SCHEDULE_READY:'この月のシフトを読み込みました。',SCHEDULE_SAVED:'変更をまとめて下書き保存しました。確定公開は半月別の画面で行ってください。',SCHEDULE_ALREADY_DONE:'同じ操作は保存済みです。最新の状態を表示しました。',SCHEDULE_CONSENT_REQUIRED:'下書きと確定後の変更案を保存しました。確定済みの日は本人の同意・承認後に反映されます。',SCHEDULE_INVALID:'日付・勤務区間・休暇・変更理由を確認してください。',SCHEDULE_CHANGED:'他の操作で予定が変わりました。入力はこの画面に残しています。最新状態を読み直して調整してください。',SCHEDULE_PERMISSION_REQUIRED:'管理者権限を確認できません。管理者のLINEでログインしてください。',SCHEDULE_EMPLOYEE_REQUIRED:'有効な従業員登録を確認できません。最新の従業員一覧を読み直してください。',SCHEDULE_REQUEST_PENDING:'変更対象の日に未処理の申請があります。個別画面で確認してください。',SCHEDULE_OPERATION_REUSED:'操作番号と入力が一致しません。保存状態を確認してください。',SCHEDULE_LEAVE_CONFLICT:'全日休暇と勤務・用事が重なっています。',SCHEDULE_REQUIRED_WORK:'会社が指示する用事を勤務対象から外せません。',SCHEDULE_WORK_ASSESSMENT_REQUIRED:'用事の勤務算入の確認が必要です。',SCHEDULE_REVIEW_REQUIRED:'シフト保存先の確認が必要です。入力を残し、管理者へ連絡してください。',SCHEDULE_STORAGE_INVALID:'シフト保存先の構成を確認してください。',SCHEDULE_WRITE_UNAVAILABLE:'保存できず、今回の変更は戻されています。入力を確認して再実行できます。',SCHEDULE_CAPACITY:'処理上限を超えています。一度の変更は500日分までです。',SCHEDULE_UNAVAILABLE:'応答を確認できません。保存操作は同じ操作で結果を再確認してください。',WRITE_REVIEW_REQUIRED:'原簿の整合性確認が必要です。',ENROLLMENT_BUSY:'他の操作が処理中です。時間を置いて再確認してください。'};
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
  Object.assign(messages,{SCHEDULE_SHEET_READY:'入力シートを確認しました。',SCHEDULE_SHEET_CONFIGURATION_REQUIRED:'入力シートの接続設定が必要です。管理者へ連絡してください。',SCHEDULE_SHEET_NOT_FOUND:'この月の入力シートはありません。「入力シートを作成」から用意してください。',SCHEDULE_SHEET_INVALID:'入力シートの形式・店舗・日付を確認してください。既存の入力は上書きしていません。',SCHEDULE_SHEET_REVIEW_REQUIRED:'入力シートの作成結果を確認してください。再作成や上書きは行っていません。'});
  function related(source,target){try{for(let i=0;source&&i<8;i++){if(source===target)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch(_e){}return false;}
  async function verify(d,r){
    if(!d||d.type!==TYPE||d.action!==ACTION||d.command!==r.command||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||typeof d.data!=='string'||d.data.length>1500000||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,ACTION,d.command,d.nonce,d.code,d.data].join('\n')));
  }
  Object.assign(messages,{SCHEDULE_SHEET_SOURCE_REQUIRED:'シフトの作成・訂正は正本シートで行ってください。',SCHEDULE_SHEET_CONTENT_REQUIRED:'正本シートと申請・下書きの内容が一致しません。',SCHEDULE_SHEET_CHANGED:'確認後に正本シートが変わりました。取り込み直してください。',SCHEDULE_SHEET_AUX_REQUIRED:'用事・休暇詳細・共有イベントの入力タブが必要です。',SCHEDULE_SHEET_FORMAT_REQUIRED:'正本シートには3行形式が必要です。',SCHEDULE_SHEET_ROSTER_REQUIRED:'正本シートには全従業員の行が必要です。'});
  function validAuthority(a,s){
    if(!a||s?.halves.FIRST.inputMode!=='SHEET'||Object.keys(a).sort().join(',')!=='preview,sourceDigest,targetDigest'||![a.sourceDigest,a.targetDigest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))return false;
    const p=a.preview;if(!p||Object.keys(p).sort().join(',')!=='blanks,changes,eventChanges,eventDetails,month,unchanged'||p.month!==s.month||!Array.isArray(p.changes)||p.changes.length>500||![p.blanks,p.unchanged,p.eventChanges].every(v=>Number.isSafeInteger(v)&&v>=0)||p.eventChanges>2||!Array.isArray(p.eventDetails)||p.eventDetails.length>31||!p.eventDetails.every(e=>e&&typeof e==='object'&&Object.keys(e).sort().join(',')==='after,before,day,published'&&global.TlhScheduleBulkModel.days(s.month).includes(e.day)&&typeof e.published==='boolean'&&e.published===(s.halves[global.TlhScheduleBulkModel.half(e.day)].phase==='PUBLISHED')&&[e.before,e.after].every(v=>typeof v==='string'&&v.length<=1000))||new Set(p.eventDetails.map(e=>e.day)).size!==p.eventDetails.length||new Set(p.eventDetails.map(e=>global.TlhScheduleBulkModel.half(e.day))).size!==p.eventChanges)return false;
    const people=new Map(s.halves.FIRST.employees.map(v=>[v.employeeCode,v.employeeName])),seen=new Set();
    return p.changes.every(c=>{if(!c||typeof c!=='object')return false;const key=c.employeeCode+'|'+c.day;if(seen.has(key))return false;seen.add(key);return Object.keys(c).sort().join(',')==='after,before,day,employeeCode,employeeName,expectedPlanRevision,plan,published,workText'&&people.get(c.employeeCode)===c.employeeName&&global.TlhScheduleBulkModel.days(s.month).includes(c.day)&&typeof c.published==='boolean'&&c.published===(s.halves[global.TlhScheduleBulkModel.half(c.day)].phase==='PUBLISHED')&&Number.isSafeInteger(c.expectedPlanRevision)&&c.expectedPlanRevision>=0&&[c.before,c.after,c.workText].every(v=>typeof v==='string'&&v.length<=16000)&&c.plan?.day===c.day&&global.TlhSchedule.validatePlan(c.plan);});
  }
  function init(options){
    const model=global.TlhScheduleBulkModel,n=Object.fromEntries(['month','load','status','phases','head','rows','prev','next','page','detail','selected','appointments','note','public-note','reason','count','save','retry','frame','login','template','file','import-preview','import-summary','import-rows','import-apply','import-cancel','sheet-read','sheet-create','sheet-open','sheet-confirm','sheet-question','sheet-approve','sheet-cancel'].map(id=>[id,document.getElementById('bulk-'+id)]));
    let snapshot=null,pending=null,uncertain=null,stopped=false,page=0,selected=null,needReload=false;
    const drafts=new Map(),texts=new Map(),errors=new Map(),cells=new Map();
    let importPreview=null,importing=false,directImport=false,createReview=false,authority=null;
    const sheetMode=()=>snapshot?.halves.FIRST.inputMode==='SHEET';
    const scope=()=>options.scope||global.TlhCurrentWorkplace?.config;
    n['sheet-open'].hidden=true;
    function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent?.appendChild(node);return node;}
    function people(){return snapshot?.halves.FIRST.employees||[];}
    function current(code,day){return drafts.get(model.key(code,day))||model.input(model.oldPlan(snapshot,code,day)?.plan);}
    function unsaved(){try{return !!errors.size||!!currentPayload()?.changes.length;}catch(_e){return drafts.size>0;}}
    function currentPayload(){return snapshot?model.payload(snapshot,drafts,n.reason.value):null;}
    function controls(){
      const locked=stopped||!!pending||!!uncertain||!snapshot||importing||!!importPreview||createReview;
      n.status.setAttribute('aria-busy',String(!!pending||importing));n.month.disabled=stopped||!!pending||!!uncertain||importing||!!importPreview||createReview;n.load.disabled=n.month.disabled;
      n['sheet-confirm'].hidden=!createReview;n['sheet-approve'].disabled=stopped||!!pending||!!uncertain||!createReview||!snapshot;n['sheet-cancel'].disabled=stopped||!!pending||!!uncertain;
      n.template.disabled=locked||needReload;n.file.disabled=locked||unsaved()||needReload;
      n['sheet-read'].disabled=n.file.disabled;n['sheet-create'].disabled=n.file.disabled;
      n.template.disabled=n.template.disabled||sheetMode();n.file.disabled=n.file.disabled||sheetMode();
      n['sheet-create'].textContent=n.month.value?Number(n.month.value.slice(0,4))+'年'+Number(n.month.value.slice(5))+'月用の入力シートを作成':'選択月の入力シートを作成';
      n['import-apply'].disabled=stopped||!!pending||!!uncertain||!(importPreview?.changes.length||authority?.preview.eventChanges);n['import-cancel'].disabled=stopped||!!pending||!!uncertain;
      n.prev.disabled=locked||page===0;n.next.disabled=locked||(page+1)*PAGE_SIZE>=people().length;
      n.detail.disabled=locked||!selected||sheetMode();n.reason.disabled=stopped||!!pending||!!uncertain||!snapshot||importing;
      for(const cell of cells.values())cell.disabled=locked||sheetMode();
      // モード未確認を旧編集モードと推測しない。初期HTML/認証失敗/退場でも編集案内を隠す。
      const manualAvailable=!!snapshot&&!sheetMode();
      document.getElementById('bulk-manual').hidden=!manualAvailable;document.getElementById('bulk-csv-tools').hidden=!manualAvailable;n.save.hidden=!manualAvailable;n.count.hidden=!manualAvailable;
      document.getElementById('bulk-title').textContent=!snapshot?'シフトの取込み':sheetMode()?'正本シートからシフトを取り込む':'月間シフトをまとめて編集';
      document.getElementById('bulk-mode-description').textContent=!snapshot?'対象月を読み込み、利用できる取込み方法を確認します。':sheetMode()?'勤務・備考・用事・休暇詳細・共有イベントはスプレッドシートだけで編集します。この画面は読取り・確認・取込み専用です。空欄の勤務・備考は削除として反映します。':'全従業員・月全体をまとめて編集し、最後に1回保存します。入力途中の通信はありません。招待待ちの従業員も対象です。';
      let count=0;try{count=currentPayload()?.changes.length||0;}catch(_e){count=drafts.size;}
      n.count.textContent='未保存の変更：'+count+'日分'+(errors.size?' / 入力エラー：'+errors.size+'件':'');
      n.save.disabled=locked||needReload||!!errors.size||count===0||count>500;n.retry.hidden=!uncertain;n.retry.disabled=stopped||!!pending;
      n.retry.textContent=uncertain?.command==='sheetCreate'?'同じ操作で作成結果を再確認':'同じ操作で保存結果を再確認';
    }
    function clearImport(){importPreview=null;directImport=false;authority=null;n.file.value='';n['import-preview'].hidden=true;n['import-rows'].replaceChildren();n['import-summary'].textContent='';n['import-apply'].textContent='この内容を編集表へ反映';}
    function clear(){snapshot=null;createReview=false;clearImport();n['sheet-open'].hidden=true;n['sheet-open'].href='';drafts.clear();texts.clear();errors.clear();cells.clear();selected=null;n.head.replaceChildren();n.rows.replaceChildren();n.phases.textContent='';n.note.value='';n['public-note'].value='';n.reason.value='';n.appointments.textContent='';n.selected.textContent='勤務日のメモ';controls();}
    function selectCell(code,day){
      selected={code,day};const person=people().find(p=>p.employeeCode===code),p=current(code,day);
      n.selected.textContent=(person?.employeeName||code)+'（'+code+'） '+day;
      n.note.value=p.note;n['public-note'].value=p.publicNote||'';
      n.appointments.textContent=p.appointments.length?'既存の用事を保持：'+p.appointments.map(a=>a.title).join('、'):'既存の用事：なし';controls();
    }
    function mark(code,day,value){
      const target=model.key(code,day),old=model.oldPlan(snapshot,code,day)?.plan,base=drafts.get(target)||model.input(old);
      texts.set(target,value);
      try{const p=model.parse(value,base===undefined?old:old?base:{...base,periods:[],leave:{type:'NONE',unit:'DAY',minutes:null,note:''}});drafts.set(target,p);errors.delete(target);}
      catch(error){errors.set(target,error.message);}
      const cell=cells.get(target);if(cell){cell.setAttribute('aria-invalid',String(errors.has(target)));cell.title=errors.get(target)||'';cell.parentElement?.classList?.toggle('is-dirty',errors.has(target)||drafts.has(target));}
      n.status.textContent=errors.has(target)?errors.get(target):'入力を変更しました。まだ保存していません。';controls();
    }
    function paste(code,day,event){
      const text=event.clipboardData?.getData('text/plain');if(!text||!text.includes('\t')||pending||uncertain||stopped)return;
      event.preventDefault();
      try{
        const calendar=model.days(snapshot.month),startRow=people().findIndex(p=>p.employeeCode===code),startCol=calendar.indexOf(day),rows=text.replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n').map(r=>r.split('\t')),prepared=[];
        rows.forEach((row,i)=>row.forEach((value,j)=>{const person=people()[startRow+i],date=calendar[startCol+j];if(!person||!date)throw Error('貼り付け範囲が従業員・日付の範囲を超えています。');if(!value.trim())return;prepared.push({code:person.employeeCode,day:date,value,plan:model.parse(value,current(person.employeeCode,date))});}));
        for(const p of prepared){const k=model.key(p.code,p.day);drafts.set(k,p.plan);texts.set(k,p.value);errors.delete(k);}renderGrid();n.status.textContent=prepared.length+'日分を入力しました。まだ保存していません。';
      }catch(error){n.status.textContent=error.message;}
    }
    function renderGrid(){
      n.head.replaceChildren();n.rows.replaceChildren();cells.clear();if(!snapshot)return;
      const calendar=model.days(snapshot.month),header=el('tr',undefined,n.head);el('th','従業員',header);
      for(const day of calendar){const date=new Date(day+'T00:00:00+09:00'),th=el('th',Number(day.slice(8))+'日',header);el('small',new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',weekday:'short'}).format(date),th);if(['土','日'].includes(new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',weekday:'short'}).format(date)))th.className='is-weekend';if(day.endsWith('-16'))th.className+=' is-second';}
      const visible=people().slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
      for(const person of visible){const tr=el('tr',undefined,n.rows),th=el('th',person.employeeName,tr);th.scope='row';el('small',person.employeeCode+(person.registrationStatus==='PENDING_LINK'?' / 招待待ち':''),th);
        for(const day of calendar){const k=model.key(person.employeeCode,day),td=el('td',undefined,tr),field=el('textarea',undefined,td);field.rows=2;field.maxLength=2000;field.value=texts.has(k)?texts.get(k):model.format(model.oldPlan(snapshot,person.employeeCode,day)?.plan);
          field.setAttribute('aria-label',person.employeeName+'（'+person.employeeCode+'） '+day+' 勤務');field.setAttribute('aria-invalid',String(errors.has(k)));if(drafts.has(k))td.className='is-dirty';if(day.endsWith('-16'))td.className+=' is-second';field.title=errors.get(k)||'';
          field.addEventListener('focus',()=>selectCell(person.employeeCode,day));field.addEventListener('input',()=>{if(!pending&&!uncertain&&!stopped)mark(person.employeeCode,day,field.value);});field.addEventListener('paste',event=>paste(person.employeeCode,day,event));cells.set(k,field);
        }
      }
      n.page.textContent=people().length?(page*PAGE_SIZE+1)+'〜'+Math.min((page+1)*PAGE_SIZE,people().length)+'人 / 全'+people().length+'人':'有効な従業員がいません。先に事前登録してください。';controls();
    }
    function render(value){
      clearImport();
      snapshot=value;page=0;needReload=false;drafts.clear();texts.clear();errors.clear();selected=null;n.note.value='';n['public-note'].value='';n.reason.value='';n.appointments.textContent='';n.selected.textContent='勤務日のメモ';
      // 管理者認可済みの返信だけから固定入力先を表示。公開ソースにファイルIDを埋め込まない。
      if(value.inputSheetUrl){n['sheet-open'].hidden=false;n['sheet-open'].href=value.inputSheetUrl;}
      const labels={NOT_OPEN:'未設定',DRAFT:'下書き',COLLECTING:'希望受付中',PUBLISHED:'確定済（変更は本人同意待ち）'};
      n.phases.textContent=['FIRST','SECOND'].map((part,i)=>(i?'後半':'前半')+'：'+labels[value.halves[part].phase]+(value.halves[part].deadline?' / 希望締切 '+new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'}).format(new Date(value.halves[part].deadline)):'' )).join('　｜　');renderGrid();
      if(value.halves.FIRST.legacyAvailable)n.phases.textContent+='　従来の月全体データもあります。個別画面の「従来の月全体データ」で確認してください。';
    }
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    async function send(request){
      if(pending||stopped)return;
      if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      let proof;try{proof=options.liff.getIDToken();}catch(_e){}if(typeof proof!=='string'||!proof){n.status.textContent='LINEログインが必要です。';n.login.hidden=false;return;}
      const r={...request,nonce:random(16),responseKey:random(32)};pending=r;controls();n.status.textContent={batchRead:'月全体を読み込んでいます。',sheetRead:'入力シートから直接読み込んでいます。',sheetCreate:'選択月の入力シートを用意しています。'}[request.command]||'変更をまとめて保存しています。';
      function unknown(){if(pending!==r||stopped)return;if(['batchPlan','sheetCreate','sheetImport'].includes(r.command))uncertain={command:r.command,input:r.input,operationId:r.operationId};n.status.textContent=r.command==='sheetCreate'?'作成結果を確認できません。同じ操作で再確認してください。既存の月は上書きしません。':['batchPlan','sheetImport'].includes(r.command)?'保存結果を確認できません。入力を変更せず「同じ操作で保存結果を再確認」を押してください。':'読込み結果を確認できません。もう一度読み込んでください。';finish();}
      r.timer=setTimeout(unknown,30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhScheduleBulkFrame';form.hidden=true;
      for(const [name,value]of Object.entries({action:ACTION,command:r.command,input:r.input,operationId:r.operationId,idToken:proof,nonce:r.nonce,responseKey:r.responseKey})){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);}
      document.body.appendChild(form);try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){unknown();}finally{form.remove();}
    }
    async function load(){
      if(pending||uncertain||stopped||importing||importPreview||createReview)return;
      if(unsaved()&&!global.confirm('未保存の入力を破棄し、最新の状態を読み込みます。続けますか？')){if(snapshot)n.month.value=snapshot.month;return;}
      try{model.days(n.month.value);}catch(error){n.status.textContent=error.message;return;}
      clear();await send({command:'batchRead',input:JSON.stringify({month:n.month.value,audience:'admin'}),operationId:''});
    }
    function save(){
      if(sheetMode()||pending||uncertain||stopped||!snapshot||needReload||errors.size||importing||importPreview||createReview)return;
      try{
        const payload=currentPayload();if(!payload.changes.length)return;
        const published=payload.changes.filter(c=>snapshot.halves[model.half(c.day)].phase==='PUBLISHED').length;
        if(published&&!n.reason.value.trim()){n.status.textContent='確定済み期間の変更理由を入力してください。';n.reason.focus();return;}
        const codes=[...new Set(payload.changes.map(c=>c.employeeCode))],names=codes.map(code=>{const p=people().find(p=>p.employeeCode===code);return p.employeeName+'（'+code+'）';});
        if(!global.confirm(payload.month+' / '+names.join('、')+'\n下書き '+(payload.changes.length-published)+'日分 / 確定後の変更案 '+published+'日分\n変更した日だけまとめて保存します。確定後は本人同意・承認が必要です。続けますか？'))return;
        const serialized=JSON.stringify(payload);if(serialized.length>600000)throw Error('入力が大きすぎます。変更範囲を分けて保存してください。');
        void send({command:'batchPlan',input:serialized,operationId:random(16)});
      }catch(error){n.status.textContent=error.message;}
    }
    global.addEventListener('message',async event=>{
      const r=pending;if(stopped||!r||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      let valid=false;try{valid=await verify(event.data,r);}catch(_e){}if(stopped||pending!==r)return;
      if(!valid){if(['sheetRead','sheetCreate'].includes(r.command)&&event.data?.type===TYPE&&event.data?.nonce===r.nonce)n.status.textContent='入力シートの応答の署名を確認できません。保存は行っていません。';return;}
      const d=event.data;let value=null;if(d.data){try{value=JSON.parse(d.data);}catch(_e){return;}
        if(['sheetRead','sheetCreate'].includes(r.command)){
          const problem=d.code!=='SCHEDULE_SHEET_READY'||!value||!['csv,month,sheet,snapshot,version','authority,csv,month,sheet,snapshot,version'].includes(Object.keys(value).sort().join(','))?'D1':value.version!==1||value.month!==JSON.parse(r.input).month?'D2':!model.validate(value.snapshot,value.month)?'D3':typeof value.csv!=='string'||value.csv.length>1000000?'D4':!value.sheet||Object.keys(value.sheet).sort().join(',')!=='created,url'||typeof value.sheet.created!=='boolean'?'D5':typeof value.sheet.url!=='string'||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit#gid=\d+$/.test(value.sheet.url)?'D6':r.command==='sheetCreate'&&value.csv!==''?'D7':value.authority&&!validAuthority(value.authority,value.snapshot)?'D8':r.command==='sheetRead'&&value.snapshot.halves.FIRST.inputMode==='SHEET'&&!value.authority?'D9':'';
          if(problem){finish();clear();n.status.textContent='入力シートの応答形式を確認できません（確認番号 '+problem+'）。保存は行っていません。';return;}
          uncertain=null;finish();render(value.snapshot);n['sheet-open'].href=value.sheet.url;n['sheet-open'].hidden=false;
          if(r.command==='sheetRead'){try{showImport(value.authority?value.authority.preview:global.TlhScheduleSheet.preview(value.csv,snapshot,scope()),true);authority=value.authority||null;if(authority){n['import-apply'].textContent='確認した正本シートを取り込む';n['import-summary'].textContent+=' 共有イベントの変更：'+authority.preview.eventChanges+'期間。空欄は既存内容の削除として反映します。';controls();}}catch(error){n.status.textContent=error.message;controls();}}
          else n.status.textContent=value.sheet.created?'入力シートを作成しました。「入力シートを開く」から記入できます。':'この月の入力シートは作成済みです。既存の入力を保持しています。';
          return;
        }
        if(!model.validate(value,JSON.parse(r.input).month))return;
      }
      if(['SCHEDULE_READY','SCHEDULE_SAVED','SCHEDULE_ALREADY_DONE','SCHEDULE_CONSENT_REQUIRED','SCHEDULE_SHEET_READY'].includes(d.code)&&!value)return;
      if(value){uncertain=null;finish();render(value);}else{
        if(['batchPlan','sheetCreate','sheetImport'].includes(r.command)&&['SCHEDULE_UNAVAILABLE','SCHEDULE_REVIEW_REQUIRED','SCHEDULE_SHEET_REVIEW_REQUIRED'].includes(d.code))uncertain={command:r.command,input:r.input,operationId:r.operationId};
        else uncertain=null;
        if(d.code==='SCHEDULE_PERMISSION_REQUIRED')clear();if(['SCHEDULE_SHEET_CHANGED','SCHEDULE_CHANGED'].includes(d.code))clearImport();
        needReload=['SCHEDULE_CHANGED','SCHEDULE_EMPLOYEE_REQUIRED','SCHEDULE_OPERATION_REUSED'].includes(d.code);finish();
      }
      n.status.textContent=messages[d.code];
    });
    /** 同じプレビューをCSVと直接READで共用。直接READもここまでは原簿を保存しない。 */
    function showImport(result,direct=false){
      importPreview=result;directImport=direct;n['import-rows'].replaceChildren();
      for(const change of result.changes){const tr=el('tr',undefined,n['import-rows']);for(const text of [change.employeeCode+'（'+change.employeeName+'）',change.day,change.before,change.after,change.published?'本人同意待ちの変更案':'下書き'])el('td',text,tr);}
      for(const change of result.eventDetails||[]){const tr=el('tr',undefined,n['import-rows']);for(const text of ['共有イベント',change.day,change.before,change.after,change.published?'取込み時に共有イベントを更新':'下書き'])el('td',text,tr);}
      n['import-summary'].textContent=result.month+' / 変更 '+result.changes.length+'日分'+(sheetMode()?'':' / 空欄読飛ばし '+result.blanks)+' / 同内容 '+result.unchanged+'。まだ保存していません。';
      n['import-apply'].textContent=direct?'確認した内容を一括保存':'この内容を編集表へ反映';n['import-preview'].hidden=false;
      n.status.textContent=direct?'入力シートを直接読み込みました。変更前後を確認して一括保存してください。':'変更前後を確認し「この内容を編集表へ反映」を押してください。保存・確定公開は別の操作です。';controls();
    }
    /** CSVは台帳ではない。ファイル選択/プレビュー/反映はローカルだけで、saveだけが既存batchPlanへ送信する。 */
    async function previewFile(file){
      if(sheetMode()||stopped||pending||uncertain||importing||importPreview||!snapshot||needReload||unsaved())return;
      const source=snapshot;importing=true;controls();
      try{
        if(!file||file.size>global.TlhScheduleSheet.MAX_BYTES)throw Error('UTF-8のCSV（2MB以内）を選んでください。');
        const text=await file.text();if(stopped||snapshot!==source)return;
        const result=global.TlhScheduleSheet.preview(text,source,scope());
        showImport(result);
      }catch(error){if(!stopped)n.status.textContent=error.message;}
      finally{importing=false;n.file.value='';controls();}
    }
    function applyImport(){
      if(stopped||pending||uncertain||!importPreview)return;
      if(authority){
        const reason=n.reason.value;if(authority.preview.changes.some(c=>c.published)&&!reason.trim()){n.status.textContent='確定済み期間の変更理由を入力してください。';n.reason.focus();return;}
        if(!global.confirm('正本シートの変更 '+authority.preview.changes.length+'日分と共有イベントを取り込みます。空欄は削除として反映します。確定後の勤務変更は同意・承認待ちです。続けますか？'))return;
        void send({command:'sheetImport',input:JSON.stringify({month:snapshot.month,audience:'admin',sourceDigest:authority.sourceDigest,targetDigest:authority.targetDigest,reason}),operationId:random(16)});return;
      }
      const saveDirect=directImport;for(const change of importPreview.changes){const k=model.key(change.employeeCode,change.day);drafts.set(k,change.plan);texts.set(k,change.workText??model.format(change.plan));}
      clearImport();renderGrid();n.status.textContent='CSVの変更を編集表へ反映しました。内容を確認し「変更をまとめて保存」を押してください。まだ保存していません。';
      if(saveDirect)save();
    }
    n.template.addEventListener('click',()=>{
      if(sheetMode()||stopped||pending||uncertain||!snapshot||importing||importPreview||needReload)return;
      try{const text=global.TlhScheduleSheet.template(snapshot,scope()),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='TLH-shift-input-'+snapshot.month+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);n.status.textContent='この月の空の入力ひな形を保存しました。既存のシフトは含めず、空欄は取込み時に読み飛ばします。';}catch(error){n.status.textContent=error.message;}
    });
    n.file.addEventListener('change',()=>void previewFile(n.file.files?.[0]));n['import-apply'].addEventListener('click',applyImport);n['import-cancel'].addEventListener('click',()=>{if(!stopped&&!pending&&!uncertain){clearImport();controls();n.status.textContent='CSVの取込みを取り消しました。保存はしていません。';}});
    function sheetRequest(command){
      if(stopped||pending||uncertain||!snapshot||unsaved()||importPreview||importing||needReload||createReview)return;
      if(command==='sheetCreate'){createReview=true;n['sheet-question'].textContent=snapshot.month+'用の入力タブを用意します。既にある月の入力は上書きしません。勤怠や確定シフトは変更しません。';controls();return;}
      void send({command,input:JSON.stringify({month:snapshot.month,audience:'admin'}),operationId:command==='sheetCreate'?random(16):''});
    }
    // ブラウザ標準confirmが表示されない端末でも、対象月の明示確認を画面内で完了させる。
    n['sheet-approve'].addEventListener('click',()=>{if(!createReview||stopped||pending||uncertain||!snapshot)return;createReview=false;void send({command:'sheetCreate',input:JSON.stringify({month:snapshot.month,audience:'admin'}),operationId:random(16)});});
    n['sheet-cancel'].addEventListener('click',()=>{if(stopped||pending||uncertain)return;createReview=false;controls();});
    n['sheet-read'].addEventListener('click',()=>sheetRequest('sheetRead'));n['sheet-create'].addEventListener('click',()=>sheetRequest('sheetCreate'));
    n.load.addEventListener('click',()=>void load());n.month.addEventListener('change',()=>void load());n.save.addEventListener('click',save);
    n.retry.addEventListener('click',()=>{if(uncertain&&!pending&&!stopped)void send({...uncertain});});
    n.prev.addEventListener('click',()=>{if(!pending&&!uncertain&&page>0){page--;renderGrid();}});n.next.addEventListener('click',()=>{if(!pending&&!uncertain&&(page+1)*PAGE_SIZE<people().length){page++;renderGrid();}});
    for(const id of ['note','public-note'])n[id].addEventListener('input',()=>{if(!selected||pending||uncertain||stopped)return;const p=current(selected.code,selected.day);p.note=n.note.value;if(n['public-note'].value)p.publicNote=n['public-note'].value;else delete p.publicNote;drafts.set(model.key(selected.code,selected.day),p);controls();});
    global.addEventListener('beforeunload',event=>{if(!stopped&&(unsaved()||uncertain||['batchPlan','sheetCreate','sheetImport'].includes(pending?.command))){event.preventDefault();event.returnValue='';}});
    global.addEventListener('pagehide',()=>{stopped=true;uncertain=null;finish();clear();});controls();
    return Object.freeze({load,previewFile});
  }
  global.TlhScheduleBulk=Object.freeze({init,verify});
  if(document.currentScript?.dataset.bootstrap==='true')global.addEventListener('DOMContentLoaded',async()=>{
    const login=document.getElementById('bulk-login'),status=document.getElementById('bulk-status');
    login.addEventListener('click',()=>global.liff.login({redirectUri:global.location.origin+global.location.pathname}));
    try{global.TlhAutoRead.init();await global.liff.init({liffId:'2011940133-JXUDzLnG'});if(!global.liff.isLoggedIn()){login.hidden=false;status.textContent='管理者のLINEログインが必要です。';status.setAttribute('aria-busy','false');return;}
      document.getElementById('bulk-month').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
      await init({gasUrl:global.TlhCurrentWorkplace.config.endpoint,liff:global.liff}).load();
    }catch(_e){status.textContent='通信を開始できません。LINEから開き直してください。';status.setAttribute('aria-busy','false');}
  });
})(window);
