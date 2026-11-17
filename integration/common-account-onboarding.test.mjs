/** Real UI + real GAS chained onboarding. All LINE/Sheets are fake; no network or real people.
 * Run with sibling platform/inventory checkouts or TLH_*_SOURCE_DIR absolute paths.
 * No stage is replaced with a fabricated authorization reply. */
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import path from 'node:path';
import {harness as accountUi} from '../tests/common-account.test.mjs';
import {uiHarness} from '../tests/helpers/common-affiliation-ui-harness.mjs';
import {grantUi} from '../tests/helpers/common-grants-ui-harness.mjs';
const platform=process.env.TLH_PLATFORM_SOURCE_DIR||new URL('../../platform/',import.meta.url).pathname;
const inventory=process.env.TLH_INVENTORY_SOURCE_DIR||new URL('../../inventory/',import.meta.url).pathname;
const load=(root,file)=>import(pathToFileURL(path.join(root,file)));
const {commonAffiliationFixture}=await load(platform,'tests/helpers/common-affiliation-harness.mjs');
const {inventoryBridgeFixture}=await load(inventory,'tests/employee-bridge.test.mjs');
const {inventoryTransportFixture}=await load(inventory,'tests/employee-transport.test.mjs');
const flatten=n=>[n,...(n.children||[]).flatMap(flatten)];
function form(core,p){const e={parameter:p,parameters:Object.fromEntries(Object.entries(p).map(([k,v])=>[k,[v]])),postData:{type:'application/x-www-form-urlencoded',contents:new URLSearchParams(p).toString()}};return JSON.parse(core.context.doPost(e).html.match(/postMessage\((.*),\s*"https:/s)[1]);}
test('one new LINE: inventory -> Account only -> membership invite -> explicit grants -> use -> revoke without fallback',async()=>{
 const core=commonAffiliationFixture();for(const file of ['gas/account/RegistrationService.gs','gas/workforce/BridgeRegistration.gs'])vm.runInNewContext(fs.readFileSync(path.join(platform,file),'utf8'),core.context,{filename:file});core.context.CONFIG_KEYS.TLH_ACCOUNT_SIGNUP_ENABLED='TLH_ACCOUNT_SIGNUP_ENABLED';core.save();core.props.set('TLH_ACCOUNT_SIGNUP_ENABLED','true');
 for(const name of ['Users','Identities'])core.tables[name].appendRow=row=>core.tables[name].rows.push([...row]);
 const proof='newcomer.payload.signature',employees=JSON.stringify(core.tables.EmployeeProfiles.rows);
 const gas=inventoryBridgeFixture({affiliation:JSON.stringify({version:1,serviceInstanceId:'inventory_primary',stores:[{localStoreId:'demo-shop',organizationId:'orgA',storeId:'storeA',authorityMode:'COMMON'}]})});
 gas.context.UrlFetchApp.fetch=(_url,o)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(core.context.doPost({parameter:{},parameters:{},postData:{type:'application/json',contents:o.payload}}))});
 const ui=inventoryTransportFixture(true,true,true);ui.window.TlhInventoryLogin.getToken=()=>proof;let cursor=0;
 async function run(start){let done=false,result,error;const p=Promise.resolve().then(start).then(v=>{done=true;result=v;},e=>{done=true;error=e;});for(let n=0;n<100&&!done;n++){await new Promise(r=>setImmediate(r));while(cursor<ui.forms.length)await ui.listeners.message({source:ui.source,origin:'https://script.google.com',data:gas.send(ui.forms[cursor++])});}assert.equal(done,true);await p;if(error)throw error;return result;}
 const read=()=>run(()=>ui.window.TlhInventory.readView()),request=(c,i)=>run(()=>ui.window.TlhInventory.request(c,i));
 const denied=await read();assert.equal(denied.code,'ACCOUNT_NOT_REGISTERED');
 const element=()=>({children:[],dataset:{},append(...c){this.children.push(...c);},replaceChildren(){this.children=[];}}),elements=new Map();
 const document={getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
 const source=fs.readFileSync(path.join(inventory,'web/app.js'),'utf8'),render=vm.createContext({document});vm.runInContext(source.slice(0,source.indexOf('/** 通信中・読込未完了')),render);render.TlhInventoryStatus.show('在庫を読み込めません。',denied.code);assert.ok(flatten(elements.get('status-detail')).some(n=>n.href==='/account/'));
 const signup=accountUi({proof});await signup.login();signup.create();const created=form(core,signup.sent.at(-1));assert.equal(created.code,'CREATED');signup.reply(created.code);assert.equal(JSON.stringify(core.tables.EmployeeProfiles.rows),employees);
 const idRows=core.tables.Identities.rows,cols=idRows[0],identity=idRows.find(r=>r[cols.indexOf('provider_subject')]==='line-newcomer');assert.ok(identity);const accountId=identity[cols.indexOf('tlh_user_id')];
 const issuer=uiHarness();await issuer.issue();await issuer.deliver(form(core,issuer.sent.at(-1)));issuer.act('commit');await issuer.deliver(form(core,issuer.sent.at(-1)));const code=issuer.n('common-issued-code').value;assert.match(code,/^[a-f0-9]{64}$/);
 const member=uiHarness();member.n('common-code').value=code;member.act('claim-form','submit');await member.deliver(form(core,{...member.sent.at(-1),idToken:proof}));member.act('commit');const claimed=form(core,{...member.sent.at(-1),idToken:proof});assert.equal(claimed.code,'COMMON_INVITATION_SAVED');await member.deliver(claimed);
 assert.equal(core.send(core.request({idToken:proof})).error.code,'COMMON_SERVICE_PERMISSION_REQUIRED');
 const admin=grantUi();admin.n('account').value=accountId;admin.n('org').value='orgA';admin.n('store').value='storeA';admin.n('reason').value='架空初回配属';for(const p of ['read','receive','order'])admin.n(p).checked=true;admin.act('form','submit');await admin.deliver(form(core,admin.sent.at(-1)));assert.equal(admin.n('preview').hidden,false);admin.act('commit');const granted=form(core,admin.sent.at(-1));assert.equal(granted.code,'COMMON_GRANTS_SAVED');await admin.deliver(granted);
 assert.deepEqual(core.send(core.request({idToken:proof})).result.permissions,['inventory.order','inventory.read','inventory.receive']);
 assert.equal((await request('ACCOUNT',{includeView:true})).ok,true);assert.equal((await read()).ok,true);
 const cmd={type:'COUNT_STOCK',storeId:'demo-shop',itemId:'demo-tapioca',operationId:'newcomer-first-count',quantity:123};assert.equal((await request('COMMAND',cmd)).ok,true);
 assert.equal((await request('COMMAND',{type:'MARK_ORDERED',operationId:'newcomer-order',storeId:'demo-shop',caseId:'case-demo-cream'})).ok,true);
 assert.equal((await request('TENANT',{action:'INVITE',storeId:'demo-shop',operationId:'forbidden-management',code:'f'.repeat(48)})).code,'COMMON_MEMBERSHIP_MANAGEMENT_REQUIRED');
 const rows=JSON.stringify(gas.rows()),state=core.context.affRead_(core.affiliationBooks.CommonAffiliationJournal).data;state.storeMemberships.find(x=>x.accountId===accountId).status='INACTIVE';core.save(state);
 assert.equal((await request('COMMAND',cmd)).code,'COMMON_MEMBERSHIP_REQUIRED');assert.equal((await read()).code,'STORE_SELECTION_REQUIRED');assert.equal(gas.send({idToken:proof,command:'READ',input:JSON.stringify({storeId:'demo-shop'})}).code,'COMMON_MEMBERSHIP_REQUIRED');assert.equal(JSON.stringify(gas.rows()),rows);assert.equal(JSON.stringify(core.tables.EmployeeProfiles.rows),employees);
});
