/** 店舗一覧→目印/切替/文脈付き通信。実GAS・実token・Storage・実打刻は使わない。 */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto,createHmac} from 'node:crypto';
const code=fs.readFileSync(new URL('../workforce/tenant-session.js',import.meta.url),'utf8');
const scopes=[{organizationId:'orgA',organizationName:'Synthetic A',workplaceId:'siteA',workplaceName:'Synthetic A Store',bindingId:'bindingA',canAdmin:true,canEmployee:true},
  {organizationId:'orgB',organizationName:'Synthetic B',workplaceId:'siteB',workplaceName:'Synthetic B Store',bindingId:'bindingB',canAdmin:false,canEmployee:true}];
function harness(search=''){
  const nodes={},handlers={},sent=[],navigations=[],timers=new Map(),links=[];let seq=0;
  function node(tag='div'){return {tag,children:[],value:'',textContent:'',disabled:false,contentWindow:{},events:{},attributes:{},
    addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];this.value='';},remove(){},
    submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
  for(const id of ['banner','name','company','status','select','switch','frame'])nodes[id]=node();
  const location={origin:'https://tealabhokkaido.com',pathname:'/workforce/',search,href:'https://tealabhokkaido.com/workforce/'+search,assign:url=>navigations.push(url)};
  const c={crypto:webcrypto,Uint8Array,TextEncoder,URL,location,document:{title:'TLH',getElementById:id=>nodes[id.replace('workplace-','')],getElementsByName:()=>[nodes.frame],createElement:node,body:{appendChild(){}},querySelectorAll:()=>links},
    addEventListener(k,fn){(handlers[k]||=[]).push(fn);},setTimeout(fn){const i=++seq;timers.set(i,fn);return i;},clearTimeout:i=>timers.delete(i),
    console:{log(){throw Error('NO_LOG');}},fetch(){throw Error('NO_FETCH');},localStorage:new Proxy({},{get(){throw Error('NO_STORAGE');}})};
  c.window=c;c.top=c;vm.runInNewContext(code,c);
  async function deliver(data,origin='null',source=nodes.frame.contentWindow){const event={data,origin,source};for(const fn of handlers.message||[])await fn(event);return event;}
  async function catalog(mode='CONFIGURED',workplaces=scopes,extra={}){const r=sent.find(r=>r.action==='bridgeGetCompanyContext'),d={type:'TLH_BRIDGE_COMPANY_CONTEXT',action:r.action,nonce:r.nonce,code:mode==='LEGACY'?'COMPANY_CONTEXT_LEGACY':'COMPANY_CONTEXT_READY',context:JSON.stringify({version:2,mode,workplaces,...extra})};
    d.mac=createHmac('sha256',r.responseKey).update([d.type,d.nonce,d.action,d.code,d.context].join('\n')).digest('hex');await deliver(d);return d;}
  function form(action='bridgeGetWorkState',fields={}){const f=node('form');f.target='tlhTestFrame';for(const [name,value]of Object.entries({action,nonce:'c'.repeat(32),responseKey:'d'.repeat(64),idToken:'fake.jwt.proof',...fields})){const n=node('input');n.name=name;n.value=value;f.appendChild(n);}return f;}
  function response(r,scope=scopes[0],code='WORK_STATE_OFF'){const d={type:'TLH_BRIDGE_WORK_STATE',action:r.action,nonce:r.nonce,code,mac:'e'.repeat(64),organizationId:scope.organizationId,workplaceId:scope.workplaceId,bindingId:scope.bindingId};
    d.tenantMac=createHmac('sha256',r.responseKey).update(JSON.stringify(['TLH_TENANT_REPLY_V1',d.organizationId,d.workplaceId,d.bindingId,d.mac])).digest('hex');return d;}
  return{c,nodes,sent,navigations,timers,links,node,form,response,deliver,catalog,api:c.TlhTenantSession,ready:()=>c.TlhTenantSession.ready({getIDToken:()=> 'fake.jwt.proof'}),
    async scoped(){const ready=this.ready();await catalog();return ready;},depart(){for(const fn of handlers.pagehide||[])fn();}};
}
test('legacy environment is explicit, keeps old forms, and invents no active store name',async()=>{
  const h=harness(),ready=h.ready();await h.catalog('LEGACY',[]);assert.equal(await ready,true);
  assert.equal(h.nodes.name.textContent,'店舗情報の設定前');assert.equal(h.nodes.switch.disabled,true);assert.equal(h.api.displayScope(),null);
  h.api.submit(h.form());assert.equal(h.sent[1].organizationId,undefined);assert.equal(h.sent[0].idToken,'fake.jwt.proof');
});
test('multiple memberships require choosing a store, and navigation contains only its non-secret IDs',async()=>{
  const h=harness();assert.equal(await h.scoped(),false);assert.equal(h.nodes.name.textContent,'店舗を選んでください');
  h.nodes.select.value='siteB';h.nodes.select.events.change();assert.equal(h.nodes.switch.disabled,false);h.nodes.switch.events.click();
  assert.deepEqual(h.navigations,['https://tealabhokkaido.com/workforce/?organizationId=orgB&workplaceId=siteB']);
  assert.throws(()=>h.api.submit(h.form()),/WORKPLACE_NOT_READY/);
});
test('signed current store names and company are visible; a manipulated unauthorized URL does not become active',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA');assert.equal(await h.scoped(),true);
  assert.equal(h.nodes.name.textContent,'Synthetic A Store');assert.equal(h.nodes.company.textContent,'Synthetic A');assert.match(h.c.document.title,/Synthetic A Store/);
  const denied=harness('?organizationId=orgC&workplaceId=siteC');assert.equal(await denied.scoped(),false);assert.equal(denied.api.displayScope(),null);assert.throws(()=>denied.api.submit(denied.form()),/WORKPLACE_NOT_READY/);
});
test('forms carry company/store and stale other-company responses are rejected despite a correctly signed other context',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA');await h.scoped();h.api.submit(h.form());const r=h.sent.at(-1);
  assert.equal(r.organizationId,'orgA');assert.equal(r.workplaceId,'siteA');
  assert.equal(await h.api.acceptEvent({data:h.response(r,scopes[1]),origin:'null',source:h.nodes.frame.contentWindow}),false);
  assert.equal(await h.api.acceptEvent({data:h.response(r),origin:'https://evil.example'}),false);
  assert.equal(await h.api.acceptEvent({data:h.response(r),origin:'null',source:h.nodes.frame.contentWindow}),true);
});
test('store switch stays disabled during write or uncertain result; confirmed response releases it',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA');await h.scoped();h.api.submit(h.form('bridgeRecordPunch',{eventType:'CLOCK_IN'}));const r=h.sent.at(-1);
  h.nodes.select.value='siteB';h.nodes.select.events.change();assert.equal(h.nodes.switch.disabled,true);h.nodes.switch.events.click();assert.equal(h.navigations.length,0);
  for(const fn of [...h.timers.values()])fn();assert.match(h.nodes.status.textContent,/保存結果/);assert.equal(h.nodes.switch.disabled,true);
  assert.equal(await h.api.acceptEvent({data:h.response(r,scopes[0],'PUNCH_CLOCK_IN_DONE'),origin:'null',source:h.nodes.frame.contentWindow}),true);assert.equal(h.nodes.switch.disabled,false);
});
test('forged bootstrap/frame cannot establish store context; a real signed bootstrap still works',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA'),ready=h.ready(),r=h.sent[0];
  const d={type:'TLH_BRIDGE_COMPANY_CONTEXT',action:r.action,nonce:r.nonce,code:'COMPANY_CONTEXT_READY',context:JSON.stringify({version:2,mode:'CONFIGURED',workplaces:scopes}),mac:'0'.repeat(64)};
  await h.deliver(d);assert.equal(h.api.displayScope(),null);await h.catalog();assert.equal(await ready,true);
});
test('internal navigation/login retain only the chosen store context; tokens/hash and sandbox/external links are excluded',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA&idToken=secret#private');
  for(const href of ['admin-timecard-records.html','sandbox/','https://example.com/']){const a=h.node('a');a.attributes.href=href;h.links.push(a);}
  await h.scoped();assert.match(h.links[0].attributes.href,/organizationId=orgA/);assert.equal(h.links[1].attributes.href,'sandbox/');assert.equal(h.links[2].attributes.href,'https://example.com/');
  assert.equal(h.api.loginRedirectUri(),'https://tealabhokkaido.com/workforce/?organizationId=orgA&workplaceId=siteA');
});
test('departure clears the active store and rejects late business responses and new submissions',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA');await h.scoped();h.api.submit(h.form());const r=h.sent.at(-1);h.depart();
  assert.equal(h.api.displayScope(),null);assert.equal(h.nodes.company.textContent,'');assert.equal(await h.api.acceptEvent({data:h.response(r),origin:'null',source:h.nodes.frame.contentWindow}),false);
  assert.throws(()=>h.api.submit(h.form()),/WORKPLACE_NOT_READY/);assert.equal(h.timers.size,0);
});
test('DTO rejects duplicate stores, extra secret fields and unsupported authority shapes',()=>{
  const h=harness();assert.equal(h.api.parse(JSON.stringify({version:2,mode:'CONFIGURED',workplaces:[scopes[0],scopes[0]]})),null);
  assert.equal(h.api.parse(JSON.stringify({version:2,mode:'CONFIGURED',workplaces:[{...scopes[0],spreadsheetId:'private'}]})),null);
  assert.equal(h.api.parse(JSON.stringify({version:2,mode:'LEGACY',workplaces:scopes})),null);
});

