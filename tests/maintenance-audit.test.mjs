/** Check actual maintained routes and deliberate missing/legacy script regressions. No Google/network. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {auditWorkTime} from '../scripts/audit-worktime-assets.mjs';
test('maintained HTML assets exist and legacy editors remain outside current page script entries',()=>{
 const r=auditWorkTime();assert.equal(r.code,'WORKTIME_ASSETS_VERIFIED');assert.ok(r.pages>=15);assert.equal(r.legacyEntryLoads,0);
});
test('asset audit rejects broken dependencies and reintroduced legacy editor scripts',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tlh-asset-fixture-'));
 try{fs.mkdirSync(path.join(root,'workforce'));fs.writeFileSync(path.join(root,'workforce/index.html'),'<script src="missing.js"></script>');assert.throws(()=>auditWorkTime(root),/WORKTIME_ASSET_MISSING/);
 fs.writeFileSync(path.join(root,'workforce/schedule-bulk.js'),'');fs.writeFileSync(path.join(root,'workforce/index.html'),'<script src="schedule-bulk.js"></script>');assert.throws(()=>auditWorkTime(root),/WORKTIME_LEGACY_ENTRY/);
 }finally{for(const name of ['index.html','schedule-bulk.js'])fs.rmSync(path.join(root,'workforce',name),{force:true});fs.rmdirSync(path.join(root,'workforce'));fs.rmdirSync(root);}
});
