/**
 * 現役UI2・表示時計だけを担当。indexの初期化→Intlの日本時間→表示、退場で停止。
 * 削除影響: 画面の表示時計が更新されなくなる。打刻/認証/保存は変わらない。
 * 概念: presentation-only clock。表示用の端末時計をGASの保存時刻と混同しない。
 * 改造: 表記はpaintのIntl options、色/大きさはapp.css。既存controllerへ日時を渡さない。
 * 境界: 通信/保存/人物情報の取得なし。表示時計から勤務状態や勤務時間を推測しない。
 * 検証: shell.test.mjsと全UI/連結回帰、HTTPS画面で時刻と改行を確認。
 */
(function(global){
  'use strict';
  /** 引数なし。表示だけを更新し、pagehideでintervalを解除。GASへは値を渡さない。 */
  function init(){
    const clock=document.getElementById('display-clock'),date=document.getElementById('display-date');
    function paint(){
      const now=new Date();
      clock.textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
      date.textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(now);
    }
    paint();
    const timer=typeof global.setInterval==='function'?global.setInterval(paint,1000):null;
    global.addEventListener('pagehide',()=>{if(timer!==null)global.clearInterval(timer);clock.textContent='--:--';date.textContent='';});
  }
  global.TlhWorkforceShell=Object.freeze({init});
})(window);
