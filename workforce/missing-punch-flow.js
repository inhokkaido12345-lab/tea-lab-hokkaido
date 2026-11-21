/** Fixed-fragment navigation re-reads SELF hints. Queue is in-memory navigation only.
 * Each day retains existing preview/explicit confirmation and real-time entry. */
(function(global){'use strict';
 function init({editor,liff,gasUrl}){const root=document.getElementById('missing-punch-choices'),status=document.getElementById('missing-punch-selection-status'),next=document.getElementById('missing-punch-next');let days=[],queue=[],active=null;
  function choose(chosen){queue=chosen.filter(d=>days.includes(d));advance();}
  function advance(){const day=queue[0];if(!day)return;if(!editor.selectDay(day)){status.textContent='入力・送信中の申請を残しています。完了後に次の日へ進んでください。';next.hidden=false;return;}active=day;queue.shift();next.hidden=true;status.textContent=day+' の実際の勤務時刻を入力してください。残り '+queue.length+' 日。';}
  const notice=global.TlhMissingPunchNotice.init({root,onSelect:choose});
  const read=global.TlhMissingPunchRead.init({liff,gasUrl,onDates:value=>{days=[...value];notice.setVerifiedDates(days);if(days.length===1&&!active)choose(days);}});
  next.addEventListener('click',advance);read.load();
  return Object.freeze({requested(day){days=days.filter(d=>d!==day);queue=queue.filter(d=>d!==day);notice.setVerifiedDates(days);active=null;status.textContent=day+' は申請済みです。管理者の承認待ちです。'+(queue.length?' 次の日も個別に申請してください。':'');next.hidden=!queue.length;}});
 }
 global.TlhMissingPunchFlow=Object.freeze({init});
})(window);
