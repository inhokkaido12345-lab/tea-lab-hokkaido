/**
 * 現役・表示時の読取だけを開始する。起動/タブ/対象選択→固定の読取ボタン→既存controller。
 * 削除影響: 自動取得が止まり更新ボタンでの取得に戻る。認可/保存/再送/DBは変更しない。
 * 概念: lazy loading / single-flight queue。同じ表示の固定READ群だけ同時開始し、群の間は直列。
 * 初歩: MutationObserverは属性が変わった時だけ通知される。時間で監視するpollingではない。
 * 魔改造: 下の固定表だけが自動実行の許可リスト。登録/打刻/承認/preview/再送を絶対に足さない。
 * 境界: LINE準備/最新管理者gateは呼出し側とGASが担当。判定の代わりに使わない。Storage/ログなし。
 * 検証: auto-read.test.mjs＋layout/全UI/連結。自動失敗を無限再試行せず、更新は人が操作する。
 * 背景指定: onceの第3引数trueは概要など。通知取得を省かず、未開始分の順序だけを変える。
 * 起動: ホームはaccess/punch/todayを同じ通信へ。他ページのaccessは既存確認の終了待ちだけ。
 * 改造: startAccessはホームの固定権限READ専用。保存入口へ転用せず、群→overview順とtimeout試験を同期。
 */
(function(global){'use strict';
  const reads=Object.freeze({punch:['punch-check','punch-status'],today:['journal-check','journal-status'],journal:['journal-check','journal-status'],
    daily:['daily-summary-check','daily-summary-status'],monthly:['monthly-work-check','monthly-work-status'],account:['account-info-check','account-info-status'],access:[null,'admin-access-status'],
    schedule:['schedule-refresh','schedule-status'],scheduleManagement:['schedule-management-refresh','schedule-management-status'],scheduleAdmin:['schedule-admin-refresh','schedule-admin-status'],scheduleBulk:['bulk-load','bulk-status'],pending:['pending-load','pending-status'],labor:['labor-policy-check','labor-policy-status'],enrollment:['staff-check','staff-status'],overview:['admin-overview-check','admin-overview-status']});
  function init(options={}){
    let stopped=false,running=false,observer=null,release=null,restoring=false;const seen=new Set(),queue=[];
    // 戻る/進むのbfcacheはJSの停止状態や古い認可も復元する。再送せず新しいGETで起動し直す。
    // persisted=trueだけが対象。通常起動/タブ切替はreloadしない。削除すると戻った画面が停止したままになる。
    // 再起動後も自動化は下の読取許可リストだけ。未確認の登録/打刻/訂正は再実行しない。
    global.addEventListener('pageshow',event=>{if(event.persisted&&!restoring){restoring=true;global.location.reload();}});
    async function idle(status){
      if(status.getAttribute('aria-busy')!=='true'||stopped)return;
      await new Promise(resolve=>{release=resolve;observer=new MutationObserver(()=>{if(status.getAttribute('aria-busy')!=='true'||stopped){observer.disconnect();observer=null;release=null;resolve();}});observer.observe(status,{attributes:true,attributeFilter:['aria-busy']});});
    }
    async function drain(){
      if(running||stopped)return;running=true;
      try{while(queue.length&&!stopped){// 未開始の背景READより現在表示のREADを優先。実行中は中断せず、共有Lockへの集中を防ぐ。
        const foreground=queue.findIndex(job=>!job.background),job=queue.splice(foreground<0?0:foreground,1)[0];
        if(job.keys){
          const entries=job.keys.map(key=>({key,button:reads[key][0]?document.getElementById(reads[key][0]):null,status:document.getElementById(reads[key][1])}));
          // Wait for earlier/manual reads, then start fixed READs in the same turn.
          // refresh never reuses a pre-save result; controllers invalidate old pending requests first.
          for(const entry of entries){entry.busy=entry.status?.getAttribute('aria-busy')==='true';if(entry.status)await idle(entry.status);}
          if(stopped)break;
          for(const entry of entries){
            if(!entry.status||!job.permitted()){seen.delete(entry.key);continue;}
            if(entry.busy&&!job.refresh)continue;
            if(entry.key==='access'){options.startAccess?.();continue;}
            if(!entry.button||entry.button.disabled){seen.delete(entry.key);continue;}
            try{entry.button.click();}catch(_e){entry.status.textContent='自動取得を開始できません。更新してください。';}
          }
          for(const entry of entries)if(entry.status)await idle(entry.status);
          continue;
        }
        const [buttonId,statusId]=reads[job.key],status=document.getElementById(statusId),button=buttonId?document.getElementById(buttonId):null;
        if(!status||!job.permitted()){seen.delete(job.key);continue;}
        const alreadyBusy=status.getAttribute('aria-busy')==='true';await idle(status);if(stopped)break;
        if(!job.permitted()){seen.delete(job.key);continue;}
        if(!buttonId||alreadyBusy)continue; // 既に手動で取得中ならその結果を使い、重複送信しない。
        if(!button||button.disabled){seen.delete(job.key);continue;}
        try{button.click();await idle(status);}catch(_e){status.textContent='自動取得を開始できません。更新してください。';}
      }}finally{running=false;}
    }
    /** onceはページ滞在中1回。againは確認済みの保存成功/対象変更でだけ使い、保存を再送しない。 */
    function once(key,permitted=()=>true,background=false){if(stopped||!Object.hasOwn(reads,key)||seen.has(key)||!permitted())return;seen.add(key);queue.push({key,permitted,background:background===true});void drain();}
    function again(key,permitted=()=>true){if(queue.some(job=>job.key===key))return;seen.delete(key);once(key,permitted);}
    /** Only home startup / own records combinations. Unknown and write keys reject the whole group. */
    function together(keys,permitted=()=>true,refresh=false){
      const allowed=['access','punch','today','daily','monthly'];
      if(stopped||!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length||keys.some(key=>!allowed.includes(key))||!permitted())return;
      const selected=keys.filter(key=>refresh||!seen.has(key));if(!selected.length)return;
      for(const key of selected)seen.add(key);queue.push({keys:selected,permitted,refresh});void drain();
    }
    global.addEventListener('pagehide',()=>{stopped=true;queue.length=0;observer?.disconnect();observer=null;if(release)release();release=null;});
    return Object.freeze({once,again,together,invalidate(keys){for(const key of keys)if(Object.hasOwn(reads,key))seen.delete(key);}});
  }
  global.TlhAutoRead=Object.freeze({init});
})(window);
