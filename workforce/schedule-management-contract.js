/** 管理UIの署名済みDTO検査。CSV・セル編集は含めない。認可はGASが毎回実行する。
 * 削除すると不正/異なる月の応答を検査できない。署名・shape・月/期間/社員/版を一緒に維持する。
 * 魔改造: BridgeのDTO変更はこの許可型・UI試験・実Service連結を同時更新。実データ/Storageなし。 */
(function(global){'use strict';
const key=(code,day)=>code+'|'+day,half=day=>Number(day.slice(8))<=15?'FIRST':'SECOND';
  function days(month){
    if(typeof month!=='string'||!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('月を確認してください。');
    return Array.from({length:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
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

const helpers={days,half,key};
  function validAuthority(a,s){
    if(!a||s?.halves.FIRST.inputMode!=='SHEET'||Object.keys(a).sort().join(',')!=='preview,sourceDigest,targetDigest'||![a.sourceDigest,a.targetDigest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))return false;
    const p=a.preview;
    if(!p||Object.keys(p).sort().join(',')!=='blanks,changes,eventChanges,eventDetails,month,unchanged'||p.month!==s.month)return false;
    if(!Array.isArray(p.changes)||p.changes.length>500||![p.blanks,p.unchanged,p.eventChanges].every(v=>Number.isSafeInteger(v)&&v>=0)||p.eventChanges>2)return false;
    if(!Array.isArray(p.eventDetails)||p.eventDetails.length>31)return false;

    // 署名・月・両半月DTOの検査後に到達。日付一覧は返信1件につき1回だけ作る。
    // Setは所属/権限を記憶しない。各変更の型・社員・版・公開状態の照合は省略しない。
    const model=helpers,calendar=new Set(model.days(s.month));
    const isPublished=day=>s.halves[model.half(day)].phase==='PUBLISHED';
    const validEvent=e=>e&&typeof e==='object'&&Object.keys(e).sort().join(',')==='after,before,day,published'
      &&calendar.has(e.day)&&typeof e.published==='boolean'&&e.published===isPublished(e.day)
      &&[e.before,e.after].every(v=>typeof v==='string'&&v.length<=1000);
    if(!p.eventDetails.every(validEvent)||new Set(p.eventDetails.map(e=>e.day)).size!==p.eventDetails.length||new Set(p.eventDetails.map(e=>model.half(e.day))).size!==p.eventChanges)return false;

    const people=new Map(s.halves.FIRST.employees.map(v=>[v.employeeCode,v.employeeName])),seen=new Set();
    return p.changes.every(c=>{
      if(!c||typeof c!=='object')return false;
      const target=model.key(c.employeeCode,c.day);if(seen.has(target))return false;seen.add(target);
      return Object.keys(c).sort().join(',')==='after,before,day,employeeCode,employeeName,expectedPlanRevision,plan,published,workText'
        &&people.get(c.employeeCode)===c.employeeName&&calendar.has(c.day)
        &&typeof c.published==='boolean'&&c.published===isPublished(c.day)
        &&Number.isSafeInteger(c.expectedPlanRevision)&&c.expectedPlanRevision>=0
        &&[c.before,c.after,c.workText].every(v=>typeof v==='string'&&v.length<=16000)
        &&c.plan?.day===c.day&&global.TlhSchedule.validatePlan(c.plan);
    });
  }

function sheet(value,month,command){
 if(!value||!['csv,month,sheet,snapshot,version','authority,csv,month,sheet,snapshot,version'].includes(Object.keys(value).sort().join(','))||value.version!==1||value.month!==month||!validate(value.snapshot,month)||value.csv!==''||!value.sheet||Object.keys(value.sheet).sort().join(',')!=='created,url'||typeof value.sheet.created!=='boolean'||typeof value.sheet.url!=='string'||!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit#gid=\d+$/.test(value.sheet.url))return false;
 if(value.authority&&!validAuthority(value.authority,value.snapshot))return false;
 return command!=='sheetRead'||value.snapshot.halves.FIRST.inputMode==='SHEET'&&!!value.authority;
}
global.TlhScheduleManagementContract=Object.freeze({days,validate,sheet,validAuthority});
})(window);
