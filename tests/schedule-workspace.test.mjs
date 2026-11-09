import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function harness(){
  const nodes=new Map(),controllers=[],reads=[],seen=new Set();let allowed=false,visible=true;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='schedule-month'?'2026-11':id==='schedule-scope'?'FIRST':'',disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn;}});return nodes.get(id);};
  const register=options=>{controllers.push(options);return{};};
  const window={TlhSchedule:{init:register},TlhScheduleBulk:{init:register}};
  vm.runInNewContext(fs.readFileSync(new URL('../workforce/schedule-workspace.js',import.meta.url),'utf8'),{window,document:{getElementById:node}});
  const autoReads={once(key,guard){if(guard()&&!seen.has(key)){seen.add(key);reads.push(key);}},again(key,guard){if(guard())reads.push(key);}};
  const api=window.TlhScheduleWorkspace.init({gasUrl:'https://offline.invalid',liff:{},autoReads,visible:()=>visible,adminAllowed:()=>allowed});
  return{api,node,controllers,reads,allow:value=>allowed=value,visible:value=>visible=value};
}
test('one workspace keeps role/form/frame boundaries, reuses first reads and never auto-starts an import or write',()=>{
  const h=harness();h.api.activate();assert.deepEqual(h.reads,['schedule']);h.api.activate();assert.equal(h.reads.length,1);
  h.allow(true);h.api.activate();assert.deepEqual(h.reads,['schedule','scheduleAdmin','scheduleBulk']);
  assert.equal(h.controllers[0].audience,'employee');assert.equal(h.controllers[1].audience,'admin');assert.equal(h.controllers[1].idPrefix,'schedule-admin-');assert.equal(h.controllers[1].frameName,'tlhScheduleAdminFrame');assert.equal(h.controllers[1].report,false);
  h.allow(false);h.controllers[0].onSaved();assert.equal(h.reads.length,3);h.visible(false);h.api.activate();assert.equal(h.reads.length,3);
});
test('month selection is locked during another controller pending/preview/unknown state and updates all readers after release',()=>{
  const h=harness();h.allow(true);h.controllers[2].onNavigationLock(true);assert.equal(h.node('schedule-month').disabled,true);assert.equal(h.node('schedule-refresh').disabled,true);
  h.node('schedule-month').value='2026-12';h.controllers[0].onMonthChange();assert.equal(h.reads.length,0);assert.equal(h.node('bulk-month').value,'2026-11');
  h.controllers[2].onNavigationLock(false);assert.equal(h.node('schedule-month').disabled,false);h.controllers[0].onMonthChange();
  assert.deepEqual(h.reads,['schedule','scheduleAdmin','scheduleBulk']);assert.equal(h.node('bulk-month').value,'2026-12');assert.equal(h.node('schedule-admin-month').value,'2026-12');
  h.controllers[2].onSaved();assert.deepEqual(h.reads.slice(-2),['schedule','scheduleAdmin']);
});
