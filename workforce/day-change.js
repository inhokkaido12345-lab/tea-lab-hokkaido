/**
 * 通信表示: aria-busyを実pendingに同期し、CSSだけで回す。成功/失敗/timeout後は停止。認可/送信条件は不変。
 * 日別訂正UI。本人申請/管理者直接訂正/管理者承認→署名付きpreview→明示確認→同じgroupで保存。
 * day-change.htmlは本人申請専用、admin-day-change.htmlは直接訂正/承認専用。同じ処理を共有。
 * ページのdata-audienceは表示/操作の分類で認可ではない。削除しても原簿/訂正履歴は残る。
 * 概念: immutable review / unknown outcome。通信ごとにnonce/鍵を更新、操作groupは保存結果確定まで固定。
 * 改造はBridgeAttendanceDayChange/Service/両repo試験と同期。時刻はJST入力→UTC、端末のTZを信じない。
 * token/氏名/時刻/理由/鍵はURL/ログ/Storageへ出さない。申請番号は明示コピーだけ。
 * 検証: day-change.test.mjs→全回帰→公開/実訂正の別受入れ。initだけでは通信/書込しない。
 */
(function(global){'use strict';
  const config=Object.freeze({liffId:'2011940133-JXUDzLnG',gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec'});
  const TYPE='TLH_BRIDGE_ATTENDANCE_DAY_CHANGE',ACTION='bridgeAttendanceDayChangeV2';
  const messages=Object.freeze({CHANGE_READY:'内容を確認してください。',CHANGE_REQUESTED:'訂正申請を保存しました。管理者の承認待ちです。',CHANGE_APPLIED:'訂正を反映しました。日別記録を読み直してください。',
    CHANGE_INVALID:'日付・出退勤・休憩・理由を確認してください。',CHANGE_NOT_FOUND:'指定した申請を確認できません。',CHANGE_DAY_CHANGED:'確認後に記録が変わりました。内容を確認し直してください。',
    CHANGE_REVIEW_REQUIRED:'記録の確認が必要です。操作を止めて管理者に知らせてください。',CHANGE_BUSY:'別の処理中です。',CHANGE_EMPLOYEE_REQUIRED:'有効な従業員登録がありません。',
    CHANGE_UNAVAILABLE:'結果を確認できません。操作を繰り返さず、内容の確認で結果を読み直してください。',WRITE_REVIEW_REQUIRED:'保存結果の確認が必要です。操作を止めてください。',
    TLH_ADMIN_REQUIRED:'この操作には管理者権限が必要です。',LINE_VERIFY_REJECTED:'LINE本人確認に失敗しました。',WORK_STATE_ACCOUNT_REQUIRED:'TLHアカウントがありません。',
    WORK_STATE_ACCOUNT_UNAVAILABLE:'アカウントを確認してください。',WORK_STATE_EMPLOYEE_REQUIRED:'有効な従業員登録がありません。',WORK_STATE_ROLE_REQUIRED:'有効な従業員権限がありません。',
    WORK_STATE_NOT_STARTED:'入社日前です。',WORK_STATE_BUSY:'別の処理中です。',ENROLLMENT_BUSY:'別の処理中です。',WORK_STATE_REVIEW_REQUIRED:'記録を確認してください。'});
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
  /** datetime-localの分/秒/小数秒をJSTとして解釈。精度を保持し、暦日の自動補正は拒否する。 */
  function utc(text){if(!text)return'';const m=typeof text==='string'&&text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);if(!m)throw Error('invalid');
    const local=m[1]+':'+(m[2]||'00')+'.'+(m[3]||'').padEnd(3,'0'),value=new Date(local+'+09:00');
    if(!Number.isFinite(value.getTime())||new Date(value.getTime()+9*3600000).toISOString().slice(0,23)!==local)throw Error('invalid');return value.toISOString();}
  const inputErrors=Object.freeze({
    INPUT_MODE:{node:'mode',text:'操作を選んでください。'},INPUT_GROUP:{node:'group',text:'コピーした申請番号を入力してください。'},
    INPUT_EMPLOYEE:{node:'employee',text:'対象の従業員を社員番号（氏名）から選択してください。'},INPUT_DAY:{node:'day',text:'出勤日を年月日まで入力してください。'},
    INPUT_IN:{node:'in',text:'出勤日時を日付と時刻まで入力してください。'},INPUT_OUT:{node:'out',text:'退勤日時を日付と時刻まで入力してください。'},
    INPUT_BREAK_START:{node:'break-start',text:'休憩開始日時を入力してください。休憩なしの場合は開始・終了の両方を空欄にしてください。'},
    INPUT_BREAK_END:{node:'break-end',text:'休憩終了日時を入力してください。休憩なしの場合は開始・終了の両方を空欄にしてください。'},
    INPUT_DAY_MATCH:{node:'in',text:'出勤日時の日付を「出勤日」と同じ日にしてください。'},INPUT_ORDER:{node:'out',text:'退勤日時は出勤日時より後にしてください。'},
    INPUT_DURATION:{node:'out',text:'出勤から退勤は48時間以内で入力してください。'},INPUT_FUTURE:{node:'out',text:'未来の退勤日時は入力できません。日付と年を確認してください。'},
    INPUT_BREAK_ORDER:{node:'break-start',text:'休憩は出勤後・退勤前にし、休憩終了を開始より後にしてください。'},
    INPUT_REASON:{node:'reason',text:'訂正・申請の理由を入力してください。'},INPUT_REASON_FORMAT:{node:'reason',text:'理由は500文字以内の1行で入力し、先頭に = + @ - を付けないでください。'},
    INPUT_SESSION_ORDER:{node:'out',text:'次の出勤は前の退勤より後にしてください。中抜けの勤務を時刻順に入力します。'}
  });
  const stamp=s=>s?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(s)):'なし';
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch(_e){}return false;}
  async function verify(d,r){
    if(!d||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||d.command!==r.command||d.groupId!==r.fields.groupId||typeof d.code!=='string'||!Object.hasOwn(messages,d.code)||
      typeof d.revision!=='string'||typeof d.summary!=='string'||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac)||
      (d.code==='CHANGE_READY'?r.command!=='preview'||!/^[a-f0-9]{64}$/.test(d.revision):d.revision!==''||d.summary!==''))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,ACTION,d.nonce,d.command,d.groupId,d.code,d.revision,d.summary].join('\n')));
  }
  function parseSummary(text,fields){let s;try{s=JSON.parse(text);}catch(_e){return null;}
    const keys=['employeeCode','employeeName','groupId','day','reason','clockIn','clockOut','breakStart','breakEnd'];
    const extended=s&&Object.hasOwn(s,'sessions');if(extended)keys.push('sessions');
    if(!s||Object.keys(s).sort().join(',')!==keys.sort().join(',')||keys.filter(k=>k!=='sessions').some(k=>typeof s[k]!=='string')||s.groupId!==fields.groupId||
      !s.employeeCode||s.employeeName.length>80||s.reason.length>500||!s.reason||!/^\d{4}-\d{2}-\d{2}$/.test(s.day))return null;
    if(fields.mode!=='SELF'&&s.employeeCode!==fields.employeeCode)return null;
    if(fields.mode!=='REVIEW'&&['day','reason','clockIn','clockOut','breakStart','breakEnd'].some(k=>s[k]!==fields[k]))return null;
    for(const k of ['clockIn','clockOut','breakStart','breakEnd'])if(s[k]&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s[k])||!Number.isFinite(Date.parse(s[k]))||new Date(s[k]).toISOString()!==s[k]))return null;
    if(!s.clockIn||!s.clockOut||Date.parse(s.clockIn)>=Date.parse(s.clockOut)||!!s.breakStart!==!!s.breakEnd)return null;
    if(s.breakStart&&!(Date.parse(s.clockIn)<Date.parse(s.breakStart)&&Date.parse(s.breakStart)<Date.parse(s.breakEnd)&&Date.parse(s.breakEnd)<Date.parse(s.clockOut)))return null;
    if(fields.sessions&&!extended)return null;
    if(extended){
      if(!Array.isArray(s.sessions)||!s.sessions.length||s.sessions.length>10)return null;
      let previous=-Infinity;
      for(const q of s.sessions){
        if(!q||Object.keys(q).sort().join(',')!=='breakEnd,breakStart,clockIn,clockOut'||['clockIn','clockOut','breakStart','breakEnd'].some(k=>typeof q[k]!=='string'||q[k]&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(q[k])||!Number.isFinite(Date.parse(q[k]))||new Date(q[k]).toISOString()!==q[k])))return null;
        const start=Date.parse(q.clockIn),end=Date.parse(q.clockOut);if(!Number.isFinite(start)||!Number.isFinite(end)||start<=previous||start>=end||new Date(start+9*3600000).toISOString().slice(0,10)!==s.day||!!q.breakStart!==!!q.breakEnd)return null;
        if(q.breakStart&&!(start<Date.parse(q.breakStart)&&Date.parse(q.breakStart)<Date.parse(q.breakEnd)&&Date.parse(q.breakEnd)<end))return null;previous=end;
      }
      const first=s.sessions[0],last=s.sessions.at(-1);if(s.clockIn!==first.clockIn||s.clockOut!==last.clockOut||s.breakStart!==first.breakStart||s.breakEnd!==first.breakEnd)return null;
      if(fields.mode!=='REVIEW'&&JSON.stringify(s.sessions)!==fields.sessions)return null;
    }
    return s;
  }
  function init(options){
    // 役割を混ぜないUI契約。管理者本人のSELFも従業員ページから行う。GASの最新認可は別途必須。
    const adminPage=options.audience==='admin',employeePage=options.audience==='employee';
    const modes=adminPage?['DIRECT','REVIEW']:employeePage?['SELF']:['SELF','DIRECT','REVIEW'];
    let adminAllowed=!adminPage;
    const names=['mode','employee','target','group','request','inputs','day','in','out','break-start','break-end','reason','preview','commit','review','status','receipt','copy','frame','sessions','add-session'];
    const n=Object.fromEntries(names.map(k=>[k,document.getElementById('change-'+k)]));let pending=null,draft=null,review=null,uncertain=false,stopped=false,completed=false;
    let extras=[],sequence=0;
    const clear=()=>{review=null;n.review.textContent='';n.review.hidden=true;};
    const locked=()=>!!pending||uncertain||completed||stopped;
    function clearExtras(){for(const row of extras)for(const field of Object.values(row.fields))field.value='';extras=[];n.sessions.replaceChildren?.();}
    function controls(){n.status.setAttribute?.('aria-busy',String(!!pending));for(const k of ['mode','employee','group','day','in','out','break-start','break-end','reason'])n[k].disabled=!!pending||uncertain||completed||stopped;
      n.preview.disabled=!!pending||completed||stopped||!adminAllowed;n.commit.disabled=!!pending||!review||uncertain||completed||stopped||!adminAllowed;
      if(adminPage)n.mode.disabled=n.mode.disabled||!adminAllowed;
      n.target.hidden=n.mode.value==='SELF';n.request.hidden=n.mode.value!=='REVIEW';n.inputs.hidden=n.mode.value==='REVIEW';
      n['add-session'].disabled=locked()||extras.length>=9;for(const row of extras){row.remove.disabled=locked();for(const field of Object.values(row.fields))field.disabled=locked();}}
    function invalidateInput(){if(locked())return;draft=null;clear();controls();}
    // 中抜け後の勤務を追加する。固定idの勤務1を残して既存UIの契約を維持する。
    n['add-session'].addEventListener('click',()=>{
      if(locked()||extras.length>=9)return;const row={fields:{},card:document.createElement('section'),title:document.createElement('h3')};row.card.className='extra-session';row.card.appendChild(row.title);sequence++;
      for(const [key,label]of [['in','出勤日時'],['out','退勤日時'],['break-start','休憩開始（任意）'],['break-end','休憩終了（任意）']]){
        const wrapper=document.createElement('label'),field=document.createElement('input');wrapper.textContent=label+'（日本時間）';field.type='datetime-local';field.step='60';field.id='session-'+sequence+'-'+key;field.addEventListener('input',invalidateInput);wrapper.appendChild(field);row.card.appendChild(wrapper);row.fields[key]=field;
      }
      row.remove=document.createElement('button');row.remove.type='button';row.remove.textContent='この勤務区間を取り除く';row.remove.addEventListener('click',()=>{if(locked())return;for(const field of Object.values(row.fields))field.value='';extras=extras.filter(item=>item!==row);row.card.remove();extras.forEach((item,i)=>item.title.textContent='勤務 '+(i+2));invalidateInput();});row.card.appendChild(row.remove);
      extras.push(row);extras.forEach((item,i)=>item.title.textContent='勤務 '+(i+2));n.sessions.appendChild(row.card);invalidateInput();
    });
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    /** 送信前の案内だけ。サーバーの同じ検査・認可・時系列確認は省略しない。 */
    function input(){const mode=n.mode.value;if(!modes.includes(mode))throw Error('INPUT_MODE');
      const groupId=mode==='REVIEW'?n.group.value.trim():draft?.groupId||'chg_'+random(16);if(!/^chg_[a-f0-9]{32}$/.test(groupId))throw Error('INPUT_GROUP');
      const employeeCode=mode==='SELF'?'':n.employee.value.trim();if(mode!=='SELF'&&!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(employeeCode))throw Error('INPUT_EMPLOYEE');
      if(mode==='REVIEW')return{mode,groupId,employeeCode};
      const day=n.day.value,parsedDay=new Date(day+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsedDay.getTime())||parsedDay.toISOString().slice(0,10)!==day)throw Error('INPUT_DAY');
      const read=(key,code,required=false)=>{if(required&&!n[key].value)throw Error(code);try{return utc(n[key].value);}catch(_e){throw Error(code);}};
      const clockIn=read('in','INPUT_IN',true),clockOut=read('out','INPUT_OUT',true),breakStart=read('break-start','INPUT_BREAK_START'),breakEnd=read('break-end','INPUT_BREAK_END');
      const start=Date.parse(clockIn),end=Date.parse(clockOut);
      if(new Date(start+9*3600000).toISOString().slice(0,10)!==day)throw Error('INPUT_DAY_MATCH');
      if(end<=start)throw Error('INPUT_ORDER');if(end-start>48*3600000)throw Error('INPUT_DURATION');if(end>Date.now())throw Error('INPUT_FUTURE');
      if(breakStart&&!breakEnd)throw Error('INPUT_BREAK_END');if(breakEnd&&!breakStart)throw Error('INPUT_BREAK_START');
      if(breakStart&&!(start<Date.parse(breakStart)&&Date.parse(breakStart)<Date.parse(breakEnd)&&Date.parse(breakEnd)<end))throw Error('INPUT_BREAK_ORDER');
      const reason=n.reason.value.trim();if(!reason)throw Error('INPUT_REASON');if(reason.length>500||/^[=+@-]|[\u0000-\u001f\u007f]/.test(reason))throw Error('INPUT_REASON_FORMAT');
      const result={mode,groupId,employeeCode,day,clockIn,clockOut,breakStart,breakEnd,reason};
      if(extras.length){
        const sessions=[{clockIn,clockOut,breakStart,breakEnd}];
        for(const [index,row]of extras.entries()){
          const fail=(code,key)=>{const error=Error(code);error.field=row.fields[key];error.session=index+2;throw error;};
          const readExtra=(key,code,required=false)=>{if(required&&!row.fields[key].value)fail(code,key);try{return utc(row.fields[key].value);}catch(_e){fail(code,key);}};
          const q={clockIn:readExtra('in','INPUT_IN',true),clockOut:readExtra('out','INPUT_OUT',true),breakStart:readExtra('break-start','INPUT_BREAK_START'),breakEnd:readExtra('break-end','INPUT_BREAK_END')},a=Date.parse(q.clockIn),b=Date.parse(q.clockOut);
          if(new Date(a+9*3600000).toISOString().slice(0,10)!==day)fail('INPUT_DAY_MATCH','in');if(b<=a)fail('INPUT_ORDER','out');if(b-a>48*3600000)fail('INPUT_DURATION','out');if(b>Date.now())fail('INPUT_FUTURE','out');
          if(a<=Date.parse(sessions.at(-1).clockOut))fail('INPUT_SESSION_ORDER','in');if(q.breakStart&&!q.breakEnd)fail('INPUT_BREAK_END','break-end');if(q.breakEnd&&!q.breakStart)fail('INPUT_BREAK_START','break-start');
          if(q.breakStart&&!(a<Date.parse(q.breakStart)&&Date.parse(q.breakStart)<Date.parse(q.breakEnd)&&Date.parse(q.breakEnd)<b))fail('INPUT_BREAK_ORDER','break-start');sessions.push(q);
        }
        if(Date.parse(sessions.at(-1).clockOut)-start>48*3600000)throw Error('INPUT_DURATION');result.clockOut=sessions.at(-1).clockOut;result.sessions=JSON.stringify(sessions);
      }return result;}
    function send(command,fields){if(pending||stopped||completed||!adminAllowed||!fields||!modes.includes(fields.mode))return;if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      const proof=options.liff.getIDToken();if(!proof){n.status.textContent='LINEログインが必要です。';return;}
      const r={command,fields:Object.freeze({...fields}),nonce:random(16),key:random(32)};pending=r;clear();controls();n.status.textContent='処理中です。';
      const unknown=()=>{if(pending!==r)return;if(command==='commit')uncertain=true;clear();n.status.textContent='応答を確認できません。「内容を確認する」で結果を読み直してください。';finish();};r.timer=setTimeout(unknown,30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhDayChangeFrame';form.hidden=true;
      Object.entries({...fields,action:ACTION,command,idToken:proof,nonce:r.nonce,responseKey:r.key}).forEach(([name,value])=>{const e=document.createElement('input');e.type='hidden';e.name=name;e.value=value;form.appendChild(e);});document.body.appendChild(form);
      try{if(global.TlhTenantSession)global.TlhTenantSession.submit(form);else form.submit();}catch(_e){unknown();}finally{form.remove();}
    }
    for(const key of ['mode','employee','group','day','in','out','break-start','break-end','reason'])n[key].addEventListener('input',()=>{if(uncertain||pending||completed||stopped)return;n[key].removeAttribute?.('aria-invalid');draft=null;clear();controls();});
    n.preview.addEventListener('click',()=>{if(pending||completed||stopped)return;clear();try{if(!uncertain)draft=Object.freeze(input());send('preview',draft);}catch(error){
      const detail=inputErrors[error&&error.message];n.status.textContent=(error&&error.session?'勤務 '+error.session+'：':'')+(detail?detail.text:messages.CHANGE_INVALID);if(detail){const field=error.field||n[detail.node];field.setAttribute?.('aria-invalid','true');field.focus?.();}controls();}});
    n.commit.addEventListener('click',()=>{if(n.commit.disabled||!review||!global.confirm(n.review.textContent+'\nこの内容で'+(draft.mode==='SELF'?'申請':'訂正を反映')+'しますか？'))return;send('commit',{...draft,revision:review.revision});});
    global.addEventListener('message',async e=>{
      if(global.TlhTenantSession&&!await global.TlhTenantSession.acceptEvent(e))return;const r=pending;if(!r||!related(e.source,n.frame.contentWindow)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
      let valid=false;try{valid=await verify(e.data,r);}catch(_e){}if(!valid||pending!==r)return;const d=e.data;
      if(d.code==='CHANGE_READY'){const s=parseSummary(d.summary,r.fields);if(!s)return;
        const sessions=s.sessions||[s];n.review.textContent=s.employeeCode+' / '+s.employeeName+'\n出勤日 '+s.day+'\n'+sessions.map((q,i)=>'勤務 '+(i+1)+'\n出勤 '+stamp(q.clockIn)+'\n退勤 '+stamp(q.clockOut)+'\n休憩 '+stamp(q.breakStart)+' 〜 '+stamp(q.breakEnd)).join('\n\n')+'\n理由 '+s.reason+'\nこの日の勤務を上記の全区間へ訂正します。元の打刻は残します。';n.review.hidden=false;review={revision:d.revision};
      }else if(['CHANGE_REQUESTED','CHANGE_APPLIED'].includes(d.code)){completed=true;uncertain=false;n.receipt.textContent='申請番号: '+draft.groupId;n.copy.hidden=false;
        for(const k of ['day','in','out','break-start','break-end','reason'])n[k].value='';
        clearExtras();
        if(d.code==='CHANGE_APPLIED'&&typeof options.onApplied==='function')options.onApplied(draft.groupId);
      }
      if(['WRITE_REVIEW_REQUIRED','CHANGE_REVIEW_REQUIRED'].includes(d.code))stopped=true;
      if(d.code==='CHANGE_UNAVAILABLE'&&r.command==='commit')uncertain=true;
      n.status.textContent=messages[d.code];finish();
    });
    n.copy.addEventListener('click',async()=>{if(!completed||!draft)return;try{await navigator.clipboard.writeText(draft.groupId);}catch(_e){n.status.textContent='申請番号を選択してコピーしてください。';}});
    global.addEventListener('pagehide',()=>{stopped=true;if(pending)clearTimeout(pending.timer);pending=null;draft=null;clear();clearExtras();n.receipt.textContent='';n.copy.hidden=true;for(const k of ['employee','group','day','in','out','break-start','break-end','reason'])n[k].value='';controls();});controls();
    // 一覧からの選択も既存プレビューを通す。結果不明中や保存中に別申請へ切り替えない。
    function selectRequest(employeeCode,groupId){
      if(!modes.includes('REVIEW')||!adminAllowed||pending||uncertain||stopped||completed&&(!draft||draft.mode!=='REVIEW'))return false;
      if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(employeeCode)||!/^chg_[a-f0-9]{32}$/.test(groupId))return false;
      completed=false;draft=null;clear();clearExtras();n.receipt.textContent='';n.copy.hidden=true;
      n.mode.value='REVIEW';n.employee.value=employeeCode;n.group.value=groupId;controls();
      try{draft=Object.freeze(input());send('preview',draft);return true;}catch(_e){return false;}
    }
    function setAdminAllowed(allowed){if(!adminPage)return;adminAllowed=allowed===true;if(!adminAllowed){review=null;clear();}controls();}
    return Object.freeze({selectRequest,setAdminAllowed});
  }
  /** 管理者用の2操作はHTMLでもdisabled。起動時の署名付き確認後だけ選択できる。保存側は毎回GASが認可。 */
  async function bootstrap(){
    const status=document.getElementById('change-status'),login=document.getElementById('change-login');
    status.setAttribute?.('aria-busy','true');
    try{
      await global.liff.init({liffId:config.liffId});login.hidden=global.liff.isLoggedIn();
      login.addEventListener('click',()=>global.liff.login({redirectUri:global.TlhTenantSession?global.TlhTenantSession.loginRedirectUri():global.location.origin+global.location.pathname}));
      if(global.liff.isLoggedIn()&&global.TlhTenantSession&&!await global.TlhTenantSession.ready(global.liff))return;
      status.textContent=login.hidden?'操作を選んで内容を確認してください。':'LINEログインが必要です。';
      const audience=document.body.dataset.audience==='admin'?'admin':'employee';
      const autoReads=global.TlhAutoRead.init();let adminAllowed=false;
      let list=null,overview=null;const editor=init({liff:global.liff,gasUrl:config.gasUrl,audience,onApplied:()=>{if(list)list.invalidate();if(overview)overview.invalidateCount();if(list)autoReads.again('pending',()=>adminAllowed);}});
      if(audience!=='admin')return; // 本人申請ページに管理一覧/起動確認を作らない。
      overview=global.TlhAdminOverview.init({liff:global.liff,gasUrl:config.gasUrl,select:document.getElementById('change-employee'),canRefresh:()=>!document.getElementById('change-employee').disabled&&document.getElementById('change-commit').disabled});
      list=global.TlhPendingApprovals.init({liff:global.liff,gasUrl:config.gasUrl,onSelect:(code,group,name)=>overview.selectEmployee(code,name)&&editor.selectRequest(code,group),onCount:overview.setCount});
      const gate=global.TlhAdminAccess.init({liff:global.liff,gasUrl:config.gasUrl,frame:document.getElementById('admin-access-frame'),status:document.getElementById('admin-access-status'),
        onState:allowed=>{adminAllowed=allowed;editor.setAdminAllowed(allowed);document.getElementById('change-direct-option').disabled=!allowed;document.getElementById('change-review-option').disabled=!allowed;list.setAllowed(allowed);overview.setAllowed(allowed);if(allowed){autoReads.once('overview',()=>adminAllowed);autoReads.once('pending',()=>adminAllowed);}}});
      if(login.hidden)gate.start();
    }catch(_e){status.textContent='LINEログインを準備できません。';} finally { status.setAttribute?.('aria-busy','false'); }
  }
  global.TlhDayChange=Object.freeze({init,utc,verify,parseSummary,config});if(document.currentScript&&document.currentScript.dataset.bootstrap==='true')bootstrap();
})(window);
