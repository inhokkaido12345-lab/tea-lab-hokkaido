import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function harness(){
 const nodes=new Map(),controllers=[],reads=[],seen=new Set();let allowed=false,visible=true,adminVisible=false;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='schedule-month'?'2026-11':id==='schedule-scope'?'FIRST':'',disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn;}});return nodes.get(id);};
 const register=options=>{controllers.push(options);return{};};const window={TlhSchedule:{init:register},TlhScheduleBulk:{init:register}};
 vm.runInNewContext(fs.readFileSync(new URL('../workforce/schedule-workspace.js',import.meta.url),'utf8'),{window,document:{getElementById:node}});
 const autoReads={once(key,guard){if(guard()&&!seen.has(key)){seen.add(key);reads.push(key);}},again(key,guard){if(guard())reads.push(key);},invalidate(keys){for(const key of keys)seen.delete(key);}};
 const api=window.TlhScheduleWorkspace.init({gasUrl:'https://offline.invalid',liff:{},autoReads,visible:()=>visible,adminVisible:()=>adminVisible,adminAllowed:()=>allowed});
 return{api,node,controllers,reads,allow:v=>allowed=v,showAdmin(){visible=false;adminVisible=true;},showEmployee(){visible=true;adminVisible=false;},hide(){visible=false;adminVisible=false;}};
}
test('employee tab never starts admin reads even for managers; management shift starts only its two reads once',()=>{
 const h=harness();h.allow(true);h.api.activate();h.api.activate();assert.deepEqual(h.reads,['schedule']);h.api.activateAdmin();assert.equal(h.reads.length,1);
 h.showAdmin();h.api.activateAdmin();h.api.activateAdmin();assert.deepEqual(h.reads,['schedule','scheduleAdmin','scheduleBulk']);
 assert.equal(h.controllers[0].audience,'employee');assert.equal(h.controllers[1].audience,'admin');assert.equal(h.controllers[1].idPrefix,'schedule-admin-');assert.equal(h.controllers[1].frameName,'tlhScheduleAdminFrame');assert.equal(h.controllers[1].report,false);
 h.allow(false);h.api.activateAdmin();h.hide();h.api.activate();assert.equal(h.reads.length,3);
});
test('management preview locks only its own month and syncs admin/bulk without changing employee selection',()=>{
 const h=harness();h.allow(true);h.showAdmin();h.controllers[2].onNavigationLock(true);assert.equal(h.node('schedule-management-month').disabled,true);assert.equal(h.node('schedule-month').disabled,false);
 h.node('schedule-management-month').value='2026-12';h.node('schedule-management-month').events.change();assert.equal(h.reads.length,0);assert.equal(h.node('bulk-month').value,'2026-11');
 h.controllers[2].onNavigationLock(false);h.node('schedule-management-month').events.change();assert.deepEqual(h.reads,['scheduleAdmin','scheduleBulk']);assert.equal(h.node('bulk-month').value,'2026-12');assert.equal(h.node('schedule-admin-month').value,'2026-12');assert.equal(h.node('schedule-month').value,'2026-11');
 h.showEmployee();h.node('schedule-month').value='2027-01';h.controllers[0].onMonthChange();assert.equal(h.reads.at(-1),'schedule');assert.equal(h.node('bulk-month').value,'2026-12');
});
test('saved changes invalidate hidden role views and refresh them only when opened, without automatic writes',()=>{
 const h=harness();h.allow(true);h.api.activate();h.showAdmin();h.api.activateAdmin();const before=h.reads.length;
 h.controllers[2].onSaved();assert.deepEqual(h.reads.slice(before),['scheduleAdmin']);h.showEmployee();h.api.activate();assert.equal(h.reads.at(-1),'schedule');
 const n=h.reads.length;h.controllers[0].onSaved();assert.equal(h.reads.length,n);h.showAdmin();h.api.activateAdmin();assert.deepEqual(h.reads.slice(n),['scheduleAdmin','scheduleBulk']);
});
