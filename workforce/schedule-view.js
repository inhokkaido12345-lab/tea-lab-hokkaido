/**
 * シフトの表示専用計算。calendar/report→日別索引とJST時刻表記。
 * DOM/通信/保存/認可を持たない。予定実働はサーバー値を使い、ここで再計算しない。
 * 削除影響: シフト閲覧と印刷の表示が停止する。保存済み予定や原打刻は残る。
 * 一般化: 表示に使う索引を1回だけ作り、日ごとに全件を検索し直さない。
 * 魔改造: 日付キー・翌日表記の変更はカレンダー/印刷/CSVとテストを同期する。
 * 境界: 入力は署名/DTO検査済み。戻り値を公開範囲の判断や権限の根拠に使わない。
 */
(function(global){
  'use strict';

  /** 元の順序とオブジェクトを保持する一時索引。取得し直したら必ず作り直す。 */
  function groupByDay(rows){
    const result=new Map();
    for(const row of rows){
      const day=row.day;
      if(!result.has(day))result.set(day,[]);
      result.get(day).push(row);
    }
    return result;
  }

  /** UTCを日本時間へ表示するだけ。サーバーが確定した区間の境界や実働値を変更しない。 */
  function workText(intervals,day,separator='、'){
    const local=value=>new Date(Date.parse(value)+32400000).toISOString();
    return intervals.map(interval=>{
      const start=local(interval.startAtUtc),end=local(interval.endAtUtc);
      return start.slice(11,16)+'–'+end.slice(11,16)+(end.slice(0,10)!==day?'（翌日）':'');
    }).join(separator);
  }

  /** 前半/後半の表示範囲。MONTHは既存の月全体データを読む互換モード。 */
  function periodRange(month,period='MONTH'){
    const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
    return {start:month+(period==='SECOND'?'-16':'-01'),end:month+'-'+String(period==='FIRST'?15:last).padStart(2,'0')};
  }

  /** 表示専用の公表済み祝日。共有イベントの自由入力から祝日を推測しない。
   * 出典: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html （2026-11-11確認）。
   * 改造: 毎年公表を確認してScheduleInputSheet.gsの一覧と同時更新する。
   * 未公表年は推算せずnull。法定休日・割増賃金の計算には使わない。 */
  // 固定の公表表は1回だけ確保。日付ごとに2年分のオブジェクトを生成しない。
  const holidayYears={
    '2026':{'01-01':'元日','01-12':'成人の日','02-11':'建国記念の日','02-23':'天皇誕生日','03-20':'春分の日','04-29':'昭和の日','05-03':'憲法記念日','05-04':'みどりの日','05-05':'こどもの日','05-06':'振替休日','07-20':'海の日','08-11':'山の日','09-21':'敬老の日','09-22':'国民の休日','09-23':'秋分の日','10-12':'スポーツの日','11-03':'文化の日','11-23':'勤労感謝の日'},
    '2027':{'01-01':'元日','01-11':'成人の日','02-11':'建国記念の日','02-23':'天皇誕生日','03-21':'春分の日','03-22':'振替休日','04-29':'昭和の日','05-03':'憲法記念日','05-04':'みどりの日','05-05':'こどもの日','07-19':'海の日','08-11':'山の日','09-20':'敬老の日','09-23':'秋分の日','10-11':'スポーツの日','11-03':'文化の日','11-23':'勤労感謝の日'}
  };
  function holidayName(day){
    const year=holidayYears[day.slice(0,4)];
    return year ? year[day.slice(5)]||'' : null;
  }

  /** 人が追う時刻だけ短くする。00分以外・翌日・中抜けを省略せず、計算値は変えない。 */
  function compactWorkText(intervals,day){return workText(intervals,day,'\n').replace(/(^|\n|–)(\d{2}):(\d{2})/g,(_m,p,h,m)=>p+Number(h)+(m==='00'?'':':'+m));}

  /** 共有確定DTO→社員×日付。私的plan/申請/希望理由は読まない。空欄を休日へ推測しない。
   * 改造: 前半/後半は見やすさだけの分割で、締切・公開範囲・保存キーを変えない。
   * O(予定数+人数×日数)の一時索引。別の要求やアカウントへ持ち越さない。 */
  function matrix(s){
    const range=periodRange(s.month,s.period),unpublished=new Set(s.unpublishedDays||[]),people=new Map(),byPersonDay=new Map(),events=groupByDay(s.events);
    for(const p of s.plans){people.set(p.employeeCode,p.employeeName);byPersonDay.set(p.employeeCode+'|'+p.day,p);}
    const employees=[...people].sort((a,b)=>a[0].localeCompare(b[0])),blocks=[];
    for(const part of ['FIRST','SECOND']){
      const half=periodRange(s.month,part),start=half.start>range.start?half.start:range.start,end=half.end<range.end?half.end:range.end;if(start>end)continue;
      const days=[];for(let n=Number(start.slice(8));n<=Number(end.slice(8));n++){const day=s.month+'-'+String(n).padStart(2,'0');days.push({day,number:n,holiday:holidayName(day),weekday:new Date(day+'T00:00:00Z').getUTCDay(),event:(events.get(day)||[]).map(e=>e.title+(e.note?'：'+e.note:'')).join('\n')});}
      blocks.push({title:Number(s.month.slice(0,4))+'年'+Number(s.month.slice(5))+'月 '+Number(start.slice(8))+'〜'+Number(end.slice(8))+'日',unpublished:days.every(d=>unpublished.has(d.day)),days,employees:employees.map(([employeeCode,employeeName])=>{
        let workDays=0;const cells=days.map(({day})=>{const p=byPersonDay.get(employeeCode+'|'+day);
          if(unpublished.has(day))return{day,text:'未公開',rest:'',note:'',state:'unpublished'};
          if(!p||p.plannedMinutes===null)return{day,text:'予定未設定',rest:'',note:p?.publicNote||'',state:'unset'};
          const work=compactWorkText(p.workIntervals,day);if(work)workDays++;
          return{day,text:work||({PUBLIC_OFF:'公休',LEAVE:'休暇'}[p.leaveType]||'勤務区間なし'),rest:work?'休'+p.periods.reduce((n,q)=>n+q.breakMinutes,0)+'分':'',note:p.publicNote||'',state:work?'work':p.leaveType==='PUBLIC_OFF'?'off':'leave'};
        });return{employeeCode,employeeName,workDays,cells};
      })});
    }
    return{month:s.month,blocks};
  }
  global.TlhScheduleView=Object.freeze({groupByDay,workText,periodRange,holidayName,compactWorkText,matrix});
})(window);
