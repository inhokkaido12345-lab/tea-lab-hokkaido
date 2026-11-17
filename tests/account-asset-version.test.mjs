import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
test('Account loads content-versioned scripts in unchanged dependency order',()=>{
 const html=fs.readFileSync(new URL('account/index.html',root),'utf8');
 const sources=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(sources.map(s=>s.split('?')[0]),[
 '/software/inventory/employee-login.js','/workforce/current-workplace.js',
 '/workforce/common-affiliation-info.js','/workforce/company-employment-info.js',
 '/workforce/account-info.js','/workforce/staff-enrollment.js',
 'management-picker.js','common-affiliation.js','common-grants.js','access-overview.js','tabs.js','account.js']);
 for(const source of sources){
  const [name,query]=source.split('?');
  const asset=new URL(name.startsWith('/')?name.slice(1):`account/${name}`,root);
  const expected=createHash('sha256').update(fs.readFileSync(asset)).digest('hex').slice(0,16);
  assert.equal(query,`v=${expected}`,`${name} must use its current content hash`);
 }
});
test('Account version updater is clean in check mode',()=>{
 execFileSync(process.execPath,['scripts/sync-account-assets.mjs','--check'],{cwd:root});
});

test('Account CSS is content-versioned while existing font URL stays fixed',()=>{const html=fs.readFileSync(new URL('account/index.html',root),'utf8'),hash=createHash('sha256').update(fs.readFileSync(new URL('account/account.css',root))).digest('hex').slice(0,16);assert.ok(html.includes('href="account.css?v='+hash+'"'));assert.ok(html.includes('href="/workforce/fonts/ibm-plex-sans-jp.css"'));});
