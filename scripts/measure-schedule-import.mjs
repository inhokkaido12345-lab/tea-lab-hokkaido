/**
 * 責務: 正本取込みの月計算と旧CSVの検索回数を、架空16人×30日で再現する。
 * 通信先は試験用の偽物。署名検査は実WebCryptoで行うが、Google/実社員/保存は使わない。
 * 魔改造: 件数を変更する場合も500変更上限と月末を守る。秒数の目標をこの値から推定しない。
 * 削除影響: 計測入口だけ。node scripts/measure-schedule-import.mjsで再実行できる。
 */
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {scheduleBulkHarness,bulkSnapshot} from '../tests/helpers/schedule-bulk-harness.mjs';
export async function measureScheduleImport(){
  const h=scheduleBulkHarness(),s=bulkSnapshot(16),days=h.model.days(s.month);
  for(const half of Object.values(s.halves))half.inputMode='SHEET';
  const changes=s.halves.FIRST.employees.flatMap(person=>days.map(day=>({
    employeeCode:person.employeeCode,employeeName:person.employeeName,day,
    before:'未入力',after:'公休',workText:'公休',published:false,expectedPlanRevision:0,
    plan:{day,...h.model.parse('公休')}
  })));
  const eventDetails=days.map(day=>({day,before:'',after:'架空イベント',published:false}));
  await h.api.load();await h.reply(h.sent[0],s);h.click('sheet-read');
  let calendarBuilds=0;
  h.window.TlhScheduleBulkModel={...h.model,days(month){calendarBuilds++;return h.model.days(month);}};
  await h.reply(h.sent[1],{
    version:1,month:s.month,snapshot:s,csv:'',sheet:{url:'https://docs.google.com/spreadsheets/d/fake-sheet/edit#gid=123',created:false},
    authority:{sourceDigest:'a'.repeat(64),targetDigest:'b'.repeat(64),preview:{month:s.month,changes,blanks:0,unchanged:0,eventChanges:2,eventDetails}}
  },'SCHEDULE_SHEET_READY');
  assert.equal(h.n('import-preview').hidden,false);assert.equal(h.sent.length,2);
  assert.equal(calendarBuilds,1);

  // 旧findと新索引へ同じ行を渡し、検索結果と走査量の両方を比較する。
  let inspections=0;
  for(const change of changes){
    const code=change.employeeCode;
    s.halves[h.model.half(change.day)].drafts.push({get employeeCode(){inspections++;return code;},day:change.day,plan:change.plan});
  }
  const previous=changes.map(c=>h.model.oldPlan(s,c.employeeCode,c.day)),oldInspections=inspections;
  inspections=0;const find=h.model.planLookup(s),indexed=changes.map(c=>find(c.employeeCode,c.day));
  assert.deepEqual(indexed,previous);assert.equal(inspections,480);assert.equal(oldInspections,57840);
  return{fixture:'16 fictional employees / 30 days / 480 changes / 30 events',calendarBuilds:{before:changes.length+eventDetails.length,after:calendarBuilds},planInspections:{before:oldInspections,after:inspections},requests:2,liveNetwork:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await measureScheduleImport()));
