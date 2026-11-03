/**
 * 日別訂正UI。本人申請/管理者直接訂正/管理者承認→署名付きpreview→明示確認→同じgroupで保存。
 * day-change.html専用。削除しても原簿/訂正履歴は残る。既存の打刻controllerは変更しない。
 * 概念: immutable review / unknown outcome。通信ごとにnonce/鍵を更新、操作groupは保存結果確定まで固定。
 * 改造はBridgeAttendanceDayChange/Service/両repo試験と同期。時刻はJST入力→UTC、端末のTZを信じない。
 * token/氏名/時刻/理由/鍵はURL/ログ/Storageへ出さない。申請番号は明示コピーだけ。
 * 検証: day-change.test.mjs→全回帰→公開/実訂正の別受入れ。initだけでは通信/書込しない。
 */
(function(global){'use strict';
  const config=Object.freeze({liffId:'2011940133-JXUDzLnG',gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec'});
  const TYPE='TLH_BRIDGE_ATTENDANCE_DAY_CHANGE',ACTION='bridgeAttendanceDayChange';
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
    INPUT_EMPLOYEE:{node:'employee',text:'対象の社員番号を半角英数字で入力してください。'},INPUT_DAY:{node:'day',text:'出勤日を年月日まで入力してください。'},
    INPUT_IN:{node:'in',text:'出勤日時を日付と時刻まで入力してください。'},INPUT_OUT:{node:'out',text:'退勤日時を日付と時刻まで入力してください。'},
    INPUT_BREAK_START:{node:'break-start',text:'休憩開始日時を入力してください。休憩なしの場合は開始・終了の両方を空欄にしてください。'},
    INPUT_BREAK_END:{node:'break-end',text:'休憩終了日時を入力してください。休憩なしの場合は開始・終了の両方を空欄にしてください。'},
    INPUT_DAY_MATCH:{node:'in',text:'出勤日時の日付を「出勤日」と同じ日にしてください。'},INPUT_ORDER:{node:'out',text:'退勤日時は出勤日時より後にしてください。'},
    INPUT_DURATION:{node:'out',text:'出勤から退勤は48時間以内で入力してください。'},INPUT_FUTURE:{node:'out',text:'未来の退勤日時は入力できません。日付と年を確認してください。'},
    INPUT_BREAK_ORDER:{node:'break-start',text:'休憩は出勤後・退勤前にし、休憩終了を開始より後にしてください。'},
    INPUT_REASON:{node:'reason',text:'訂正・申請の理由を入力してください。'},INPUT_REASON_FORMAT:{node:'reason',text:'理由は500文字以内の1行で入力し、先頭に = + @ - を付けないでください。'}
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
    if(!s||Object.keys(s).sort().join(',')!==keys.sort().join(',')||keys.some(k=>typeof s[k]!=='string')||s.groupId!==fields.groupId||
      !s.employeeCode||s.employeeName.length>80||s.reason.length>500||!s.reason||!/^\d{4}-\d{2}-\d{2}$/.test(s.day))return null;
    if(fields.mode!=='SELF'&&s.employeeCode!==fields.employeeCode)return null;
    if(fields.mode!=='REVIEW'&&['day','reason','clockIn','clockOut','breakStart','breakEnd'].some(k=>s[k]!==fields[k]))return null;
    for(const k of ['clockIn','clockOut','breakStart','breakEnd'])if(s[k]&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s[k])||!Number.isFinite(Date.parse(s[k]))||new Date(s[k]).toISOString()!==s[k]))return null;
    if(!s.clockIn||!s.clockOut||Date.parse(s.clockIn)>=Date.parse(s.clockOut)||!!s.breakStart!==!!s.breakEnd)return null;
    if(s.breakStart&&!(Date.parse(s.clockIn)<Date.parse(s.breakStart)&&Date.parse(s.breakStart)<Date.parse(s.breakEnd)&&Date.parse(s.breakEnd)<Date.parse(s.clockOut)))return null;
    return s;
  }
  function init(options){
    const names=['mode','employee','target','group','request','inputs','day','in','out','break-start','break-end','reason','preview','commit','review','status','receipt','copy','frame'];
    const n=Object.fromEntries(names.map(k=>[k,document.getElementById('change-'+k)]));let pending=null,draft=null,review=null,uncertain=false,stopped=false,completed=false;
    const clear=()=>{review=null;n.review.textContent='';n.review.hidden=true;};
    function controls(){for(const k of ['mode','employee','group','day','in','out','break-start','break-end','reason'])n[k].disabled=!!pending||uncertain||completed||stopped;
      n.preview.disabled=!!pending||completed||stopped;n.commit.disabled=!!pending||!review||uncertain||completed||stopped;
      n.target.hidden=n.mode.value==='SELF';n.request.hidden=n.mode.value!=='REVIEW';n.inputs.hidden=n.mode.value==='REVIEW';}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    /** 送信前の案内だけ。サーバーの同じ検査・認可・時系列確認は省略しない。 */
    function input(){const mode=n.mode.value;if(!['SELF','DIRECT','REVIEW'].includes(mode))throw Error('INPUT_MODE');
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
      return{mode,groupId,employeeCode,day,clockIn,clockOut,breakStart,breakEnd,reason};}
    function send(command,fields){if(pending||stopped||completed)return;if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      const proof=options.liff.getIDToken();if(!proof){n.status.textContent='LINEログインが必要です。';return;}
      const r={command,fields:Object.freeze({...fields}),nonce:random(16),key:random(32)};pending=r;clear();controls();n.status.textContent='処理中です。';
      const unknown=()=>{if(pending!==r)return;if(command==='commit')uncertain=true;clear();n.status.textContent='応答を確認できません。「内容を確認する」で結果を読み直してください。';finish();};r.timer=setTimeout(unknown,30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhDayChangeFrame';form.hidden=true;
      Object.entries({...fields,action:ACTION,command,idToken:proof,nonce:r.nonce,responseKey:r.key}).forEach(([name,value])=>{const e=document.createElement('input');e.type='hidden';e.name=name;e.value=value;form.appendChild(e);});document.body.appendChild(form);
      try{form.submit();}catch(_e){unknown();}finally{form.remove();}
    }
    for(const key of ['mode','employee','group','day','in','out','break-start','break-end','reason'])n[key].addEventListener('input',()=>{if(uncertain||pending||completed||stopped)return;n[key].removeAttribute?.('aria-invalid');draft=null;clear();controls();});
    n.preview.addEventListener('click',()=>{if(pending||completed||stopped)return;clear();try{if(!uncertain)draft=Object.freeze(input());send('preview',draft);}catch(error){
      const detail=inputErrors[error&&error.message];n.status.textContent=detail?detail.text:messages.CHANGE_INVALID;if(detail){n[detail.node].setAttribute?.('aria-invalid','true');n[detail.node].focus?.();}controls();}});
    n.commit.addEventListener('click',()=>{if(n.commit.disabled||!review||!global.confirm(n.review.textContent+'\nこの内容で'+(draft.mode==='SELF'?'申請':'訂正を反映')+'しますか？'))return;send('commit',{...draft,revision:review.revision});});
    global.addEventListener('message',async e=>{const r=pending;if(!r||!related(e.source,n.frame.contentWindow)||!(e.origin==='null'||e.origin==='https://script.google.com'||e.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin)))return;
      let valid=false;try{valid=await verify(e.data,r);}catch(_e){}if(!valid||pending!==r)return;const d=e.data;
      if(d.code==='CHANGE_READY'){const s=parseSummary(d.summary,r.fields);if(!s)return;
        n.review.textContent=s.employeeCode+' / '+s.employeeName+'\n出勤日 '+s.day+'\n出勤 '+stamp(s.clockIn)+'\n退勤 '+stamp(s.clockOut)+'\n休憩 '+stamp(s.breakStart)+' 〜 '+stamp(s.breakEnd)+'\n理由 '+s.reason;n.review.hidden=false;review={revision:d.revision};
      }else if(['CHANGE_REQUESTED','CHANGE_APPLIED'].includes(d.code)){completed=true;uncertain=false;n.receipt.textContent='申請番号: '+draft.groupId;n.copy.hidden=false;
        for(const k of ['day','in','out','break-start','break-end','reason'])n[k].value='';
      }
      if(['WRITE_REVIEW_REQUIRED','CHANGE_REVIEW_REQUIRED'].includes(d.code))stopped=true;
      if(d.code==='CHANGE_UNAVAILABLE'&&r.command==='commit')uncertain=true;
      n.status.textContent=messages[d.code];finish();
    });
    n.copy.addEventListener('click',async()=>{if(!completed||!draft)return;try{await navigator.clipboard.writeText(draft.groupId);}catch(_e){n.status.textContent='申請番号を選択してコピーしてください。';}});
    global.addEventListener('pagehide',()=>{stopped=true;if(pending)clearTimeout(pending.timer);pending=null;draft=null;clear();n.receipt.textContent='';n.copy.hidden=true;for(const k of ['employee','group','day','in','out','break-start','break-end','reason'])n[k].value='';controls();});controls();
  }
  /** 管理者用の2操作はHTMLでもdisabled。起動時の署名付き確認後だけ選択できる。保存側は毎回GASが認可。 */
  async function bootstrap(){
    const status=document.getElementById('change-status'),login=document.getElementById('change-login');
    try{
      await global.liff.init({liffId:config.liffId});login.hidden=global.liff.isLoggedIn();
      login.addEventListener('click',()=>global.liff.login({redirectUri:global.location.origin+global.location.pathname}));
      status.textContent=login.hidden?'操作を選んで内容を確認してください。':'LINEログインが必要です。';init({liff:global.liff,gasUrl:config.gasUrl});
      const gate=global.TlhAdminAccess.init({liff:global.liff,gasUrl:config.gasUrl,frame:document.getElementById('admin-access-frame'),status:document.getElementById('admin-access-status'),
        onState:allowed=>{document.getElementById('change-direct-option').disabled=!allowed;document.getElementById('change-review-option').disabled=!allowed;}});
      if(login.hidden)gate.start();
    }catch(_e){status.textContent='LINEログインを準備できません。';}
  }
  global.TlhDayChange=Object.freeze({init,utc,verify,parseSummary,config});if(document.currentScript&&document.currentScript.dataset.bootstrap==='true')bootstrap();
})(window);
