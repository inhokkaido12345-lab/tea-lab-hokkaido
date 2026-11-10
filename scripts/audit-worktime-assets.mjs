/** Read-only asset/legacy-entry audit. HTML is source; generated pages stay build outputs.
 * Calls no network, auth or API; prints paths/counts only. Do not delete compatibility code from this report alone.
 * Change: extend blockedLegacy only after checking current script/init and tests, never by filename age.
 */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function auditWorkTime(root=repository){
 const source=path.join(root,'workforce'),pages=fs.readdirSync(source,{withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.html')).map(e=>e.name);
 for(const child of ['sandbox/index.html','inventory/auth/index.html','inventory/index.html'])if(fs.existsSync(path.join(source,child)))pages.push(child);
 const references=[];
 for(const page of pages){const html=fs.readFileSync(path.join(source,page),'utf8');
  for(const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)){
   const value=match[1];if(/^(?:https?:|data:|#)/.test(value))continue;
   const clean=value.split(/[?#]/)[0],target=path.resolve(clean.startsWith('/')?root:path.dirname(path.join(source,page)),clean.startsWith('/')?clean.slice(1):clean);
   if(!target.startsWith(path.resolve(root)+path.sep)||!fs.existsSync(target))throw Error('WORKTIME_ASSET_MISSING:'+page+':'+clean);
   references.push({page,asset:path.relative(root,target).replaceAll(path.sep,'/')});
  }
 }
 const blockedLegacy=['workforce/schedule-bulk.js','workforce/schedule-sheet.js'];
 const legacyLoaded=references.filter(r=>blockedLegacy.includes(r.asset));if(legacyLoaded.length)throw Error('WORKTIME_LEGACY_ENTRY:'+legacyLoaded[0].page+':'+legacyLoaded[0].asset);
 return{code:'WORKTIME_ASSETS_VERIFIED',pages:pages.length,assets:new Set(references.map(r=>r.asset)).size,legacyEntryLoads:legacyLoaded.length,retainedCompatibility:blockedLegacy};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(auditWorkTime()));
