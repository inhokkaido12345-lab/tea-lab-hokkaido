import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const window={};vm.runInNewContext(fs.readFileSync(new URL('../workforce/schedule-view.js',import.meta.url),'utf8'),{window});const view=window.TlhScheduleView;
const work=(code,day)=>({employeeCode:code,employeeName:'Fixture '+code,day,periods:[{start:'09:00',end:'18:00',endNextDay:false,breakMinutes:60}],workIntervals:[{startAtUtc:day+'T00:00:00Z',endAtUtc:day+'T09:00:00Z'}],plannedMinutes:480,leaveType:'NONE',publicNote:'公開のメモ',note:'PRIVATE_DO_NOT_EXPORT'});
test('matrix has one row per employee and complete half-month columns, retaining missing and unpublished days',()=>{
 const s={month:'2026-11',period:'MONTH',plans:[work('B','2026-11-01'),work('A','2026-11-16')],events:[{day:'2026-11-03',title:'共有イベント',note:'補足'}],unpublishedDays:[]},before=JSON.stringify(s),m=view.matrix(s);
 assert.equal(m.blocks.length,2);assert.equal(m.blocks[0].days.length,15);assert.equal(m.blocks[1].days.length,15);assert.equal(m.blocks[0].employees.length,2);
 assert.equal(m.blocks[0].employees[0].employeeCode,'A');assert.equal(m.blocks[0].employees[0].cells[0].state,'unset');assert.equal(m.blocks[1].employees[0].workDays,1);assert.equal(m.blocks[0].days[2].event,'共有イベント：補足');assert.doesNotMatch(JSON.stringify(m),/PRIVATE_DO_NOT_EXPORT/);assert.equal(JSON.stringify(s),before);
 s.unpublishedDays=['2026-11-02'];assert.equal(view.matrix(s).blocks[0].employees[0].cells[1].state,'unpublished');
});
test('compact times preserve minutes, next day and multiple shifts; only working days count',()=>{
 assert.equal(view.compactWorkText([{startAtUtc:'2026-11-01T00:30:00Z',endAtUtc:'2026-11-01T03:00:00Z'},{startAtUtc:'2026-11-01T14:00:00Z',endAtUtc:'2026-11-01T16:15:00Z'}],'2026-11-01'),'9:30–12\n23–1:15（翌日）');
 const p=work('A','2026-11-01'),off={...p,day:'2026-11-02',periods:[],workIntervals:[],plannedMinutes:0,leaveType:'PUBLIC_OFF'},missing={...off,day:'2026-11-03',plannedMinutes:null};
 const b=view.matrix({month:'2026-11',plans:[p,off,missing],events:[]}).blocks[0];assert.equal(b.employees[0].workDays,1);assert.equal(b.employees[0].cells[1].text,'公休');assert.equal(b.employees[0].cells[2].text,'予定未設定');
});
test('leap and common February, thirty-first and second-half views retain every exact calendar day',()=>{
 for(const [month,last] of [['2028-02',29],['2026-02',28],['2026-12',31]]){const m=view.matrix({month,plans:[],events:[]});assert.equal(m.blocks.flatMap(b=>b.days).length,last);assert.equal(m.blocks.at(-1).days.at(-1).number,last);}
 const m=view.matrix({month:'2026-11',period:'SECOND',plans:[],events:[]});assert.equal(m.blocks.length,1);assert.equal(m.blocks[0].days[0].number,16);
});
