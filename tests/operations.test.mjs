import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {operationsUi,catalog} from './helpers/operations-harness.mjs';
async function prepared(){const h=operationsUi();await h.ready();h.choose('CREATE_ORGANIZATION');h.set({'organization-new':'orgC',name:'架空C社',reason:'検査'});h.click('preview');return h;}
const previewData=r=>({command:r.command,input:JSON.parse(r.input),baseRevision:1,businessAuthorityConnected:false});
test('startup automatically reads only, keeps writes locked until authenticated catalog and shows fixed role names',async()=>{
 const h=operationsUi();assert.equal(h.sent.length,1);assert.equal(h.sent[0].phase,'READ');assert.equal(h.n('fields').disabled,true);h.click('commit');assert.equal(h.sent.length,1);await h.ready();
 assert.equal(h.n('fields').disabled,false);assert.equal(h.api.labels.PLATFORM_OPERATOR,'TLH運営管理者');assert.equal(h.api.labels.ORGANIZATION_OPERATOR,'会社管理者');assert.equal(h.api.labels.STORE_SERVICE_ADMIN,'店舗サービス管理者');
 const company=operationsUi({view:'COMPANY'});await company.ready();assert.deepEqual(company.n('command').children.map(x=>x.value),['CREATE_STORE','UPDATE_STORE','ASSIGN_STORE_SERVICE_ADMIN']);
});
test('bad signature, other frame/origin/nonce and altered catalog do not authorize any controls',async()=>{
 for(const [patch,event]of [[{mac:'0'.repeat(64)},{}],[{nonce:'f'.repeat(32)},{}],[{},{source:{}}],[{},{origin:'https://evil.example'}]]){
 const h=operationsUi();await h.reply(h.sent[0],'OPERATIONS_READY',catalog(),'',patch,event);assert.equal(h.n('fields').disabled,true);}
 const h=operationsUi();const data=catalog();data.businessAuthorityConnected=true;await h.ready(data);assert.equal(h.n('fields').disabled,true);
});
test('preview is bound to command and exact input; success from another phase cannot enable commit',async()=>{
 const h=await prepared(),r=h.sent.at(-1);assert.equal(r.phase,'PREVIEW');h.click('preview');assert.equal(h.sent.length,2);
 await h.reply(r,'OPERATIONS_SAVED',{savedRevision:2});assert.equal(h.n('commit').disabled,true);
 await h.reply(r,'OPERATIONS_PREVIEW_READY',{...previewData(r),input:{...JSON.parse(r.input),name:'改変'}},'a'.repeat(64));assert.equal(h.n('commit').disabled,true);
 await h.reply(r,'OPERATIONS_PREVIEW_READY',previewData(r),'a'.repeat(64));assert.equal(h.n('commit').disabled,false);assert.equal(h.n('fields').disabled,true);
 h.click('commit');h.click('commit');assert.equal(h.sent.length,3);assert.equal(h.sent[2].phase,'COMMIT');
});
test('unknown commit result retains immutable operation and retries explicitly with fresh response credentials',async()=>{
 const h=await prepared(),r=h.sent.at(-1);await h.reply(r,'OPERATIONS_PREVIEW_READY',previewData(r),'a'.repeat(64));h.click('commit');const commit=h.sent.at(-1);h.timeout();
 assert.equal(h.n('fields').disabled,true);assert.equal(h.n('retry').hidden,false);assert.equal(h.sent.length,3);h.click('cancel');assert.equal(h.sent.length,3);h.click('retry');const retry=h.sent.at(-1);
 for(const key of ['command','input','operationId','revision'])assert.equal(retry[key],commit[key]);assert.notEqual(retry.nonce,commit.nonce);assert.notEqual(retry.responseKey,commit.responseKey);
 await h.reply(retry,'OPERATIONS_ALREADY_SAVED',{savedRevision:2});assert.equal(h.sent.at(-1).phase,'READ');assert.equal(h.n('retry').hidden,true);
});
test('server denial leaves no company data, expired login offers explicit return, and departure destroys all forms and drafts',async()=>{
 const h=operationsUi();await h.reply(h.sent[0],'OPERATIONS_AUTH_REQUIRED',{});assert.equal(h.n('login').hidden,false);assert.equal(h.n('fields').disabled,true);h.click('login');assert.equal(h.logins[0],'logout');assert.equal(h.logins[1].redirectUri,'https://tealabhokkaido.com/workforce/platform-operations.html');
 const p=await prepared(),r=p.sent.at(-1);p.depart();await p.reply(r,'OPERATIONS_PREVIEW_READY',previewData(r),'a'.repeat(64));assert.equal(p.n('commit').disabled,true);assert.equal(p.n('account').value,'');assert.equal(p.n('reason').value,'');assert.equal(p.n('result').children.length,0);p.click('preview');assert.equal(p.sent.length,2);
});
test('standalone pages share typography, contain no PWA registration or browser persistence, and start disabled',()=>{
 for(const page of ['platform','company']){const html=fs.readFileSync(new URL('../workforce/'+page+'-operations.html',import.meta.url),'utf8');assert.match(html,/fonts\/ibm-plex-sans-jp.css/);assert.match(html,/<fieldset id="ops-fields" disabled>/);assert.doesNotMatch(html,/rel="manifest"|serviceWorker|localStorage|sessionStorage/);}
 const js=fs.readFileSync(new URL('../workforce/operations.js',import.meta.url),'utf8');assert.doesNotMatch(js,/localStorage\.|sessionStorage\.|console\.|fetch\(/);
});
