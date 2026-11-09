/**
 * 責務: 一つのシフト作業場で本人/管理者/シート取込みの既存controllerを接続する。
 * 呼出元: indexの既存LIFF初期化。READの順序と初回一回はauto-readへ任せ、認証を増やさない。
 * 削除影響: ホームのシフト作業場が停止。単独ページ/保存済み予定/打刻は残る。
 * 一般化: 一つの月選択、独立したフォーム/返信先、共有読取キュー。管理UIを認可にしない。
 * 魔改造: ID prefix/frameNameは静的生成scriptと同期。待機/結果不明/プレビュー中は月を変えない。
 * 境界: 自動化はREADだけ。入力/nonce/固定再送ID/秘密をURLやStorageへコピーしない。
 * 検証: layout/月暦/Workspace試験と既存の署名/保存/失権/離脱/再送の回帰。
 */
(function(global){'use strict';
  function init(options){
    const month=document.getElementById('schedule-month'),refresh=document.getElementById('schedule-refresh'),allRefresh=document.getElementById('schedule-workspace-refresh'),locks=new Map();
    const permitted=()=>options.visible(),adminPermitted=()=>permitted()&&options.adminAllowed();
    function lock(key,value){locks.set(key,value);const blocked=[...locks.values()].some(Boolean);month.disabled=blocked;refresh.disabled=blocked;allRefresh.disabled=blocked||!permitted();}
    function refreshReads(keys){for(const key of keys)options.autoReads.again(key,key==='schedule'?permitted:adminPermitted);}
    function monthChanged(){
      if([...locks.values()].some(Boolean))return;
      document.getElementById('schedule-admin-month').value=month.value;
      document.getElementById('bulk-month').value=month.value;
      refreshReads(['schedule','scheduleAdmin','scheduleBulk']);
    }
    allRefresh.addEventListener('click',()=>{if(![...locks.values()].some(Boolean))refreshReads(['schedule','scheduleAdmin','scheduleBulk']);});
    document.getElementById('schedule-admin-month').value=month.value;
    document.getElementById('bulk-month').value=month.value;
    document.getElementById('schedule-admin-scope').value=document.getElementById('schedule-scope').value;
    global.TlhSchedule.init({gasUrl:options.gasUrl,liff:options.liff,audience:'employee',monthly:true,
      onMonthChange:monthChanged,onNavigationLock:value=>lock('employee',value),onSaved:()=>refreshReads(['scheduleAdmin'])});
    global.TlhSchedule.init({gasUrl:options.gasUrl,liff:options.liff,audience:'admin',monthly:true,
      idPrefix:'schedule-admin-',frameName:'tlhScheduleAdminFrame',report:false,lazyCalendar:true,
      onNavigationLock:value=>lock('admin',value),onSaved:()=>refreshReads(['schedule','scheduleBulk'])});
    global.TlhScheduleBulk.init({gasUrl:options.gasUrl,liff:options.liff,
      onNavigationLock:value=>lock('bulk',value),onSaved:()=>refreshReads(['schedule','scheduleAdmin'])});
    return Object.freeze({activate(){
      lock('workspace',false);
      options.autoReads.once('schedule',permitted);
      if(adminPermitted()){options.autoReads.once('scheduleAdmin',adminPermitted);options.autoReads.once('scheduleBulk',adminPermitted);}
    }});
  }
  global.TlhScheduleWorkspace=Object.freeze({init});
})(window);
