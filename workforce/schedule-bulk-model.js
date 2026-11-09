/**
 * 月型入力の純粋な変換。通信/DOM/認可/保存は行わず、表示文字列⇄既存plan入力を変換する。
 * 削除影響: 月型編集だけ停止。既存の個別編集と原簿は別。業務の最終検査はGAS Model。
 * 魔改造: 入力記号/期間型はhelp・GAS Model・拒否/日跨ぎ/上書き検査を同時変更する。
 * 初歩: 空欄と公休は別。全日休暇を勝手に推定せず、既存の用事/非公開メモは保持する。
 */
(function(global){'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value)),key=(code,day)=>code+'|'+day;
  function days(month){
    if(typeof month!=='string'||!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('月を確認してください。');
    return Array.from({length:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
  }
  const half=day=>Number(day.slice(8))<=15?'FIRST':'SECOND';
  function input(plan){return clone({periods:plan?.periods||[],appointments:plan?.appointments||[],leave:plan?.leave||{type:'NONE',unit:'DAY',minutes:null,note:''},note:plan?.note||'',...(plan?.publicNote?{publicNote:plan.publicNote}:{})});}
  function format(plan){
    if(!plan)return'';
    if(plan.periods.length)return plan.periods.map(p=>p.start+'-'+(p.endNextDay?'翌':'')+p.end+'/'+p.breakMinutes).join('\n');
    return {PUBLIC_OFF:'公休',PAID:'有給',OTHER:'その他休暇',NONE:'未定'}[plan.leave.type];
  }
  function parse(text,base){
    if(typeof text!=='string'||text.length>2000)throw Error('入力が長すぎます。');
    const p=input(base),value=text.trim();
    if(!value){if(base&&format(base)!=='未定')throw Error('予定を未定へ戻す場合は「未定」と入力してください。');return p;}
    const leave={休:'PUBLIC_OFF',公休:'PUBLIC_OFF',有給:'PAID',その他休暇:'OTHER',未定:'NONE'};
    if(Object.hasOwn(leave,value)){p.periods=[];p.leave={type:leave[value],unit:'DAY',minutes:null,note:''};return p;}
    let previous=-1;p.periods=value.replace(/[～~–−－]/g,'-').split(/[,、\n]+/).map(part=>{
      const match=part.trim().match(/^(\d{1,2}):([0-5]\d)\s*-\s*(翌)?(\d{1,2}):([0-5]\d)(?:\s*\/\s*(\d{1,4}))?$/);
      if(!match||Number(match[1])>23||Number(match[4])>23)throw Error('時刻は「09:00-18:00/60」、日跨ぎは「22:00-翌06:00/60」です。');
      const start=Number(match[1])*60+Number(match[2]),end=Number(match[4])*60+Number(match[5])+(match[3]?1440:0),rest=Number(match[6]||0);
      if(end<=start||start<previous||rest>end-start)throw Error('勤務区間の重複・逆転、休憩分数を確認してください。');previous=end;
      return{start:match[1].padStart(2,'0')+':'+match[2],end:match[4].padStart(2,'0')+':'+match[5],endNextDay:!!match[3],breakMinutes:rest};
    });
    if(p.periods.length>10)throw Error('勤務区間は1日10件までです。');
    p.leave={type:'NONE',unit:'DAY',minutes:null,note:''};return p;
  }
  function validate(value,month){
    try{
      days(month);
      if(!value||value.version!==1||value.admin!==true||value.month!==month||!value.halves||Object.keys(value.halves).sort().join(',')!=='FIRST,SECOND')return false;
      if(Object.hasOwn(value,'inputSheetUrl')&&(typeof value.inputSheetUrl!=='string'||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit$/.test(value.inputSheetUrl)))return false;
      for(const part of ['FIRST','SECOND'])if(!global.TlhSchedule.validate(value.halves[part],month,true,part))return false;
      const a=value.halves.FIRST.employees,b=value.halves.SECOND.employees;
      return JSON.stringify(a)===JSON.stringify(b)&&new Set(a.map(p=>p.employeeCode)).size===a.length&&value.halves.FIRST.inputMode===value.halves.SECOND.inputMode;
    }catch(_e){return false;}
  }
  function oldPlan(snapshot,code,day){return snapshot.halves[half(day)].drafts.find(p=>p.employeeCode===code&&p.day===day);}
  /** Mapには変更したセルだけ。未入力日を0時間や公休の行として一括作成しない。 */
  function payload(snapshot,drafts,reason){
    const employees=new Set(snapshot.halves.FIRST.employees.map(p=>p.employeeCode)),calendar=days(snapshot.month),changes=[];
    for(const [target,p]of drafts){
      const [employeeCode,day]=target.split('|');if(!employees.has(employeeCode)||!calendar.includes(day))throw Error('対象の従業員・日付を確認してください。');
      const old=oldPlan(snapshot,employeeCode,day);
      if(JSON.stringify(input(old?.plan))===JSON.stringify(input(p)))continue;
      changes.push({employeeCode,day,expectedPlanRevision:snapshot.halves[half(day)].phase==='PUBLISHED'?snapshot.halves[half(day)].monthRevision:old?.revision||0,plan:input(p)});
    }
    if(changes.length>500)throw Error('一度の保存は変更500日分までです。');
    return{month:snapshot.month,audience:'admin',expectedRevisions:{FIRST:snapshot.halves.FIRST.monthRevision,SECOND:snapshot.halves.SECOND.monthRevision},changes,reason};
  }
  global.TlhScheduleBulkModel=Object.freeze({key,days,half,input,format,parse,validate,oldPlan,payload});
})(window);
