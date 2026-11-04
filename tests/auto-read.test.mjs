/** Actual read-only scheduler, DOM lifecycle simulated; no real employee/network. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function harness(){
 const nodes=new Map(),watchers=new Set(),events={},sent=[],reloads=[];
 class Observer{constructor(fn){this.fn=fn;}observe(node){this.node=node;watchers.add(this);}disconnect(){watchers.delete(this);}}
 const n=id=>{if(!nodes.has(id))nodes.set(id,{id,disabled:false,attrs:{},textContent:'',getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=v;for(const o of [...watchers])if(o.node===this)o.fn();},click(){sent.push(id);n(id.replace(/-(check|load|refresh)$/,'-status')).setAttribute('aria-busy','true');}});return nodes.get(id);};
 const window={location:{reload(){reloads.push('GET');}},addEventListener(k,fn){events[k]=fn;}};vm.runInNewContext(fs.readFileSync(new URL('../workforce/auto-read.js',import.meta.url),'utf8'),{window,document:{getElementById:n},MutationObserver:Observer});
 return{api:window.TlhAutoRead.init(),n,sent,events,watchers,reloads,finish:id=>n(id+'-status').setAttribute('aria-busy','false')};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('shift tab activation schedules only its read once and never submits a preference',async()=>{
 const h=harness();for(let i=0;i<100;i++)h.api.once('schedule');await tick();assert.deepEqual(h.sent,['schedule-refresh']);h.finish('schedule');await tick();h.api.once('schedule');await tick();assert.equal(h.sent.length,1);
});

test('history restoration reloads once without replaying a write or resuming a stopped queue',async()=>{
 const h=harness();h.events.pageshow({persisted:false});assert.equal(h.reloads.length,0);
 h.api.once('punch');h.api.once('daily');await tick();h.events.pagehide();
 h.events.pageshow({persisted:true});h.events.pageshow({persisted:true});h.api.again('punch');h.finish('punch');await tick();
 assert.deepEqual(h.reloads,['GET']);assert.deepEqual(h.sent,['punch-check']);assert.equal(h.watchers.size,0);
});
test('visible reads run sequentially once, a thousand activations cannot duplicate and write keys cannot execute',async()=>{
 const h=harness();for(let i=0;i<1000;i++)h.api.once('punch');h.api.once('today');h.api.once('punch-in');h.api.once('commit');await tick();assert.deepEqual(h.sent,['punch-check']);assert.equal(h.watchers.size,1);
 h.finish('punch');await tick();assert.deepEqual(h.sent,['punch-check','journal-check']);h.finish('journal');await tick();assert.equal(h.watchers.size,0);h.api.once('punch');await tick();assert.equal(h.sent.length,2);
});
test('current manual request is reused, queued offscreen reads are skipped and can load on later activation',async()=>{
 const h=harness();h.n('punch-status').setAttribute('aria-busy','true');let visible=true;h.api.once('punch');h.api.once('daily',()=>visible);visible=false;h.finish('punch');await tick();assert.equal(h.sent.length,0);visible=true;h.api.once('daily',()=>visible);await tick();assert.deepEqual(h.sent,['daily-summary-check']);
});
test('role denial and disabled controls prevent reads; invalidation refreshes once after a confirmed save',async()=>{
 const h=harness();h.api.once('labor',()=>false);h.n('pending-load').disabled=true;h.api.once('pending');await tick();assert.equal(h.sent.length,0);h.n('pending-load').disabled=false;h.api.once('pending');await tick();assert.deepEqual(h.sent,['pending-load']);h.finish('pending');await tick();h.api.again('pending');h.api.again('pending');await tick();assert.equal(h.sent.length,2);
});
test('existing timeout ends the wait without automatic retry; departure disconnects the observer and cancels the queue',async()=>{
 const h=harness();h.api.once('punch');h.api.once('daily');await tick();h.n('punch-status').textContent='応答がありません';h.finish('punch');await tick();assert.deepEqual(h.sent,['punch-check','daily-summary-check']);h.api.once('monthly');h.events.pagehide();h.finish('daily-summary');await tick();assert.equal(h.sent.length,2);assert.equal(h.watchers.size,0);h.api.again('punch');await tick();assert.equal(h.sent.length,2);
});
test('bootstrap pages load coordinator before controllers; automatic operations contain no write buttons or storage',()=>{
 for(const file of ['index.html','account-info.html','timecard-records.html','admin-timecard-records.html','admin-day-change.html']){const t=fs.readFileSync(new URL('../workforce/'+file,import.meta.url),'utf8');assert.match(t,/auto-read\.js\?v=[^" ]+/);assert.ok(t.indexOf('src="auto-read.js')<t.indexOf('src="'+(file==='index.html'?'layout.js':file==='account-info.html'?'account-info.js':file==='admin-day-change.html'?'day-change.js':'attendance-journal.js')));}
 const source=fs.readFileSync(new URL('../workforce/auto-read.js',import.meta.url),'utf8');assert.doesNotMatch(source,/setInterval|setTimeout|localStorage|sessionStorage|fetch\(|bridgeRecord|change-commit|punch-retry|staff-issue|maintenance-stop/);
});
