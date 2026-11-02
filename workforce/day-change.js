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
  /** datetime-localをJSTとして解釈。存在しない暦日をDateの自動補正で保存しない。 */
  function utc(text){if(!text)return'';if(typeof text!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text))throw Error('invalid');
    const value=new Date(text+':00+09:00');if(!Number.isFinite(value.getTime())||new Date(value.getTime()+9*3600000).toISOString().slice(0,16)!==text)throw Error('invalid');return value.toISOString();}
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
    function input(){const mode=n.mode.value;if(!['SELF','DIRECT','REVIEW'].includes(mode))throw Error('invalid');
      const groupId=mode==='REVIEW'?n.group.value.trim():draft?.groupId||'chg_'+random(16);if(!/^chg_[a-f0-9]{32}$/.test(groupId))throw Error('invalid');
      const employeeCode=mode==='SELF'?'':n.employee.value.trim();if(mode!=='SELF'&&!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(employeeCode))throw Error('invalid');
      return{mode,groupId,employeeCode,...(mode==='REVIEW'?{}:{day:n.day.value,clockIn:utc(n.in.value),clockOut:utc(n.out.value),breakStart:utc(n['break-start'].value),breakEnd:utc(n['break-end'].value),reason:n.reason.value.trim()})};}
    function send(command,fields){if(pending||stopped||completed)return;if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      const proof=options.liff.getIDToken();if(!proof){n.status.textContent='LINEログインが必要です。';return;}
      const r={command,fields:Object.freeze({...fields}),nonce:random(16),key:random(32)};pending=r;clear();controls();n.status.textContent='処理中です。';
      const unknown=()=>{if(pending!==r)return;if(command==='commit')uncertain=true;clear();n.status.textContent='応答を確認できません。「内容を確認する」で結果を読み直してください。';finish();};r.timer=setTimeout(unknown,30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhDayChangeFrame';form.hidden=true;
      Object.entries({...fields,action:ACTION,command,idToken:proof,nonce:r.nonce,responseKey:r.key}).forEach(([name,value])=>{const e=document.createElement('input');e.type='hidden';e.name=name;e.value=value;form.appendChild(e);});document.body.appendChild(form);
      try{form.submit();}catch(_e){unknown();}finally{form.remove();}
    }
    for(const key of ['mode','employee','group','day','in','out','break-start','break-end','reason'])n[key].addEventListener('input',()=>{if(uncertain||pending||completed||stopped)return;draft=null;clear();controls();});
    n.preview.addEventListener('click',()=>{if(pending||completed||stopped)return;try{if(!uncertain)draft=Object.freeze(input());send('preview',draft);}catch(_e){n.status.textContent=messages.CHANGE_INVALID;}});
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
  async function bootstrap(){const status=document.getElementById('change-status'),login=document.getElementById('change-login');try{await global.liff.init({liffId:config.liffId});login.hidden=global.liff.isLoggedIn();login.addEventListener('click',()=>global.liff.login({redirectUri:global.location.origin+global.location.pathname}));status.textContent=login.hidden?'操作を選んで内容を確認してください。':'LINEログインが必要です。';init({liff:global.liff,gasUrl:config.gasUrl});}catch(_e){status.textContent='LINEログインを準備できません。';}}
  global.TlhDayChange=Object.freeze({init,utc,verify,parseSummary,config});if(document.currentScript&&document.currentScript.dataset.bootstrap==='true')bootstrap();
})(window);
