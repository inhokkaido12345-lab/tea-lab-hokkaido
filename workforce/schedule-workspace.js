/**
 * 責務: 従業員用シフトと、管理→シフト管理のcontrollerを別々に接続する。
 * 呼出元: indexの共通LIFF初期化とlayoutの表示通知。読取キュー/認証は既存を共用。
 * 削除影響: ホーム内の自動取得だけ停止。単独ページ/保存済み勤務/打刻は消えない。
 * 一般化: role-based workspace。管理者本人も従業員としての操作は従業員側で行う。
 * 魔改造: 月・待機状態は本人/管理で独立。管理内は一つの月選択と、編集・公開/希望休の二分類。
 * 境界: 初回/更新は固定READだけ。保存成功は他画面の読取キャッシュを無効化し、書込みを再送しない。
 * 検証: workspace/layout/全UI/実Service連結。権限はGASが毎回判定し、表示を認可にしない。
 */
(function(global){'use strict';
  function init(options){
    const month=document.getElementById('schedule-month'),refresh=document.getElementById('schedule-workspace-refresh'),notice=document.getElementById('schedule-draft-notice');
    const locks=new Map();let employeeUi=null;
    const employeePermitted=()=>options.visible(),employeeReadPermitted=()=>employeePermitted()&&!employeeUi?.hasUnsavedInput(),adminPermitted=()=>options.adminVisible()&&options.adminAllowed();
    const loginBlocked=()=>Array.from(locks.values()).some(Boolean);
    function controls(){const locked=!!locks.get('employee');month.disabled=locked;refresh.disabled=locked||!employeePermitted();}
    function lock(key,value){locks.set(key,value);controls();}
    function invalidate(keys){options.autoReads.invalidate(keys);if(keys.includes('schedule')&&employeeUi?.hasUnsavedInput()){notice.textContent='管理側で更新がありました。入力中の希望は保持しています。「シフトを更新」で最新情報を取得できます。';notice.hidden=false;}}
    function employeeMonthChanged(){if(!locks.get('employee')){notice.hidden=true;options.autoReads.again('schedule',employeeReadPermitted);}}
    refresh.addEventListener('click',()=>{if(locks.get('employee'))return;if(employeeUi?.hasUnsavedInput()&&!global.confirm('未送信の希望入力を破棄して最新のシフトを取得しますか？'))return;notice.hidden=true;options.autoReads.again('schedule',employeePermitted);});
    // 既定月だけ共通。以後は本人の未送信希望と、管理側の月/公開待ちを独立させる。
    document.getElementById('schedule-management-month').value=month.value;
    employeeUi=global.TlhSchedule.init({gasUrl:options.gasUrl,liff:options.liff,loginBlocked,audience:'employee',monthly:true,onMonthChange:employeeMonthChanged,onNavigationLock:value=>lock('employee',value),onSaved:()=>{notice.hidden=true;invalidate(['scheduleManagement']);}});
    global.TlhScheduleManagement.init({embedded:true,gasUrl:options.gasUrl,liff:options.liff,loginBlocked,onNavigationLock:value=>lock('management',value),onSaved:()=>invalidate(['schedule'])});
    return Object.freeze({activate(){controls();options.autoReads.once('schedule',employeeReadPermitted);},activateAdmin(){controls();if(adminPermitted())options.autoReads.once('scheduleManagement',adminPermitted);}});
  }
  global.TlhScheduleWorkspace=Object.freeze({init});
})(window);
