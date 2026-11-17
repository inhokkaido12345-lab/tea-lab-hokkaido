/** Cross-repo synthetic chain, not real employee/browser acceptance.
 * Core official-LINE/Sheets ports are fake; actual registration, membership, grant,
 * Inventory signed GAS and browser transport are used in one actor chain.
 * No new receive grant is assigned. Ordering is a separately authorized actor.
 * Run with TLH_PLATFORM_SOURCE_DIR and TLH_INVENTORY_SOURCE_DIR pointing to reviewed checkouts.
 * Platform fixture b7397fe1f097acb85ccdee30cd7a68eab4350f0e.
 * Inventory candidate PR57 330748f6. Private dependencies are not vendored or fetched by site CI.
 */
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import path from 'node:path';
import {harness as accountUi} from '../tests/common-account.test.mjs';
import {uiHarness} from '../tests/helpers/common-affiliation-ui-harness.mjs';
import {grantUi} from '../tests/helpers/common-grants-ui-harness.mjs';
import {accessHarness} from '../tests/helpers/account-access-overview-harness.mjs';
import {pickerUi} from '../tests/management-picker.test.mjs';
const platform=process.env.TLH_PLATFORM_SOURCE_DIR||new URL('../../platform/',import.meta.url).pathname;
const inventory=process.env.TLH_INVENTORY_SOURCE_DIR||new URL('../../inventory-scope-receipt-policy/',import.meta.url).pathname;
const load=(root,file)=>import(pathToFileURL(path.join(root,file)));
const {commonAffiliationFixture}=await load(platform,'tests/helpers/common-affiliation-harness.mjs');
const {inventoryBridgeFixture}=await load(inventory,'tests/employee-bridge.test.mjs');
const {inventoryTransportFixture}=await load(inventory,'tests/employee-transport.test.mjs');
function form(core,p){const e={parameter:p,parameters:Object.fromEntries(Object.entries(p).map(([k,v])=>[k,[v]])),postData:{type:'application/x-www-form-urlencoded',contents:new URLSearchParams(p).toString()}};return JSON.parse(core.context.doPost(e).html.match(/postMessage\((.*),\s*"https:/s)[1]);}
test('real Core onboarding -> read-only COMMON -> scoped receiving/full completion/LINK/STATUS -> revocation',async()=>{
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
 const admin=grantUi(()=>overview.api.refresh());admin.n('account').value=picker.n('account').value;admin.n('org').value='orgA';admin.n('store').value='storeA';admin.n('reason').value='架空初回配属';for(const p of ['read'])admin.n(p).checked=true;admin.act('form','submit');await admin.deliver(form(core,admin.sent.at(-1)));assert.equal(admin.n('preview').hidden,false);admin.act('commit');const granted=form(core,admin.sent.at(-1));assert.equal(granted.code,'COMMON_GRANTS_SAVED');await admin.deliver(granted);const grantedOverview=form(core,overview.sent.at(-1));await overview.deliver(grantedOverview);assert.deepEqual(JSON.parse(grantedOverview.data).organizations[0].stores[0].services.find(x=>x.serviceId==='INVENTORY').permissions,['inventory.read']);
 assert.deepEqual(core.send(core.request({idToken:proof})).result.permissions,['inventory.read']);

 // Separate ordering actor uses a real signed grant update. The newcomer remains read-only.
 const ordering=grantUi();ordering.n('account').value='usr_admin';ordering.n('org').value='orgA';ordering.n('store').value='storeA';ordering.n('reason').value='架空発注担当';for(const p of ['read','order'])ordering.n(p).checked=true;ordering.act('form','submit');await ordering.deliver(form(core,ordering.sent.at(-1)));ordering.act('commit');assert.equal(form(core,ordering.sent.at(-1)).code,'COMMON_GRANTS_SAVED');
 gas.properties.INVENTORY_RECEIVING_POLICY_V1=JSON.stringify({version:1,bindings:[{serviceInstanceId:'inventory_primary',organizationId:'orgA',storeId:'storeA',localStoreId:'demo-shop'}]});
 const call=(command,input,token=proof)=>gas.send({idToken:token,command,input:JSON.stringify(input)});
 const view=()=>JSON.parse(call('READ',{storeId:'demo-shop'}).data);
 const who=core.context.doPost({parameter:{},parameters:{},postData:{type:'application/json',contents:JSON.stringify({action:'whoAmI',idToken:proof})}});
 assert.equal(who.result.employee,null);assert.equal(who.result.tlhUserId,accountId);
 assert.equal((await request('ACCOUNT',{includeView:true})).value.actorAccountId,accountId);
 const initial=view(),item=initial.items.find(i=>i.id==='demo-tapioca'),unit=item.units[0];assert.deepEqual(initial.permissions,['inventory.read']);assert.equal(initial.receivingEnabled,true);
 const line={itemId:item.id,unitId:unit.id,quantity:2,conversionVersion:unit.version};
 const order=n=>{const op='core-order-'+n;assert.equal(call('COMMAND',{type:'MARK_ORDERED',storeId:'demo-shop',operationId:op,itemId:item.id,line,confirmNotLow:true},'admin.jwt.proof').code,'OK');return {op,c:view().items.find(i=>i.id===item.id).orders.find(c=>c.orderOperationId===op)};};
 const first=order(1);assert.ok(first.c);
 const receive={type:'RECEIVE',storeId:'demo-shop',operationId:'core-newcomer-receive',receivedOn:new Date(Date.parse(initial.asOf)+9*3600000).toISOString().slice(0,10),lines:[line],completeCaseId:first.c.id,orderOperationId:first.op,confirmAssociation:true};
 const n=gas.rows().length;assert.equal((await request('COMMAND',receive)).ok,true);
 assert.equal(view().items.find(i=>i.id===item.id).quantity,item.quantity+2*unit.baseQuantity);assert.equal(view().items.find(i=>i.id===item.id).orders.length,0);
 assert.equal(call('COMMAND',receive).code,'OK');assert.equal(gas.rows().length,n+1);
 const receipt={version:1,operationId:receive.operationId,storeId:'demo-shop',expectedActorId:accountId};assert.equal(JSON.parse(call('STATUS',receipt).data).status,'SAVED');
 const second=order(2),unlinked={...receive,operationId:'core-newcomer-unlinked',completeCaseId:null};delete unlinked.orderOperationId;delete unlinked.confirmAssociation;
 // Simulate a dropped save response: do not deliver it to the browser or resend COMMIT.
 const beforeLost=gas.rows().length;assert.equal(call('COMMAND',unlinked).code,'OK');assert.equal(gas.rows().length,beforeLost+1);const recovered=await request('STATUS',{...receipt,operationId:unlinked.operationId});assert.equal(recovered.ok,true);assert.equal(recovered.value.status,'SAVED');assert.equal(gas.rows().length,beforeLost+1);const beforeLink=view().items.find(i=>i.id===item.id).quantity;
 const link={type:'LINK_RECEIPT_TO_ORDER',storeId:'demo-shop',operationId:'core-newcomer-link',caseId:second.c.id,orderOperationId:second.op,receiptOperationId:unlinked.operationId,confirmAssociation:true};
 assert.equal((await request('COMMAND',link)).ok,true);assert.equal(view().items.find(i=>i.id===item.id).quantity,beforeLink);assert.equal(view().items.find(i=>i.id===item.id).orders.length,0);assert.equal(JSON.parse(call('STATUS',{...receipt,operationId:link.operationId}).data).status,'SAVED');
 const stable=JSON.stringify(gas.rows());for(const input of [{type:'MARK_ORDERED',itemId:item.id,line,confirmNotLow:true},{type:'COUNT_STOCK',itemId:item.id,quantity:1},{type:'SET_FORECAST',itemId:item.id,safetyDays:1},{type:'START_SAMPLE',itemId:item.id,unitId:unit.id,conversionVersion:unit.version},{type:'SYNC_CATALOG'}])assert.equal(call('COMMAND',{...input,storeId:'demo-shop',operationId:'denied-'+input.type}).code,'FORBIDDEN');
 assert.notEqual(call('COMMAND',{...receive,storeId:'foreign'}).code,'OK');assert.equal(JSON.stringify(gas.rows()),stable);
 assert.deepEqual(core.send(core.request({idToken:proof})).result.permissions,['inventory.read']);
 const policy=gas.properties.INVENTORY_RECEIVING_POLICY_V1;delete gas.properties.INVENTORY_RECEIVING_POLICY_V1;assert.equal(call('COMMAND',receive).code,'FORBIDDEN');assert.equal(call('STATUS',receipt).code,'FORBIDDEN');gas.properties.INVENTORY_RECEIVING_POLICY_V1=policy;
 const grantState=core.context.affRead_(core.affiliationBooks.CommonAffiliationJournal).data;const readGrant=grantState.serviceGrants.find(x=>x.accountId===accountId&&x.permission==='inventory.read');assert.ok(readGrant);readGrant.status='INACTIVE';core.save(grantState);assert.notEqual(call('COMMAND',receive).code,'OK');assert.notEqual(call('STATUS',receipt).code,'OK');assert.equal(JSON.stringify(gas.rows()),stable);readGrant.status='ACTIVE';core.save(grantState);assert.equal(call('READ',{storeId:'demo-shop'}).code,'OK');
 const state=core.context.affRead_(core.affiliationBooks.CommonAffiliationJournal).data;state.storeMemberships.find(x=>x.accountId===accountId).status='INACTIVE';core.save(state);
 assert.equal(call('READ',{storeId:'demo-shop'}).code,'COMMON_MEMBERSHIP_REQUIRED');assert.notEqual(call('COMMAND',receive).code,'OK');assert.notEqual(call('STATUS',receipt).code,'OK');assert.equal(JSON.stringify(gas.rows()),stable);
 assert.equal(JSON.stringify(core.tables.EmployeeProfiles.rows),employees);assert.equal(workforceSnapshot(),workforceBefore);assert.equal(JSON.stringify(core.books),operationsBefore);assert.deepEqual(core.context.resolveTlhAccountByLineUserId_('line-admin'),existingBefore);
});