test('invitation target permits only explicit claim and never becomes membership from a successful response',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA'),ready=h.ready();
  assert.equal(h.sent[0].organizationId,'orgA');assert.equal(h.sent[0].workplaceId,'siteA');
  await h.catalog('CONFIGURED',[],{invitationTarget:{...scopes[0],canAdmin:false,canEmployee:false}});assert.equal(await ready,true);
  assert.equal(h.api.invitationOnly(),true);assert.equal(h.api.displayScope(),null);assert.match(h.nodes.name.textContent,/招待先/);
  assert.throws(()=>h.api.submit(h.form('bridgeRecordPunch')),/WORKPLACE_INVITATION_ONLY/);
  assert.throws(()=>h.api.submit(h.form('bridgeGetAdminOverview')),/WORKPLACE_INVITATION_ONLY/);
  h.api.submit(h.form('bridgeClaimStaffInvitation',{inviteToken:'9'.repeat(64)}));assert.equal(h.sent.at(-1).organizationId,'orgA');
  const r=h.sent.at(-1);assert.equal(await h.api.acceptEvent({data:h.response(r,scopes[0],'STAFF_REGISTERED'),origin:'null',source:h.nodes.frame.contentWindow}),true);
  h.api.enrollmentCompleted();assert.equal(h.api.invitationOnly(),true);assert.equal(h.api.displayScope(),null);
});

