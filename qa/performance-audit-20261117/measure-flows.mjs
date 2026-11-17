/** Real pinned UI/GAS + fake DOM, LINE and catalog; no network and no production writes.
 * Usage: node qa/performance-audit-20261117/measure-flows.mjs <snapshot parent directory>
 */
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {webcrypto,createHash,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'..'),publicRoot=resolve(root,'tea-lab-hokkaido');
const nodes=new Map(),sent=[],timers=new Map();let timer=0;
function element(){return {value:'',hidden:false,disabled:false,textContent:'',children:[],events:{},attributes:{},contentWindow:{},
 setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},getAttributeNames(){return Object.keys(this.attributes);},
 addEventListener(k,v){this.events[k]=v;},appendChild(v){this.children.push(v);},replaceChildren(){this.children=[];},remove(){},
 submit(){sent.push(Object.fromEntries(this.children.map(n=>[n.name,n.value])));}};}
const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
const window={location:{origin:'https://tealabhokkaido.com',pathname:'/account/'},addEventListener(){},
 TlhInventoryLogin:{async login(){},getToken:()=> 'fixture.jwt.proof'},TlhStaffEnrollment:{init(){}},TlhCurrentWorkplace:{submit:f=>f.submit()}};window.top=window;
const c=vm.createContext({window,document:{currentScript:null,getElementById:node,createElement:element,body:element()},crypto:webcrypto,Uint8Array,TextEncoder,Date,
 setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout(id){timers.delete(id);}});
for(const path of ['workforce/common-affiliation-info.js','workforce/company-employment-info.js','workforce/account-info.js','account/access-overview.js','account/account.js'])vm.runInContext(readFileSync(resolve(publicRoot,path),'utf8'),c,{filename:path});
await node('account-login').events.click();
const initial=sent.map(x=>({action:x.action,phase:x.phase||null}));assert.equal(initial.length,4);
// Expire fake pending requests so the actual manual-refresh handler can run; do not sleep.
for(const fn of [...timers.values()])fn();const offset=sent.length;node('account-info-check').events.click();
const refresh=sent.slice(offset).map(x=>({action:x.action,phase:x.phase||null}));assert.equal(refresh.length,3);

// Mechanically reuse ONLY the existing fixture definition, never import/execute its test bodies.
const testPath=resolve(root,'tlh-inventory/tests/employee-bridge.test.mjs');
let fixtureSource=readFileSync(testPath,'utf8').split("\ntest(")[0].replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(testPath).href));
const fixtures=vm.createContext({vm,readFileSync,createHash,createHmac,assert,URL,structuredClone});vm.runInContext(fixtureSource,fixtures);
const inventory=[];
for(const count of [1,5,20]){
 const stores=Array.from({length:count},(_,i)=>({localStoreId:i?'probe-store-'+i:'demo-shop',organizationId:'fixture-org',storeId:'common-'+i,authorityMode:'COMMON'}));
 const x=fixtures.setup({affiliation:JSON.stringify({version:1,serviceInstanceId:'inventory_primary',stores})});
 // Catalog membership is synthetic; the loop, signed replies, ledger and authorization code are real.
 const catalog=x.context.InventoryDomain_.tenantStoreCatalog;x.context.InventoryDomain_.tenantStoreCatalog=events=>[...catalog(events),...stores.slice(1).map(s=>({id:s.localStoreId,name:s.localStoreId}))];
 let held=false,inside=0;const get=x.context.LockService.getScriptLock;x.context.LockService.getScriptLock=()=>{const lock=get();return {tryLock(...a){const ok=lock.tryLock(...a);held=ok;return ok;},releaseLock(){held=false;lock.releaseLock();}};};
 const fetch=x.context.UrlFetchApp.fetch;x.context.UrlFetchApp.fetch=(url,options)=>{
  if(held)inside++;const r=JSON.parse(options.payload);if(r.action==='commonServiceAccessV1'){
   const b=stores.find(s=>s.localStoreId===r.localStoreId);x.setShared({ok:true,result:{version:1,actorAccountId:'fixture-user',organizationId:b.organizationId,storeId:b.storeId,serviceId:'INVENTORY',serviceInstanceId:'inventory_primary',localStoreId:b.localStoreId,permissions:['inventory.read'],authorityRevision:'a'.repeat(64),checkedAtUtc:new Date().toISOString()}});
  }return fetch(url,options);
 };
 const result=x.send({command:'ACCOUNT',input:JSON.stringify({includeView:true,storeId:'demo-shop'})});assert.equal(result.code,'OK');
 assert.equal(x.calls.length,count+1);assert.equal(inside,count);assert.equal(x.rows().length,1);
 inventory.push({commonCatalogStores:count,selectedStoreExplicit:true,coreRequests:x.calls.length,coreRequestsInsideInventoryLock:inside,ledgerReads:x.reads(),ledgerRowsWritten:0});
}
console.log(JSON.stringify({kind:'fake DOM + fake GAS services; actual pinned flow code',account:{initial,manualIdentityRefresh:refresh},inventory},null,2));
