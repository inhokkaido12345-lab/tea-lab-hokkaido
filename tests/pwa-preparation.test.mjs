/** Install metadata and privacy boundary only; no device install or real login is performed. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('PWA preparation scopes online startup to Workforce and contains valid static icons only',()=>{
  const base=new URL('../workforce/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',base),'utf8'));
  assert.equal(manifest.id,'/workforce/');assert.equal(manifest.start_url,'/software/worktime/');assert.equal(manifest.scope,'/software/worktime/');assert.equal(manifest.display,'standalone');
  const html=fs.readFileSync(new URL('index.html',base),'utf8');assert.match(html,/<link rel="manifest" href="manifest.webmanifest">/);
  for(const size of [192,512]){const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}`);assert.ok(icon);const bytes=fs.readFileSync(new URL(icon.src,base));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
  assert.doesNotMatch(JSON.stringify(manifest),/idToken|access_token|nonce|responseKey|\?/);
  assert.ok(!fs.existsSync(new URL('sw.js',base))&&!fs.existsSync(new URL('service-worker.js',base)));
  assert.doesNotMatch(html,/serviceWorker\.register|caches\.open|indexedDB\.open/);
});
