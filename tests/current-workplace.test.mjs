import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {currentWorkplaceHarness}from './helpers/current-workplace-harness.mjs';
import {infoHarness} from './helpers/common-affiliation-info-harness.mjs';
import {companyUi} from './helpers/company-employment-ui-harness.mjs';
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
// Operations and these two exact Platform self-read modules have independent server authorization.
// Never append the fixed WorkTime workplace to them. Every other business form retains this guard.
const platformSelfReads=Object.freeze({
 'common-affiliation-info.js':'bridgeCommonAffiliationV1',
 'company-employment-info.js':'bridgeCompanyEmploymentV1',
});
test('all legacy business entry pages carry the fixed mark and load scope helper before their controllers',()=>{
 const pages=['index','account-info','staff-code-change','recovery','timecard-records','admin-timecard-records','day-change','admin-day-change','schedule','admin-schedule','admin-schedule-bulk','labor-policy'];
 for(const page of pages){const html=fs.readFileSync(new URL('../workforce/'+page+'.html',import.meta.url),'utf8');assert.match(html,/data-current-workplace/);assert.match(html,/current-workplace\.js\?v=/);const scripts=[...html.matchAll(/src="([^"?]+\.js)/g)].map(m=>m[1]);const local=scripts.filter(s=>!s.startsWith('https:')&&s!=='/workforce/worktime-url.js');assert.equal(local[0],'current-workplace.js');}
 for(const file of fs.readdirSync(new URL('../workforce/',import.meta.url)).filter(n=>n.endsWith('.js')&&!['current-workplace.js','operations.js',...Object.keys(platformSelfReads)].includes(n))){const js=fs.readFileSync(new URL('../workforce/'+file,import.meta.url),'utf8');if(js.includes('form.submit()'))assert.match(js,/TlhCurrentWorkplace\.submit\(form\)/,file);}
});
test('changed business pages refresh their changed scripts and shared stylesheet together',()=>{
 const assets=new Set(['app.css','account-info.js','account-recovery.js','admin-access.js','admin-overview.js','attendance-journal.js','daily-summary.js','day-change.js','demo-invitation.js','labor-policy.js','monthly-work-summary.js','pending-approvals.js','punch.js','schedule.js','staff-code-change.js','staff-enrollment.js','staff-maintenance.js','work-state.js','current-workplace.js']);
 const versions={'day-change.js':'20261114-latest-day1','pending-approvals.js':'20261114-latest-day1','staff-enrollment.js':'20261110-guidance1','app.css':'20261111-status1','schedule.js':'20261111-off1','current-workplace.js':'20261105-store2','punch.js':'20261121-today1','admin-overview.js':'20261105-timing1','attendance-journal.js':'20261121-today1','admin-access.js':'20261108-batch1','daily-summary.js':'20261121-today1','monthly-work-summary.js':'20261121-today1','account-info.js':'20261105-more1'};
 for(const page of ['index','account-info','staff-code-change','recovery','timecard-records','admin-timecard-records','day-change','admin-day-change','schedule','admin-schedule','admin-schedule-bulk','labor-policy']){
  const html=fs.readFileSync(new URL('../workforce/'+page+'.html',import.meta.url),'utf8');
  for(const m of html.matchAll(/(?:src|href)="([^"?]+)\?v=([^\"]+)"/g))if(assets.has(m[1]))assert.equal(m[2],versions[m[1]]||'20261105-store1',page+':'+m[1]);
 }
});

test('independent Platform self reads have exact allowlisted forms, not the fixed WorkTime workplace',async()=>{
 for(const [file,action] of Object.entries(platformSelfReads)){
  const source=fs.readFileSync(new URL('../workforce/'+file,import.meta.url),'utf8');
  assert.match(source,new RegExp("action:'"+action+"'"),file);
  assert.doesNotMatch(source,/TlhCurrentWorkplace|workplaceId|bridgeRecordPunch|bridgeCreateAccount|bridgeIssueStaffInvitation/,file);
 }
 const self=infoHarness();self.api.load();
 assert.deepEqual(Object.keys(self.sent[0]).sort(),['action','idToken','nonce','phase','responseKey']);
 assert.equal(self.sent[0].action,platformSelfReads['common-affiliation-info.js']);assert.equal(self.sent[0].phase,'READ_SELF');
 const company=companyUi();await company.ready();
 assert.deepEqual(Object.keys(company.sent[0]).sort(),['action','idToken','nonce','organizationId','phase','responseKey']);
 assert.equal(company.sent[0].action,platformSelfReads['company-employment-info.js']);assert.equal(company.sent[0].phase,'READ_COMPANIES');assert.equal(company.sent[0].organizationId,'');
 company.choose('orgB');assert.equal(company.sent[1].phase,'READ_SELF');assert.equal(company.sent[1].organizationId,'orgB');
 assert.equal('workplaceId' in company.sent[1],false);
 const count=company.sent.length;company.choose('not-a-returned-company');assert.equal(company.sent.length,count);
});
