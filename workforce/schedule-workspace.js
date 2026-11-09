/**
 * 責務: 従業員用シフトと、管理→シフト管理のcontrollerを別々に接続する。
 * 呼出元: indexの共通LIFF初期化とlayoutの表示通知。読取キュー/認証は既存を共用。
 * 削除影響: ホーム内の自動取得だけ停止。単独ページ/保存済み勤務/打刻は消えない。
 * 一般化: role-based workspace。管理者本人も従業員としての操作は従業員側で行う。
 * 魔改造: 月・待機状態は本人/管理で独立。管理内だけ承認画面と取込み画面の月を同期する。
 * 境界: 初回/更新は固定READだけ。保存成功は他画面の読取キャッシュを無効化し、書込みを再送しない。
 * 検証: workspace/layout/全UI/実Service連結。権限はGASが毎回判定し、表示を認可にしない。
 */
(function(global){'use strict';
  function init(options){
    const employeeMonth=document.getElementById('schedule-month'),employeeRefresh=document.getElementById('schedule-workspace-refresh');
    const adminMonth=document.getElementById('schedule-management-month'),adminRefresh=document.getElementById('schedule-management-refresh');
    const locks=new Map(),notice=document.getElementById('schedule-draft-notice');let employeeUi=null;
    const employeePermitted=()=>options.visible(),employeeReadPermitted=()=>employeePermitted()&&!employeeUi?.hasUnsavedInput(),adminPermitted=()=>options.adminVisible()&&options.adminAllowed();
    function blocked(group){return group==='employee'?!!locks.get('employee'):!!locks.get('admin')||!!locks.get('bulk');}
    function controls(){
      employeeMonth.disabled=blocked('employee');employeeRefresh.disabled=blocked('employee')||!employeePermitted();
      adminMonth.disabled=blocked('admin')||!options.adminAllowed();adminRefresh.disabled=blocked('admin')||!adminPermitted();
    }
    function lock(key,value){locks.set(key,value);controls();}
    function refreshReads(keys,manual=false){for(const key of keys)options.autoReads.again(key,key==='schedule'?(manual?employeePermitted:employeeReadPermitted):adminPermitted);}
    function invalidate(keys){options.autoReads.invalidate(keys);if(keys.includes('schedule')&&employeeUi?.hasUnsavedInput()){notice.textContent='管理側で更新がありました。入力中の希望は保持しています。「シフトを更新」で最新情報を取得できます（未送信の入力を破棄します）。';notice.hidden=false;}}
    function employeeMonthChanged(){if(!blocked('employee')){notice.hidden=true;refreshReads(['schedule'],true);}}
    function adminMonthChanged(){
      if(blocked('admin'))return;
      document.getElementById('schedule-admin-month').value=adminMonth.value;
      document.getElementById('bulk-month').value=adminMonth.value;
      refreshReads(['scheduleAdmin','scheduleBulk']);
    }
    employeeRefresh.addEventListener('click',()=>{if(blocked('employee'))return;if(employeeUi?.hasUnsavedInput()&&!global.confirm('未送信の希望入力を破棄して最新のシフトを取得しますか？'))return;notice.hidden=true;refreshReads(['schedule'],true);});
    adminRefresh.addEventListener('click',()=>{if(!blocked('admin'))refreshReads(['scheduleAdmin','scheduleBulk']);});
    adminMonth.addEventListener('change',adminMonthChanged);
    // 起動時の既定月だけ共通。以後、従業員が選んだ月を管理者の未保存入力へ流し込まない。
    adminMonth.value=employeeMonth.value;
    document.getElementById('schedule-admin-month').value=adminMonth.value;
    document.getElementById('bulk-month').value=adminMonth.value;
    document.getElementById('schedule-admin-scope').value=document.getElementById('schedule-scope').value;
    employeeUi=global.TlhSchedule.init({gasUrl:options.gasUrl,liff:options.liff,audience:'employee',monthly:true,
      onMonthChange:employeeMonthChanged,onNavigationLock:value=>lock('employee',value),onSaved:()=>{notice.hidden=true;invalidate(['scheduleAdmin','scheduleBulk']);}});
    global.TlhSchedule.init({gasUrl:options.gasUrl,liff:options.liff,audience:'admin',monthly:true,
      idPrefix:'schedule-admin-',frameName:'tlhScheduleAdminFrame',report:false,lazyCalendar:true,
      onMonthChange:adminMonthChanged,onNavigationLock:value=>lock('admin',value),onSaved:()=>{invalidate(['schedule']);refreshReads(['scheduleBulk']);}});
    global.TlhScheduleBulk.init({gasUrl:options.gasUrl,liff:options.liff,
      onNavigationLock:value=>lock('bulk',value),onSaved:()=>{invalidate(['schedule']);refreshReads(['scheduleAdmin']);}});
    return Object.freeze({activate(){controls();options.autoReads.once('schedule',employeeReadPermitted);},
      activateAdmin(){controls();if(adminPermitted()){options.autoReads.once('scheduleAdmin',adminPermitted);options.autoReads.once('scheduleBulk',adminPermitted);}}});
  }
  global.TlhScheduleWorkspace=Object.freeze({init});
})(window);
