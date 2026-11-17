/** Audit only: execute pinned GAS with in-memory Sheets, never HTTP or deployed GAS.
 * Usage: node qa/performance-audit-20261117/measure.mjs <directory containing the 3 pinned repos>
 * This wraps the read-only probe, NOT the shared production write-lock helper.
 * Counts are fake API invocations, not billable calls or production milliseconds.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'..');
const {commonAffiliationFixture,affiliationData}=await import(pathToFileURL(resolve(root,'tlh-platform/tests/helpers/common-affiliation-harness.mjs')));
function fixture(members,revisions){
 const h=commonAffiliationFixture(),data=affiliationData();
 for(let i=1;i<members;i++){
  const id='usr_probe_'+i;h.seed('Users',{tlh_user_id:id,status:'ACTIVE'});
  data.organizationMemberships.push({membershipId:'probe_'+i,accountId:id,organizationId:'orgA',status:'ACTIVE',validFromDate:'2020-01-01',validToDate:''});
 }
 for(let i=0;i<revisions;i++)h.save(data);
 return h;
}
function instrument(h){
 const stats={opens:0,reads:0,cells:0,utf8Bytes:0,bySheet:{},locks:0,writes:0};const c=h.context,open=c.SpreadsheetApp.openById;
 const wrapped=new WeakSet();
 c.SpreadsheetApp.openById=id=>{stats.opens++;const book=open(id),get=book.getSheetByName;book.getSheetByName=name=>{
  const sheet=get.call(book,name);if(!sheet||wrapped.has(sheet))return sheet;wrapped.add(sheet);
  const range=sheet.getRange;sheet.getRange=function(...args){const r=range.apply(this,args);for(const method of ['getValues','getDisplayValues'])if(r[method]){
   const read=r[method];r[method]=function(...a){const values=read.apply(this,a);stats.reads++;stats.bySheet[name]=(stats.bySheet[name]||0)+1;stats.cells+=values.reduce((n,row)=>n+row.length,0);stats.utf8Bytes+=Buffer.byteLength(JSON.stringify(values),'utf8');return values;};
  }for(const method of ['setValue','setValues'])if(r[method]){const write=r[method];r[method]=function(...a){stats.writes++;return write.apply(this,a);};}return r;};return sheet;};return book;};
 const getLock=c.LockService.getScriptLock;c.LockService.getScriptLock=()=>{const lock=getLock();const take=lock.tryLock;lock.tryLock=function(...a){stats.locks++;return take.apply(this,a);};return lock;};
 return stats;
}
function probe(h,snapshot){
 const c=h.context,stats=instrument(h);const start=performance.now();
 const result=snapshot?(()=>{const original=c.affWithLock_;c.affWithLock_=fn=>original(()=>c.withSheetReadSnapshot_(fn));try{return c.accountAccessOverview_({idToken:'admin.jwt.proof'});}finally{c.affWithLock_=original;}})():c.accountAccessOverview_({idToken:'admin.jwt.proof'});
 return {stats:structuredClone(stats),localMockMs:Math.round((performance.now()-start)*1000)/1000,result:JSON.parse(JSON.stringify(result))};
}
const cases=[];
for(const members of [1,10,40])for(const revisions of [1,10]){
 const baselineFixture=fixture(members,revisions),candidateFixture=baselineFixture;
 // Freeze just response wall time; measured duration still uses host performance.now().
 const fixedNow=new Date().toISOString();
 for(const h of [baselineFixture]){const D=h.context.Date;h.context.Date=class extends D{constructor(...a){super(...(a.length?a:[fixedNow]));}static now(){return D.parse(fixedNow);}};}
 const before=JSON.stringify([candidateFixture.tables,candidateFixture.books,candidateFixture.affiliationBooks,[...candidateFixture.props]]);
 const baseline=probe(baselineFixture,false),candidate=probe(candidateFixture,true);
 // Same fixture and response timestamp: compare the entire DTO, including authorityRevision.
 assert.deepEqual(baseline.result,candidate.result);
 assert.equal(JSON.stringify([candidateFixture.tables,candidateFixture.books,candidateFixture.affiliationBooks,[...candidateFixture.props]]),before);
 assert.equal(candidate.stats.writes,0);
 const revoked=affiliationData();revoked.serviceGrants[0].status='INACTIVE';candidateFixture.save(revoked);
 const afterRevocation=probe(candidateFixture,true).result;
 assert.deepEqual(afterRevocation.organizations[0].stores[0].services.find(s=>s.serviceId==='INVENTORY').permissions,[]);
 candidateFixture.field('Users',0,'status','INACTIVE');
 assert.throws(()=>probe(candidateFixture,true),e=>String(e.code||e.message).includes('COMMON_ACCOUNT_INACTIVE'));
 cases.push({members,revisions,baseline:baseline.stats,candidate:candidate.stats,localMockMs:{baseline:baseline.localMockMs,candidate:candidate.localMockMs},sameDTO:true,noWrites:true,nextRequestGrantRevocation:true,nextRequestAccountRevocation:true});
}
console.log(JSON.stringify({kind:'in-memory API invocation counts; local timing is NOT GAS latency',cases},null,2));
