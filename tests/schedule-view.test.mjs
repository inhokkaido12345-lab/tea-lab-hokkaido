import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function view(){
 const window={};
 vm.runInNewContext(fs.readFileSync(new URL('../workforce/schedule-view.js',import.meta.url),'utf8'),{window});
 return window.TlhScheduleView;
}
test('large month is indexed in one pass and retains original records and within-day order',()=>{
 let visits=0;
 const rows=Array.from({length:3000},(_,i)=>({get day(){visits++;return '2026-11-'+String(i%30+1).padStart(2,'0');},employeeCode:'EMP'+i}));
 const grouped=view().groupByDay(rows);
 assert.equal(visits,3000);assert.equal(grouped.size,30);assert.equal(grouped.get('2026-11-01').length,100);
 assert.equal(grouped.get('2026-11-01')[0],rows[0]);assert.equal(grouped.get('2026-11-01')[1],rows[30]);assert.equal(rows.length,3000);
 assert.equal(view().groupByDay([]).size,0);
});
test('calendar and print share Japan-time and next-day notation without modifying UTC intervals',()=>{
 const intervals=[{startAtUtc:'2026-12-31T14:00:00.000Z',endAtUtc:'2026-12-31T16:00:00.000Z'},{startAtUtc:'2027-01-01T03:00:00.000Z',endAtUtc:'2027-01-01T04:00:00.000Z'}],before=JSON.stringify(intervals),v=view();
 assert.equal(v.workText(intervals,'2026-12-31'),'23:00–01:00（翌日）、12:00–13:00（翌日）');
 assert.equal(v.workText(intervals,'2026-12-31','\n'),'23:00–01:00（翌日）\n12:00–13:00（翌日）');
 assert.equal(JSON.stringify(intervals),before);assert.equal(v.workText([],'2026-12-31'),'');
});
test('both entry pages load pure view helpers before calendar and export controllers',()=>{
 for(const name of ['schedule.html','admin-schedule.html']){
  const html=fs.readFileSync(new URL('../workforce/'+name,import.meta.url),'utf8');
  assert.ok(html.indexOf('src="schedule-view.js')<html.indexOf('src="schedule-report.js'));
  assert.ok(html.indexOf('src="schedule-report.js')<html.indexOf('src="schedule.js'));
 }
});
