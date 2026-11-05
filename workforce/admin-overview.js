/**
 * 現役・社員選択/承認待ち件数。init無通信→署名付き起動gate後に1回読取→DTO検査→選択肢/通知。
 * ホームはautoLoad=falseで初回をauto-readのoverviewキーへ委ねる。通知を捨てず、打刻の初期読取と競合させない。
 * 削除影響: 管理者の候補と通知が取得不能。DB/保存処理は残る。新規社員番号の作成入力は対象外。
 * 概念: authenticated read model / presentation formatting。value=社員番号、表示=番号（氏名）。
 * 初歩: option.valueはAPIへ渡す識別子、textContentは人が読む文字。氏名を識別キーにしない。
 * 魔改造: 候補/上限はAdminOverviewServiceとparseを同期。通知はsetCount、配色はapp.css。
 * 境界: 毎回GASが最新権限を確認。名前/名簿はURL/Storage/ログへ出さず、画面退場/失権で破棄。
 * 検証: admin-overview.test.mjs→GAS連結/全UI→LINE。件数は読取時点、常時監視や通知配信ではない。
 */
(function(global){'use strict';
  const ACTION='bridgeGetAdminOverview',TYPE='TLH_BRIDGE_ADMIN_OVERVIEW';
  const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
  function parse(text){
    if(typeof text!=='string'||text.length>400000)return null;let v;try{v=JSON.parse(text);}catch(_e){return null;}
    if(!exact(v,['version','employees','pendingCount'])||v.version!==1||!Number.isSafeInteger(v.pendingCount)||v.pendingCount<0||!Array.isArray(v.employees)||v.employees.length>1000)return null;
    const seen=new Set();for(const r of v.employees){
      if(!exact(r,['employeeCode','employeeName','status'])||typeof r.employeeCode!=='string'||!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(r.employeeCode)||seen.has(r.employeeCode)||
        typeof r.employeeName!=='string'||!r.employeeName.trim()||r.employeeName.length>80||/[\u0000-\u001f\u007f]/.test(r.employeeName)||!['ACTIVE','INVITED','INACTIVE'].includes(r.status))return null;seen.add(r.employeeCode);
    }return v;
  }
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const p=source.parent;if(!p||p===source)return false;source=p;}}catch(_e){}return false;}
  async function verify(d,r){
    if(!exact(d,['type','nonce','action','code','review','mac'])||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||
      !['ADMIN_OVERVIEW_READY','ADMIN_OVERVIEW_INVALID','ADMIN_OVERVIEW_ADMIN_REQUIRED','ADMIN_OVERVIEW_BUSY','ADMIN_OVERVIEW_REVIEW_REQUIRED','ADMIN_OVERVIEW_UNAVAILABLE'].includes(d.code)||
      typeof d.review!=='string'||d.review.length>400000||d.code!=='ADMIN_OVERVIEW_READY'&&d.review!==''||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,ACTION,d.code,d.review].join('\n')));
  }
  function init(options){
    const n=Object.fromEntries(['section','check','status','frame'].map(k=>[k,document.getElementById('admin-overview-'+k)]));
    const badges=[...document.querySelectorAll('[data-approval-badge]')],select=options.select;
    let allowed=false,pending=null,stopped=false,count=null;
    function setCount(value){count=allowed&&Number.isSafeInteger(value)&&value>=0?value:null;for(const badge of badges){badge.hidden=count===null||count===0;badge.textContent=count>0?'● '+count+'件':'';badge.setAttribute('aria-label',count===null?'承認待ちは未確認':'承認待ち '+count+'件');}}
    function controls(){n.section.hidden=!allowed;n.check.disabled=!allowed||!!pending||stopped;n.status.setAttribute('aria-busy',String(!!pending));}
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function placeholder(text){select.replaceChildren();const el=document.createElement('option');el.value='';el.textContent=text;select.appendChild(el);}
    function invalidateCount(){finish();setCount(null);n.status.textContent='承認待ちは未確認です。一覧・件数を更新してください。';}
    // 一覧の署名検査済み最新件数を優先。先に送った概要返信が後着しても上書きさせない。
    function updateCount(value){finish();setCount(value);n.status.textContent=count===null?'承認待ちは未確認です。':'承認待ち '+count+'件（一覧確認時点）。';}
    function selectEmployee(code,name){
      if(!allowed||stopped||typeof code!=='string'||!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)||typeof name!=='string'||!name||name.length>80)return false;
      if(![...select.options].some(o=>o.value===code)){const el=document.createElement('option');el.value=code;el.textContent=code+'（'+name+'）';select.appendChild(el);}return true;
    }
    function load(){
      if(!allowed||pending||stopped)return;
      // 確認済みの訂正/停止draftを別の名簿で差し替えない。更新は操作終了後または再読込で行う。
      if(options.canRefresh&&options.canRefresh()===false){n.status.textContent='現在の対象確認・操作を終えてから更新してください。';return;}
      setCount(null);let proof;try{proof=options.liff.getIDToken();}catch(_e){}
      if(!proof||global!==global.top||!crypto.subtle){n.status.textContent='一覧・承認待ちは未確認です。LINEでログインし直してください。';return;}
      const random=size=>Array.from(crypto.getRandomValues(new Uint8Array(size)),b=>b.toString(16).padStart(2,'0')).join('');
      const r={nonce:random(16),responseKey:random(32)};pending=r;controls();n.status.textContent='従業員一覧・承認待ちを確認中です。';
      r.timer=setTimeout(()=>{if(pending!==r)return;n.status.textContent='一覧・承認待ちは未確認です。応答がありません。更新してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhAdminOverviewFrame';form.hidden=true;
      Object.entries({action:ACTION,idToken:proof,nonce:r.nonce,responseKey:r.responseKey}).forEach(([name,value])=>{const el=document.createElement('input');el.type='hidden';el.name=name;el.value=value;form.appendChild(el);});document.body.appendChild(form);
      try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){n.status.textContent='一覧・承認待ちは未確認です。送信できません。';finish();}finally{form.remove();}
    }
    // ホームはautoLoad=falseで共通読取queueへ委ねる。他の入口は従来の許可直後読取を維持。
    function setAllowed(value){const changed=allowed!==(value===true);allowed=value===true;if(!allowed){finish();placeholder('管理者権限の確認後に選択できます');setCount(null);}controls();if(allowed&&changed&&options.autoLoad!==false)load();}
    n.check.addEventListener('click',load);
    global.addEventListener('message',async event=>{
      const r=pending;if(!r||!allowed||stopped||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      let valid=false;try{valid=await verify(event.data,r);}catch(_e){}if(!valid||pending!==r||!allowed||stopped)return;
      const d=event.data;if(d.code==='ADMIN_OVERVIEW_READY'){
        const value=parse(d.review);if(!value)return;
        const selected=select.value;placeholder(value.employees.length?'社員番号（氏名）を選択':'登録された従業員はいません');
        for(const employee of value.employees){const el=document.createElement('option');el.value=employee.employeeCode;el.textContent=employee.employeeCode+'（'+employee.employeeName+'）'+(employee.status==='ACTIVE'?'':employee.status==='INVITED'?'［招待待ち］':'［停止済み］');select.appendChild(el);}
        select.value=value.employees.some(e=>e.employeeCode===selected)?selected:'';
        if(select.value!==selected)select.dispatchEvent(new Event('input',{bubbles:true}));
        setCount(value.pendingCount);n.status.textContent='承認待ち '+count+'件（確認時点）。従業員 '+value.employees.length+'人。';
      }else{placeholder('一覧を取得できません。更新してください');setCount(null);n.status.textContent='一覧・承認待ちは未確認です。権限と保存先を確認してください。';}finish();
    });
    global.addEventListener('pagehide',()=>{stopped=true;setAllowed(false);});setAllowed(false);
    return Object.freeze({setAllowed,setCount:updateCount,invalidateCount,selectEmployee});
  }
  global.TlhAdminOverview=Object.freeze({init,parse,verify});
})(window);
