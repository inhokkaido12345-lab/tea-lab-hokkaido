/** Static registry/security contracts. DOM behavior is exercised in the real-browser companion. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
function catalog(){const window={};vm.runInNewContext(read('shared/app-menu/catalog.js'),{window});return window.TlhAppCatalog;}
test('launch roots are app-scoped; future POS has no guessed URL',()=>{
 const c=catalog();assert.deepEqual(JSON.parse(JSON.stringify(c.entries.map(x=>[x.id,x.path]))),[['account','/account/'],['inventory','/software/inventory/'],['worktime','/software/worktime/'],['pos',null]]);
});
test('catalog cannot accept executable, external, auth-query, fragment or traversal destinations',()=>{
 const c=catalog(),sample=c.entries[0];for(const path of ['https://evil.invalid/','//evil.invalid/','javascript:alert(1)','/account/?idToken=secret','/account/#token','/../account/','/%2e%2e/account/','/account\\evil/','/account//'])assert.throws(()=>c.validate([{...sample,path}]),/APP_PATH_INVALID/);
});
test('registry additions need one data entry, preserve immutability and reject duplicate ids',()=>{
 const c=catalog(),extra={id:'delivery',title:'デリバリー',description:'商品・価格',mark:'配達',path:'/software/delivery/'};
 const extended=c.validate([...c.entries,extra]);assert.equal(extended.length,5);assert.ok(Object.isFrozen(extended));assert.ok(extended.every(Object.isFrozen));assert.equal(c.entries.length,4);assert.throws(()=>c.validate([...c.entries,c.entries[0]]),/APP_CATALOG_INVALID/);
});
test('malformed metadata never reaches a menu',()=>{const c=catalog();for(const list of [null,[],[{}],[{...c.entries[0],id:'bad"id'}],[{...c.entries[0],title:''}]])assert.throws(()=>c.validate(list),/APP_CATALOG/);});
test('launcher has no own authentication, data fetch, storage, SW or permission-writing API',()=>{
 const s=read('shared/app-menu/app-menu.js');assert.doesNotMatch(s,/\b(fetch|XMLHttpRequest|WebSocket|BroadcastChannel|eval)\s*\(|localStorage|sessionStorage|indexedDB|serviceWorker|\.innerHTML\s*=/);
 assert.doesNotMatch(s,/getIDToken|liff\.|postMessage\(|whoAmI|commonServiceAccessV1|bridgeCreateAccount/);
});
test('prototype cannot silently mount into account, inventory or WorkTime production files',()=>{
 const s=read('prototypes/app-menu/index.html');assert.doesNotMatch(s,/liff|script\.google|manifest|iframe|\/account\/account\.js/);assert.match(s,/id="app-menu-slot"/);assert.match(s,/shared\/app-menu\/app-menu\.js/);
});
