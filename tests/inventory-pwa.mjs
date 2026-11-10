import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../software/inventory/'+name,import.meta.url),'utf8');

test('在庫PWAは独自ドメイン・WorkTimeのscope外で独立した起動範囲を持つ',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name,'TLH Inventory');
  assert.equal(manifest.id,'/software/inventory/');
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
  assert.match(app,/在庫基準未登録/);assert.match(app,/TLHアカウントと有効な従業員登録/);
  assert.match(transport,/crypto\.subtle\.verify/);
  assert.match(transport,/responseKey/);assert.match(transport,/pagehide/);
  assert.match(transport,/workforce\/inventory\//);
});

test('計測は単発で閉じ、次袋を自動開始しない',()=>{
 const app=read('app.js');
 assert.match(app,/消費速度の計測を開始/);
 assert.match(app,/FINISH_SAMPLE/);assert.match(app,/CANCEL_SAMPLE/);
 assert.doesNotMatch(app,/使い切って次を開封/);
});

test('TLH共通資産と確認済み保存画面を使用する',()=>{
 assert.match(read('index.html'),/workforce\/fonts\/ibm-plex-sans-jp\.css/);
 assert.match(read('index.html'),/assets\/brand\/logo-horizontal\.svg/);
 assert.match(read('app.js'),/view: result.value.view/);
 assert.match(read('app.js'),/if\(data.view\)/);
});

test('WorkTimeの範囲と重ならず、旧入口は転送のみ',()=>{
 const worktime=JSON.parse(readFileSync(new URL('../workforce/manifest.webmanifest',import.meta.url),'utf8'));
 const own=JSON.parse(read('manifest.webmanifest'));
 assert.equal(own.scope.startsWith(worktime.scope),false);
 const legacy=readFileSync(new URL('../workforce/inventory/index.html',import.meta.url),'utf8');
 assert.ok(legacy.includes('url=/software/inventory/'));assert.doesNotMatch(legacy,/rel="manifest"/);
 assert.match(read('index.html'),/employee-login.js/);assert.doesNotMatch(read('index.html'),/liff\/edge/);
 assert.doesNotMatch(read('employee-login.js'),/localStorage\.|sessionStorage\./);
 assert.doesNotMatch(read('app.js'),/発注から到着まで（日）/);
});
