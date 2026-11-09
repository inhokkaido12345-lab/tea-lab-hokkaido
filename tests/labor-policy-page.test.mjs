import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../workforce/labor-policy-page.js',import.meta.url),'utf8');
async function harness({loggedIn=true,fail=false,hold=false}={}){
 const nodes=new Map(),events={},states=[],reads=[],logins=[];let report,starts=0,release;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',addEventListener(t,f){this[t]=f;}});return nodes.get(id);};
 const window={location:{origin:'https://example.test',pathname:'/workforce/labor-policy.html'},addEventListener(t,f){events[t]=f;},
  liff:{async init(){if(hold)await new Promise(r=>release=r);if(fail)throw Error('unavailable');},isLoggedIn:()=>loggedIn,login:o=>logins.push(o)},
  TlhCurrentWorkplace:{config:{endpoint:'https://gas.example/exec'}},
  TlhAutoRead:{init:()=>({once:(key,permitted)=>{if(permitted())reads.push(key);}})},
  TlhLaborPolicy:{init:()=>({setAllowed:value=>states.push(value)})},
  TlhAdminAccess:{init:options=>{report=options.onState;report(false);return {start(){starts++;}};}}};
 vm.runInNewContext(source,{window,document:{getElementById:node}});await new Promise(r=>setImmediate(r));
 return {node,events,states,reads,logins,report,get starts(){return starts;},release:async()=>{release();await new Promise(r=>setImmediate(r));}};
}
test('dedicated page reads only after verified admin permission; revocation and departure stop reads',async()=>{
 const h=await harness();assert.equal(h.starts,1);assert.equal(h.reads.length,0);h.report(false);assert.equal(h.reads.length,0);
 h.report(true);assert.deepEqual(h.reads,['labor']);assert.equal(h.states.at(-1),true);h.report(false);assert.equal(h.states.at(-1),false);
 h.events.pagehide();h.report(true);assert.equal(h.states.at(-1),false);assert.equal(h.reads.length,1);
});
test('logged-out page offers deliberate canonical login and performs no read',async()=>{
 const h=await harness({loggedIn:false});assert.equal(h.starts,0);assert.equal(h.node('labor-login').hidden,false);assert.equal(h.reads.length,0);
 h.node('labor-login').click();assert.equal(h.logins[0].redirectUri,'https://example.test/workforce/labor-policy.html');h.events.pagehide();h.node('labor-login').click();assert.equal(h.logins.length,1);
});
test('SDK failure and departure during initialization never start admin checks or labor reads',async()=>{
 const failed=await harness({fail:true});assert.equal(failed.starts,0);assert.equal(failed.reads.length,0);assert.match(failed.node('admin-access-status').textContent,/準備できません/);
 const left=await harness({hold:true});left.events.pagehide();await left.release();assert.equal(left.starts,0);assert.equal(left.reads.length,0);
});
