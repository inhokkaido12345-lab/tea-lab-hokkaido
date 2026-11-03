/**
 * 通信表示: aria-busyを実pendingに同期し、CSSだけで回す。成功/失敗/timeout後は停止。認可/送信条件は不変。
 * 管理者の承認待ち一覧。起動時確認後の明示読取→署名/DTO検査→氏名+社員番号のカード。
 * 削除影響: 一覧の表示のみ停止。申請番号入力による承認と保存済み履歴は残る。
 * 概念: authenticated work queue / progressive disclosure。選択だけでは承認せず既存previewへ渡す。
 * 改造: parse/カードの項目はAttendanceDayChangeの一覧Service/Bridge/テストと同期。
 * 境界: 名前/対象日/申請番号はメモリ/POSTだけ。URL/Storage/ログなし、textContentで表示。
 * 検証: pending-approvals.test.mjs→実GAS連結。1回50件、重複/部分返信/古い応答を拒否。
 */
(function(global){
  'use strict';
  const ACTION='bridgeAttendanceDayChangeV2',TYPE='TLH_BRIDGE_ATTENDANCE_DAY_CHANGE';
  function parse(text){
    let page;try{page=JSON.parse(text);}catch(_e){return null;}
    if(!page||Object.keys(page).sort().join(',')!=='items,nextCursor,totalCount,version'||page.version!==1||!Number.isInteger(page.totalCount)||page.totalCount<0||
      !Array.isArray(page.items)||page.items.length>50||page.items.length>page.totalCount||typeof page.nextCursor!=='string'||page.nextCursor&&!/^chg_[a-f0-9]{32}$/.test(page.nextCursor))return null;
    const ids=new Set();
    for(const row of page.items){
      if(!row||Object.keys(row).sort().join(',')!=='canReview,day,employeeCode,employeeName,groupId,submittedAt'||
        typeof row.groupId!=='string'||!/^chg_[a-f0-9]{32}$/.test(row.groupId)||ids.has(row.groupId)||typeof row.employeeCode!=='string'||!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(row.employeeCode)||
        typeof row.employeeName!=='string'||!row.employeeName||row.employeeName.length>80||typeof row.day!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(row.day)||
        !Number.isFinite(Date.parse(row.day+'T00:00:00Z'))||new Date(row.day+'T00:00:00Z').toISOString().slice(0,10)!==row.day||
        typeof row.submittedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.submittedAt)||!Number.isFinite(Date.parse(row.submittedAt))||new Date(row.submittedAt).toISOString()!==row.submittedAt||typeof row.canReview!=='boolean')return null;
      ids.add(row.groupId);
    }
    if(page.nextCursor&&(!page.items.length||page.items.at(-1).groupId!==page.nextCursor))return null;
    return page;
  }
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch(_e){}return false;}
  async function verify(data,request){
    const codes=['CHANGE_PENDING_READY','CHANGE_PENDING_CHANGED','CHANGE_REVIEW_REQUIRED','CHANGE_INVALID','CHANGE_UNAVAILABLE','TLH_ADMIN_REQUIRED','LINE_VERIFY_REJECTED','WRITE_REVIEW_REQUIRED','ENROLLMENT_BUSY'];
    if(!data||data.type!==TYPE||data.action!==ACTION||data.command!=='pending'||data.groupId!==''||data.revision!==''||data.nonce!==request.nonce||!codes.includes(data.code)||typeof data.summary!=='string'||
      data.code!=='CHANGE_PENDING_READY'&&data.summary!==''||typeof data.mac!=='string'||!/^[a-f0-9]{64}$/.test(data.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(request.key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(data.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,ACTION,data.nonce,data.command,data.groupId,data.code,data.revision,data.summary].join('\n')));
  }
  /** initは無通信。setAllowedで親を開閉し、invalidateで古い一覧/返信を捨てる。 */
  function init(options){
    const n=Object.fromEntries(['section','load','next','list','status','frame'].map(k=>[k,document.getElementById('pending-'+k)]));
    let allowed=false,stopped=false,pending=null,cursor='',seen=new Set();
    function controls(){n.status.setAttribute?.('aria-busy',String(!!pending));n.section.hidden=!allowed;n.load.disabled=!allowed||!!pending||stopped;n.next.disabled=!allowed||!!pending||!cursor||stopped;}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function invalidate(){finish();cursor='';seen=new Set();n.list.replaceChildren();n.next.hidden=true;n.status.textContent='承認待ちを確認してください。';controls();}
    function setAllowed(value){allowed=value===true;if(!allowed)invalidate();controls();}
    function send(next){
      if(!allowed||pending||stopped)return;
      if(!next)invalidate();
      const proof=options.liff.getIDToken();if(!proof||global!==global.top||!crypto.subtle){n.status.textContent='LINE本人確認が必要です。';return;}
      const random=size=>Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');
      const request={nonce:random(16),key:random(32)};pending=request;controls();n.status.textContent='承認待ちを読み込んでいます。';
      request.timer=setTimeout(()=>{if(pending===request){n.status.textContent='応答を確認できません。一覧を確認し直してください。';finish();}},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhPendingApprovalsFrame';form.hidden=true;
      Object.entries({action:ACTION,command:'pending',groupId:'',cursor:next?cursor:'',nonce:request.nonce,responseKey:request.key,idToken:proof}).forEach(([name,value])=>{const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);});
      document.body.appendChild(form);try{form.submit();}catch(_e){n.status.textContent='送信できません。一覧を確認し直してください。';finish();}finally{form.remove();}
    }
    n.load.addEventListener('click',()=>send(false));n.next.addEventListener('click',()=>{if(cursor)send(true);});
    global.addEventListener('message',async event=>{
      const request=pending;if(!allowed||stopped||!request||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      let valid=false;try{valid=await verify(event.data,request);}catch(_e){}if(!valid||pending!==request||stopped||!allowed)return;const data=event.data;
      if(data.code==='CHANGE_PENDING_READY'){
        const page=parse(data.summary);if(!page||page.items.some(row=>seen.has(row.groupId)))return;
        for(const row of page.items){
          const card=document.createElement('article');card.className='record-item';const title=document.createElement('h3');title.textContent=row.employeeName+'（'+row.employeeCode+'）さんから申請が届いています。';card.appendChild(title);
          const day=document.createElement('p');day.className='subtle';day.textContent='対象日 '+row.day;card.appendChild(day);
          const button=document.createElement('button');button.type='button';button.textContent=row.canReview?'内容を確認する':'現在の従業員状態では承認できません';button.disabled=!row.canReview;
          button.addEventListener('click',()=>{if(!allowed||stopped)return;if(options.onSelect(row.employeeCode,row.groupId,row.employeeName)===false)n.status.textContent='処理中または結果確認中です。現在の操作を先に確認してください。';});card.appendChild(button);n.list.appendChild(card);seen.add(row.groupId);
        }
        options.onCount?.(page.totalCount);cursor=page.nextCursor;n.next.hidden=!cursor;n.status.textContent=page.totalCount===0?'承認待ちの申請はありません。':'承認待ち '+page.totalCount+'件（表示 '+seen.size+'件）';
      }else{
        invalidate();n.status.textContent=data.code==='CHANGE_PENDING_CHANGED'?'一覧が更新されています。先頭から確認し直してください。':data.code==='TLH_ADMIN_REQUIRED'?'管理者権限が必要です。':'一覧を取得できません。権限・申請の状態を確認してください。';
      }finish();
    });
    global.addEventListener('pagehide',()=>{stopped=true;setAllowed(false);});setAllowed(false);
    return Object.freeze({setAllowed,invalidate});
  }
  global.TlhPendingApprovals=Object.freeze({init,parse,verify});
})(window);
