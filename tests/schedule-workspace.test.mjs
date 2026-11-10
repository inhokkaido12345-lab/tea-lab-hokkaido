import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function harness(){
 const nodes=new Map(),controllers=[],reads=[],seen=new Set();let allowed=false,visible=true,adminVisible=false,editing=false,confirm=true;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='schedule-month'?'2026-11':id==='schedule-scope'?'FIRST':'',disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn;}});return nodes.get(id);};
 const register=options=>{controllers.push(options);return{hasUnsavedInput:()=>editing};};const window={confirm:()=>confirm,TlhSchedule:{init:register},TlhScheduleManagement:{init:register}};
 vm.runInNewContext(fs.readFileSync(new URL('../workforce/schedule-workspace.js',import.meta.url),'utf8'),{window,document:{getElementById:node}});
 const autoReads={once(key,guard){if(guard()&&!seen.has(key)){seen.add(key);reads.push(key);}},again(key,guard){if(guard())reads.push(key);},invalidate(keys){for(const key of keys)seen.delete(key);}};
 const api=window.TlhScheduleWorkspace.init({gasUrl:'https://offline.invalid',liff:{},autoReads,visible:()=>visible,adminVisible:()=>adminVisible,adminAllowed:()=>allowed});
 return{api,node,controllers,reads,editing:v=>editing=v,confirm:v=>confirm=v,allow:v=>allowed=v,showAdmin(){visible=false;adminVisible=true;},showEmployee(){visible=true;adminVisible=false;},hide(){visible=false;adminVisible=false;}};
}
test('employee tab never starts admin reads even for managers; management shift starts only its two reads once',()=>{
 const h=harness();h.allow(true);h.api.activate();h.api.activate();assert.deepEqual(h.reads,['schedule']);h.api.activateAdmin();assert.equal(h.reads.length,1);
 h.showAdmin();h.api.activateAdmin();h.api.activateAdmin();assert.deepEqual(h.reads,['schedule','scheduleManagement']);
 assert.equal(h.controllers[0].audience,'employee');assert.equal(h.controllers.length,2);
 h.allow(false);h.api.activateAdmin();h.hide();h.api.activate();assert.equal(h.reads.length,2);
});
test('management pending state is isolated from unfinished personal requests',()=>{
 const h=harness();h.allow(true);h.api.activate();h.showAdmin();h.api.activateAdmin();h.controllers[1].onNavigationLock(true);assert.equal(h.controllers[0].loginBlocked(),true);assert.equal(h.node('schedule-month').disabled,false);
 h.controllers[1].onNavigationLock(false);assert.equal(h.controllers[0].loginBlocked(),false);h.node('schedule-month').value='2027-01';h.showEmployee();h.controllers[0].onMonthChange();assert.equal(h.reads.at(-1),'schedule');assert.equal(h.node('schedule-management-month').value,'2026-11');
});

test('saved changes invalidate hidden role views and refresh them only when opened, without automatic writes',()=>{
 const h=harness();h.allow(true);h.api.activate();h.showAdmin();h.api.activateAdmin();const before=h.reads.length;
 h.controllers[1].onSaved();assert.deepEqual(h.reads.slice(before),[]);h.showEmployee();h.api.activate();assert.equal(h.reads.at(-1),'schedule');
 const n=h.reads.length;h.controllers[0].onSaved();assert.equal(h.reads.length,n);h.showAdmin();h.api.activateAdmin();assert.deepEqual(h.reads.slice(n),['scheduleManagement']);
});

test('automatic role refresh defers for an unfinished employee request; explicit refresh requires confirmation',()=>{
 const h=harness();h.allow(true);h.api.activate();h.editing(true);h.showAdmin();h.api.activateAdmin();h.controllers[1].onSaved();h.showEmployee();const n=h.reads.length;h.api.activate();assert.equal(h.reads.length,n);assert.equal(h.node('schedule-draft-notice').hidden,false);
 h.confirm(false);h.node('schedule-workspace-refresh').events.click();assert.equal(h.reads.length,n);h.confirm(true);h.node('schedule-workspace-refresh').events.click();assert.equal(h.reads.at(-1),'schedule');assert.equal(h.node('schedule-draft-notice').hidden,true);
});


test('startup initializes no hidden controllers; repeated activation and denied management never duplicate initialization',()=>{
 const h=harness();assert.equal(h.controllers.length,0);assert.equal(h.reads.length,0);h.hide();
 for(let i=0;i<1000;i++){h.api.activate();h.api.activateAdmin();}assert.equal(h.controllers.length,0);
 h.showAdmin();h.api.activateAdmin();assert.equal(h.controllers.length,0);
 h.showEmployee();for(let i=0;i<1000;i++)h.api.activate();assert.equal(h.controllers.length,1);assert.deepEqual(h.reads,['schedule']);
 h.allow(true);h.showAdmin();for(let i=0;i<1000;i++)h.api.activateAdmin();assert.equal(h.controllers.length,2);assert.deepEqual(h.reads,['schedule','scheduleManagement']);
});
test('management can initialize first and invalidate the still-unopened employee view without losing either month',()=>{
 const h=harness();h.allow(true);h.showAdmin();h.api.activateAdmin();assert.equal(h.controllers.length,1);
 h.node('schedule-management-month').value='2027-02';h.controllers[0].onSaved();assert.deepEqual(h.reads,['scheduleManagement']);
 h.showEmployee();h.api.activate();assert.equal(h.controllers.length,2);assert.equal(h.controllers[1].audience,'employee');
 assert.equal(h.node('schedule-month').value,'2026-11');assert.equal(h.node('schedule-management-month').value,'2027-02');assert.deepEqual(h.reads,['scheduleManagement','schedule']);
});
test('hidden refresh never initializes controllers, while first visible refresh initializes once and fetches once',()=>{
 const h=harness();h.hide();h.node('schedule-workspace-refresh').events.click();assert.equal(h.controllers.length,0);assert.equal(h.reads.length,0);
 h.showEmployee();h.node('schedule-workspace-refresh').events.click();assert.equal(h.controllers.length,1);assert.deepEqual(h.reads,['schedule']);h.api.activate();assert.equal(h.controllers.length,1);
});
