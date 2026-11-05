/** 店舗の権限設定UI。偽DOM/偽LIFF、実HMACで確認/同意/再送/退場を検査する。 */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
const code=fs.readFileSync(new URL('../workforce/workplace-roles.js',import.meta.url),'utf8');
export function workplaceRolesHarness(){
  const nodes={},handlers={},sent=[],timers=new Map(),confirmations=[];let seq=0,confirm=true;
  for(const k of ['fields','employee','kind','enabled','reason','preview','commit','cancel','status','summary','frame'])nodes[k]={value:'',disabled:false,hidden:false,textContent:'',contentWindow:{},events:{},addEventListener(k,fn){this.events[k]=fn;}};
  nodes.employee.value='T002';nodes.kind.value='ADMIN';nodes.enabled.value='true';nodes.reason.value='Synthetic delegation';
  const c={crypto:webcrypto,Uint8Array,TextEncoder,confirm:text=>{confirmations.push(text);return confirm;},setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener(k,fn){(handlers[k]||=[]).push(fn);},
    document:{getElementById:id=>nodes[id.replace('role-','')],createElement:()=>({children:[],appendChild(n){this.children.push(n);},remove(){},submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}}),body:{appendChild(){}}}};
  c.window=c;c.top=c;vm.runInNewContext(code,c);const ui=c.TlhWorkplaceRoles.init({gasUrl:'https://example.invalid/',liff:{getIDToken:()=> 'fake.jwt.proof'}});
  async function reply(code='WORKPLACE_ROLE_READY',changes={}){const r=sent.at(-1),d={type:'TLH_BRIDGE_WORKPLACE_ROLE',action:r.action,nonce:r.nonce,command:r.command,operationId:r.operationId,code,revision:code==='WORKPLACE_ROLE_READY'?'a'.repeat(64):'',summary:code==='WORKPLACE_ROLE_READY'?JSON.stringify({version:1,employeeCode:r.employeeCode,employeeName:'Synthetic colleague',role:r.role,enabled:r.enabled==='true',organizationName:'Synthetic Company',workplaceName:'Synthetic Store'}):'',...changes};
    d.mac=createHmac('sha256',r.responseKey).update([d.type,d.nonce,d.action,d.command,d.operationId,d.code,d.revision,d.summary].join('\n')).digest('hex');
    for(const fn of handlers.message||[])await fn({data:d,origin:'null',source:nodes.frame.contentWindow});return d;}
  return{c,ui,nodes,sent,timers,confirmations,reply,click:k=>nodes[k].events.click(),confirm:v=>{confirm=v;},depart:()=>{for(const fn of handlers.pagehide||[])fn();}};
}
test('non-admin cannot send; preview changes no authority and saving requires explicit target/store confirmation',async()=>{
  const h=workplaceRolesHarness();h.click('preview');assert.equal(h.sent.length,0);h.ui.setAllowed(true);h.click('preview');h.click('preview');assert.equal(h.sent.length,1);
  await h.reply();assert.match(h.nodes.summary.textContent,/Synthetic Store/);assert.equal(h.nodes.commit.hidden,false);
  h.confirm(false);h.click('commit');assert.equal(h.sent.length,1);h.confirm(true);h.click('commit');assert.equal(h.sent.length,2);
  assert.match(h.confirmations.at(-1),/T002（Synthetic colleague）/);await h.reply('WORKPLACE_ROLE_APPLIED');assert.equal(h.nodes.commit.hidden,true);assert.equal(h.nodes.reason.value,'');
});
test('timeout retry uses the same immutable operation and input with a fresh response envelope',async()=>{
  const h=workplaceRolesHarness();h.ui.setAllowed(true);h.click('preview');await h.reply();h.click('commit');const r=h.sent.at(-1);
  for(const fn of [...h.timers.values()])fn();h.nodes.employee.value='OTHER';h.nodes.enabled.value='false';h.click('commit');const retry=h.sent.at(-1);
  assert.equal(retry.operationId,r.operationId);assert.equal(retry.employeeCode,'T002');assert.equal(retry.enabled,'true');assert.notEqual(retry.nonce,r.nonce);
  await h.reply('WORKPLACE_ROLE_ALREADY_APPLIED');assert.equal(h.nodes.commit.hidden,true);
});
test('mismatched target summary, stale operation and last-admin refusal never open a save action',async()=>{
  const h=workplaceRolesHarness();h.ui.setAllowed(true);h.click('preview');await h.reply('WORKPLACE_ROLE_READY',{summary:JSON.stringify({version:1,employeeCode:'OTHER',employeeName:'Someone',role:'ADMIN',enabled:true,organizationName:'Synthetic Company',workplaceName:'Synthetic Store'})});
  assert.equal(h.nodes.commit.hidden,true);
  for(const fn of [...h.timers.values()])fn();h.click('preview');await h.reply('WORKPLACE_LAST_ADMIN_PROTECTED');assert.equal(h.nodes.commit.hidden,true);assert.match(h.nodes.status.textContent,/最後の管理者/);
});
test('departure clears reason and verified target; a late reply or click cannot restore saving',async()=>{
  const h=workplaceRolesHarness();h.ui.setAllowed(true);h.click('preview');await h.reply();h.depart();
  assert.equal(h.nodes.summary.textContent,'');assert.equal(h.nodes.reason.value,'');h.click('commit');assert.equal(h.sent.length,1);await h.reply();assert.equal(h.nodes.commit.disabled,true);
});
