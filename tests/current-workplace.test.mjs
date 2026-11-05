import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {currentWorkplaceHarness}from './helpers/current-workplace-harness.mjs';
test('store/company display is visible without login, network, timers or personal-data storage',()=>{
 const h=currentWorkplaceHarness();assert.deepEqual(h.banner.children.map(n=>n.textContent),[h.api.config.workplaceName,h.api.config.organizationName]);assert.equal(h.sent.length,0);
 const js=fs.readFileSync(new URL('../workforce/current-workplace.js',import.meta.url),'utf8');assert.doesNotMatch(js,/localStorage|sessionStorage|fetch\(|setTimeout\(|console\./);
});
test('submit adds only the fixed two identifiers and preserves identity, operation, nonce and response key exactly',()=>{
 const h=currentWorkplaceHarness(),fields={action:'bridgeRecordPunch',eventId:'evt_fixture',idToken:'fake.jwt.proof',nonce:'a'.repeat(32),responseKey:'b'.repeat(64)},form=h.form(fields);h.api.submit(form);
 assert.deepEqual(h.sent[0],{...fields,organizationId:h.api.config.organizationId,workplaceId:h.api.config.workplaceId});assert.equal(h.sent.length,1);assert.throws(()=>h.api.submit(form),/DUPLICATE/);assert.equal(h.sent.length,1);
});
test('a real form named action input can shadow form.action without replacing the destination attribute',()=>{
 const h=currentWorkplaceHarness(),form=h.form({action:'bridgeGetPunchReadiness',idToken:'fake.jwt.proof'});
 Object.defineProperty(form,'action',{value:form.children[0],configurable:true});
 h.api.submit(form);assert.equal(h.sent.length,1);assert.equal(h.sent[0].action,'bridgeGetPunchReadiness');
});
test('another store URL, partial or repeated scope cannot submit and shows a concrete warning',()=>{
 for(const query of ['?organizationId=other&workplaceId=other','?organizationId=other','?workplaceId=other','?organizationId=other&organizationId=other&workplaceId=other']){const h=currentWorkplaceHarness({href:'https://tealabhokkaido.com/workforce/'+query});assert.equal(h.banner.attrs.role,'alert');assert.match(h.banner.children.at(-1).textContent,/店舗情報が一致しません/);assert.throws(()=>h.api.submit(h.form()),/INVALID/);assert.equal(h.sent.length,0);}
});
test('matching explicit URL is accepted, but foreign endpoints, embedding, duplicate fields and departure are refused',()=>{
 const base=currentWorkplaceHarness(),c=base.api.config,h=currentWorkplaceHarness({href:'https://tealabhokkaido.com/workforce/?organizationId='+c.organizationId+'&workplaceId='+c.workplaceId});h.api.submit(h.form());assert.equal(h.sent.length,1);
 const foreign=h.form();foreign.action='https://evil.invalid/';assert.throws(()=>h.api.submit(foreign),/INVALID/);assert.throws(()=>h.api.submit(h.form({organizationId:c.organizationId})),/DUPLICATE/);h.leave();assert.throws(()=>h.api.submit(h.form()),/INVALID/);
 const framed=currentWorkplaceHarness({embedded:true});assert.throws(()=>framed.api.submit(framed.form()),/INVALID/);
});
// operations.jsは別の運営台帳・専用認可。勤怠の固定店舗scopeを付ける対象ではない。
test('all ten business entry pages carry the same mark and load the scope helper before their controllers',()=>{
 const pages=['index','account-info','staff-code-change','recovery','timecard-records','admin-timecard-records','day-change','admin-day-change','schedule','admin-schedule'];
 for(const page of pages){const html=fs.readFileSync(new URL('../workforce/'+page+'.html',import.meta.url),'utf8');assert.match(html,/data-current-workplace/);assert.match(html,/current-workplace\.js\?v=/);const scripts=[...html.matchAll(/src="([^"?]+\.js)/g)].map(m=>m[1]);const local=scripts.filter(s=>!s.startsWith('https:'));assert.equal(local[0],'current-workplace.js');}
 for(const file of fs.readdirSync(new URL('../workforce/',import.meta.url)).filter(n=>n.endsWith('.js')&&!['current-workplace.js','operations.js'].includes(n))){const js=fs.readFileSync(new URL('../workforce/'+file,import.meta.url),'utf8');if(js.includes('form.submit()'))assert.match(js,/TlhCurrentWorkplace\.submit\(form\)/,file);}
});
test('changed business pages refresh their changed scripts and shared stylesheet together',()=>{
 const assets=new Set(['app.css','account-info.js','account-recovery.js','admin-access.js','admin-overview.js','attendance-journal.js','daily-summary.js','day-change.js','demo-invitation.js','labor-policy.js','monthly-work-summary.js','pending-approvals.js','punch.js','schedule.js','staff-code-change.js','staff-enrollment.js','staff-maintenance.js','work-state.js','current-workplace.js']);
 const versions={'current-workplace.js':'20261105-store2','punch.js':'20261105-login1','attendance-journal.js':'20261105-format1','account-info.js':'20261105-auto1'};
 for(const page of ['index','account-info','staff-code-change','recovery','timecard-records','admin-timecard-records','day-change','admin-day-change','schedule','admin-schedule']){
  const html=fs.readFileSync(new URL('../workforce/'+page+'.html',import.meta.url),'utf8');
  for(const m of html.matchAll(/(?:src|href)="([^"?]+)\?v=([^\"]+)"/g))if(assets.has(m[1]))assert.equal(m[2],versions[m[1]]||'20261105-store1',page+':'+m[1]);
 }
});
