/** Real UI + real GAS chained onboarding. All LINE/Sheets are fake; no network or real people.
 * Run with sibling platform/inventory checkouts or TLH_*_SOURCE_DIR absolute paths.
 * No stage is replaced with a fabricated authorization reply.
 * Reproduction targets (2026-11-17):
 *   tlh-platform 7a41fcbffc40a7ce078becc3b273a6f1a5206e79
 *   tlh-inventory 6e555a08f4b2b195847430b0b88086f4b8f6ce07
 *   this site: use the candidate commit that contains this test.
 * Run: TLH_PLATFORM_SOURCE_DIR=/absolute/platform TLH_INVENTORY_SOURCE_DIR=/absolute/inventory
 *      node --test integration/common-account-onboarding.test.mjs
 * Imported fixture suites also execute. No real browser/employee acceptance is asserted.
 * Coverage: self ID copy, ID-only picker, post-CLAIM/grant refresh, save/readback,
 * revoked company access, other person private space isolation and unchanged workforce tables.
 * This is NOT part of site tests/*.mjs CI: both dependency repositories are private.
 * Do not vendor private source into this public site or invent a cross-repo secret.
 * Standard contents:read on this site's GITHUB_TOKEN cannot checkout those repositories.
 */
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import path from 'node:path';
import {harness as accountUi} from '../tests/common-account.test.mjs';
import {uiHarness} from '../tests/helpers/common-affiliation-ui-harness.mjs';
import {grantUi} from '../tests/helpers/common-grants-ui-harness.mjs';
import {accessHarness} from '../tests/helpers/account-access-overview-harness.mjs';
import {pickerUi} from '../tests/management-picker.test.mjs';
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
 const workforceSnapshot=()=>JSON.stringify(Object.fromEntries(Object.entries(core.tables).filter(([k])=>!['Users','Identities'].includes(k)).map(([k,t])=>[k,t.rows])));
 const workforceBefore=workforceSnapshot(),operationsBefore=JSON.stringify(core.books);
 const existingBefore=core.context.resolveTlhAccountByLineUserId_('line-admin');
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
 assert.notEqual(accountId,'usr_company');assert.notEqual(accountId,'usr_admin');
 const overview=accessHarness();overview.setProof(proof);overview.api.load();const overviewReply=form(core,overview.sent.at(-1));assert.equal(overviewReply.code,'ACCOUNT_ACCESS_OVERVIEW_READY');await overview.deliver(overviewReply);
 const copy=overview.n('result').children.find(n=>n.textContent==='管理者に伝えるアカウント情報をコピー');assert.ok(copy);await copy.events.click();assert.deepEqual(overview.copied,['TLHアカウント：'+accountId]);
 assert.deepEqual(JSON.parse(overviewReply.data).organizations,[]);
 const issuer=uiHarness();await issuer.issue();await issuer.deliver(form(core,issuer.sent.at(-1)));issuer.act('commit');await issuer.deliver(form(core,issuer.sent.at(-1)));const code=issuer.n('common-issued-code').value;assert.match(code,/^[a-f0-9]{64}$/);
 const member=uiHarness({onSuccess:()=>overview.api.refresh()});member.n('common-code').value=code;member.act('claim-form','submit');await member.deliver(form(core,{...member.sent.at(-1),idToken:proof}));member.act('commit');const claimed=form(core,{...member.sent.at(-1),idToken:proof});assert.equal(claimed.code,'COMMON_INVITATION_SAVED');await member.deliver(claimed);await overview.deliver(form(core,overview.sent.at(-1)));assert.equal(overview.n('result').children.some(n=>/アカウント/.test(n.textContent)),true);
 assert.equal(core.send(core.request({idToken:proof})).error.code,'COMMON_SERVICE_PERMISSION_REQUIRED');
 const picker=pickerUi();picker.setProof('company.jwt.proof');picker.act('picker-load');await picker.deliver(form(core,picker.sent.at(-1)));picker.n('org').value='orgA';picker.act('org','change');picker.n('store').value='storeA';picker.act('store','change');const membersReply=form(core,picker.sent.at(-1));await picker.deliver(membersReply);
 const selected=JSON.parse(membersReply.data).members.find(x=>x.accountId===accountId);assert.ok(selected);assert.equal(selected.displayName,'');assert.equal(selected.nameSource,'ACCOUNT_ID_ONLY');assert.deepEqual(selected.permissions,[]);
 const choice=picker.n('member').children.find(x=>x.value===accountId);assert.match(choice.textContent,/表示名なし/);picker.n('member').value=accountId;picker.act('member','change');assert.equal(picker.n('account').value,accountId);
 const noForeign=form(core,{...picker.sent.at(-1),organizationId:'orgB',storeId:'storeA'});assert.notEqual(noForeign.code,'COMMON_MANAGEMENT_PICKER_READY');assert.equal(noForeign.data,'');
 const admin=grantUi(()=>overview.api.refresh());admin.n('account').value=picker.n('account').value;admin.n('org').value='orgA';admin.n('store').value='storeA';admin.n('reason').value='架空初回配属';for(const p of ['read','receive'])admin.n(p).checked=true;admin.act('form','submit');await admin.deliver(form(core,admin.sent.at(-1)));assert.equal(admin.n('preview').hidden,false);admin.act('commit');const granted=form(core,admin.sent.at(-1));assert.equal(granted.code,'COMMON_GRANTS_SAVED');await admin.deliver(granted);const grantedOverview=form(core,overview.sent.at(-1));await overview.deliver(grantedOverview);assert.deepEqual(JSON.parse(grantedOverview.data).organizations[0].stores[0].services.find(x=>x.serviceId==='INVENTORY').permissions,['inventory.read','inventory.receive']);
 assert.deepEqual(core.send(core.request({idToken:proof})).result.permissions,['inventory.read','inventory.receive']);
 const inventoryAccount=await request('ACCOUNT',{includeView:true});assert.equal(inventoryAccount.ok,true);assert.equal(inventoryAccount.value.actorAccountId,accountId);assert.equal((await read()).ok,true);
 const cmd={type:'COUNT_STOCK',storeId:'demo-shop',itemId:'demo-tapioca',operationId:'newcomer-first-count',quantity:123};const saved=await request('COMMAND',cmd);assert.equal(saved.ok,true);
 const readback=gas.send({idToken:proof,command:'READ',input:JSON.stringify({storeId:'demo-shop'})});assert.equal(readback.code,'OK');assert.equal(JSON.parse(readback.data).items.find(i=>i.id==='demo-tapioca').forecast.quantity,123);
 // The same self-created, copied and granted account receives actual goods; no order grant required.
 const beforeReceive=await request('READ',{storeId:'demo-shop'}),item=beforeReceive.value.items.find(i=>i.id==='demo-tapioca'),unit=item.units[0];
 const receive={type:'RECEIVE',storeId:'demo-shop',operationId:'newcomer-first-receive',receivedOn:new Date(Date.now()+9*3600000).toISOString().slice(0,10),completeCaseId:null,lines:[{itemId:item.id,unitId:unit.id,quantity:2,conversionVersion:unit.version}]};
 const received=await request('COMMAND',receive);assert.equal(received.ok,true);
 const afterReceive=await request('READ',{storeId:'demo-shop'});assert.equal(afterReceive.ok,true);assert.equal(afterReceive.value.items.find(i=>i.id===item.id).quantity,item.quantity+2*unit.baseQuantity);assert.ok(afterReceive.value.history.some(e=>e.type==='RECEIVE'));
 const storedReceive=gas.rows().slice(1).map(r=>JSON.parse(r[2])).find(r=>r.result?.operationId===receive.operationId);assert.ok(storedReceive);const fingerprint=JSON.parse(storedReceive.fingerprint);assert.equal(fingerprint.actorId,accountId);assert.equal(fingerprint.request.type,'RECEIVE');assert.equal(fingerprint.request.storeId,'demo-shop');assert.ok(storedReceive.events.some(e=>e.type==='RECEIVE'&&e.actorId===accountId));
 const receivedRows=JSON.stringify(gas.rows());assert.equal((await request('COMMAND',receive)).ok,true);assert.equal(JSON.stringify(gas.rows()),receivedRows);
 const isolatedRows=JSON.stringify(gas.rows());for(const storeId of ['foreign-store','personal_someone_else']){const denied=gas.send({idToken:proof,command:'READ',input:JSON.stringify({storeId})});assert.notEqual(denied.code,'OK');}assert.equal(JSON.stringify(gas.rows()),isolatedRows);
 assert.equal((await request('COMMAND',{type:'MARK_ORDERED',operationId:'newcomer-order',storeId:'demo-shop',caseId:'case-demo-cream'})).code,'FORBIDDEN');
 assert.equal((await request('TENANT',{action:'INVITE',storeId:'demo-shop',operationId:'forbidden-management',code:'f'.repeat(48)})).code,'COMMON_MEMBERSHIP_MANAGEMENT_REQUIRED');
 const personal=gas.send({idToken:'other.jwt.proof',command:'TENANT',input:JSON.stringify({action:'PERSONAL_CREATE',operationId:'other-private'})});assert.equal(personal.code,'OK');const privateId=JSON.parse(personal.data).storeId;assert.equal(gas.send({idToken:proof,command:'READ',input:JSON.stringify({storeId:privateId})}).code,'FORBIDDEN');
 const rows=JSON.stringify(gas.rows()),state=core.context.affRead_(core.affiliationBooks.CommonAffiliationJournal).data;state.storeMemberships.find(x=>x.accountId===accountId).status='INACTIVE';core.save(state);
 assert.equal((await request('COMMAND',cmd)).code,'COMMON_MEMBERSHIP_REQUIRED');assert.equal((await read()).code,'STORE_SELECTION_REQUIRED');assert.equal(gas.send({idToken:proof,command:'READ',input:JSON.stringify({storeId:'demo-shop'})}).code,'COMMON_MEMBERSHIP_REQUIRED');assert.equal(JSON.stringify(gas.rows()),rows);assert.equal(JSON.stringify(core.tables.EmployeeProfiles.rows),employees);assert.equal(gas.send({idToken:'other.jwt.proof',command:'READ',input:JSON.stringify({storeId:privateId})}).code,'OK');assert.equal(workforceSnapshot(),workforceBefore);assert.equal(JSON.stringify(core.books),operationsBefore);assert.deepEqual(core.context.resolveTlhAccountByLineUserId_('line-admin'),existingBefore);
});
