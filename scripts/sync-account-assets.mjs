// Account is a source page, not a generated WorkTime page. Update only its
// same-origin script cache keys; preserve script ordering and all other markup.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const page=path.join(root,'account/index.html');
const before=fs.readFileSync(page,'utf8');
const after=before.replace(/(<script\b[^>]*\bsrc=")([^"?#]+)(?:\?v=[a-f0-9]+)?(")/g,(match,start,src,end)=>{
 if (/^(?:[a-z]+:)?\/\//i.test(src)) throw new Error('Account scripts must be same-origin');
 const asset=path.resolve(src.startsWith('/')?root:path.dirname(page),'.'+(src.startsWith('/')?src:'/'+src));
 if(!asset.startsWith(root+path.sep))throw new Error('Asset outside site');
 const hash=createHash('sha256').update(fs.readFileSync(asset)).digest('hex').slice(0,16);
 return `${start}${src}?v=${hash}${end}`;
});
if(process.argv.includes('--check')){
 if(after!==before){console.error('Account asset hashes are stale. Run node scripts/sync-account-assets.mjs');process.exitCode=1;}
}else if(after!==before)fs.writeFileSync(page,after);
