import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../workforce/inventory/'+name,import.meta.url),'utf8');

test('在庫PWAは独自ドメイン・既存LIFF配下で独立した起動範囲を持つ',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name,'TLH Inventory');
  assert.equal(manifest.id,'/workforce/inventory/');
  assert.equal(manifest.start_url,manifest.id);assert.equal(manifest.scope,manifest.id);
  assert.equal(manifest.display,'standalone');assert.equal(manifest.icons.length,2);
  const html=read('index.html');
  assert.match(html,/manifest.webmanifest/);assert.match(html,/LINEでログイン/);
  for(const file of ['employee-transport.js','config.js','app.js'])assert.ok(html.includes(file));
  assert.match(read('config.js'),/2011940133-JXUDzLnG/);
  assert.match(read('config.js'),/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/);
});

test('在庫PWAに独自の端末保存・オフライン送信・未認証のローカルAPIを追加しない',()=>{
  const app=read('app.js'),transport=read('employee-transport.js');
  assert.doesNotMatch(app+transport,/localStorage\.|sessionStorage\.|indexedDB\.|caches\.|serviceWorker\./);
  assert.equal(app.includes("fetch('/api/"),false);
  assert.match(app,/初回棚卸未登録/);assert.match(app,/TLHアカウントと有効な従業員登録/);
  assert.match(transport,/crypto\.subtle\.verify/);
  assert.match(transport,/responseKey/);assert.match(transport,/pagehide/);
  assert.match(transport,/workforce\/inventory\//);
});