test('invitation context cannot claim administrator authority or duplicate a real membership',()=>{
  const h=harness();for(const invitationTarget of [scopes[0],null,{...scopes[1],canAdmin:false,canEmployee:false}]){
    assert.equal(h.api.parse(JSON.stringify({version:2,mode:'CONFIGURED',workplaces:scopes,invitationTarget})),null);
  }
});

test('valid tenant MAC from another frame is refused; same operation retry releases the original uncertainty',async()=>{
  const h=harness('?organizationId=orgA&workplaceId=siteA');await h.scoped();
  h.api.submit(h.form('bridgeRecordPunch',{eventId:'evt_fixed'}));const r=h.sent.at(-1);
  assert.equal(await h.api.acceptEvent({data:h.response(r),origin:'null',source:{}}),false);
  for(const fn of [...h.timers.values()])fn();
  h.api.submit(h.form('bridgeRecordPunch',{eventId:'evt_fixed',nonce:'f'.repeat(32)}));const retry=h.sent.at(-1);
  assert.equal(await h.api.acceptEvent({data:h.response(retry,scopes[0],'PUNCH_CLOCK_IN_DONE'),origin:'null',source:h.nodes.frame.contentWindow}),true);
  h.nodes.select.value='siteB';h.nodes.select.events.change();assert.equal(h.nodes.switch.disabled,false);
});
