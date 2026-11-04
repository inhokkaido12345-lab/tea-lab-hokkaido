/**
 * 現役・表示時の読取だけを順番に開始する。起動/タブ/対象選択→固定の読取ボタン→既存controller。
 * 削除影響: 自動取得が止まり更新ボタンでの取得に戻る。認可/保存/再送/DBは変更しない。
 * 概念: lazy loading / single-flight queue。全画面を一斉読込せず、1画面1回・直列に読む。
 * 初歩: MutationObserverは属性が変わった時だけ通知される。時間で監視するpollingではない。
 * 魔改造: 下の固定表だけが自動実行の許可リスト。登録/打刻/承認/preview/再送を絶対に足さない。
 * 境界: LINE準備/最新管理者gateは呼出し側とGASが担当。判定の代わりに使わない。Storage/ログなし。
 * 検証: auto-read.test.mjs＋layout/全UI/連結。自動失敗を無限再試行せず、更新は人が操作する。
 */
(function(global){'use strict';
  const reads=Object.freeze({punch:['punch-check','punch-status'],today:['journal-check','journal-status'],journal:['journal-check','journal-status'],
    daily:['daily-summary-check','daily-summary-status'],monthly:['monthly-work-check','monthly-work-status'],account:['account-info-check','account-info-status'],
    schedule:['schedule-refresh','schedule-status'],pending:['pending-load','pending-status'],labor:['labor-policy-check','labor-policy-status'],enrollment:['staff-check','staff-status'],overview:[null,'admin-overview-status']});
  function init(){
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
      try{while(queue.length&&!stopped){const job=queue.shift(),[buttonId,statusId]=reads[job.key],status=document.getElementById(statusId),button=buttonId?document.getElementById(buttonId):null;
        if(!status||!job.permitted()){seen.delete(job.key);continue;}
        const alreadyBusy=status.getAttribute('aria-busy')==='true';await idle(status);if(stopped)break;
        if(!job.permitted()){seen.delete(job.key);continue;}
        if(!buttonId||alreadyBusy)continue; // 既に手動で取得中ならその結果を使い、重複送信しない。
        if(!button||button.disabled){seen.delete(job.key);continue;}
        try{button.click();await idle(status);}catch(_e){status.textContent='自動取得を開始できません。更新してください。';}
      }}finally{running=false;}
    }
    /** onceはページ滞在中1回。againは確認済みの保存成功/対象変更でだけ使い、保存を再送しない。 */
    function once(key,permitted=()=>true){if(stopped||!Object.hasOwn(reads,key)||seen.has(key)||!permitted())return;seen.add(key);queue.push({key,permitted});void drain();}
    function again(key,permitted=()=>true){if(queue.some(job=>job.key===key))return;seen.delete(key);once(key,permitted);}
    global.addEventListener('pagehide',()=>{stopped=true;queue.length=0;observer?.disconnect();observer=null;if(release)release();release=null;});
    return Object.freeze({once,again});
  }
  global.TlhAutoRead=Object.freeze({init});
})(window);
