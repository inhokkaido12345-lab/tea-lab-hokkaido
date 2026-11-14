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
  assert.match(app,/在庫基準未登録/);assert.match(app,/TLHアカウントと店舗への参加権限/);
  assert.match(transport,/crypto\.subtle\.verify/);
  assert.match(transport,/responseKey/);assert.match(transport,/pagehide/);
  assert.match(transport,/workforce\/inventory\//);
});

test('計測は単発で閉じ、次袋を自動開始しない',()=>{
 const app=read('app.js');
 assert.match(app,/この1袋・1ケースの使用開始を記録/);assert.match(app,/START_MEASUREMENT/);assert.match(app,/UPDATE_MEASUREMENT/);assert.doesNotMatch(app,/measurementAmountField/);
 assert.match(app,/FINISH_SAMPLE/);assert.match(app,/CANCEL_SAMPLE/);
 assert.doesNotMatch(app,/使い切って次を開封/);
});

test('TLH共通資産と確認済み保存画面を使用する',()=>{
 assert.match(read('index.html'),/workforce\/fonts\/ibm-plex-sans-jp\.css/);
 assert.doesNotMatch(read('index.html'),/brand-logo|logo-horizontal\.svg/);
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


test('在庫サービスは店舗作成・参加・店舗選択と仕入品情報を備える',()=>{
 assert.match(read('index.html'),/data-tab="catalog"/);assert.match(read('index.html'),/inventory-stores/);
 assert.doesNotMatch(read('index.html'),/The TEA ココノススキノ店/);
 assert.match(read('app.js'),/SAVE_ITEM/);assert.match(read('app.js'),/childUnitId/);assert.match(read('app.js'),/CATALOG_CHANGED/);
 assert.match(read('employee-transport.js'),/readView/);assert.match(read('employee-transport.js'),/新しい店舗を作成/);assert.match(read('employee-transport.js'),/招待された店舗に参加/);
});


test('現行品の管理と仕入情報の連動・変更履歴・容量/本数を備える',()=>{
 const app=read('app.js');assert.match(app,/使用終了のみ/);assert.match(app,/CATALOG_REFERENCE_CHANGED/);assert.match(app,/manufacturerSourceItemId/);assert.match(app,/suppliersSourceItemId/);assert.match(app,/品目の状態/);assert.match(app,/在庫の基準単位/);
});

test('共通カテゴリと品名検索を備え、カテゴリは既存保存APIへ渡す',()=>{
 const app=read('app.js');assert.match(app,/const productCategories=/);assert.match(app,/シロップ・ソース/);assert.match(app,/包材・容器・消耗品/);
 assert.match(app,/category:category.value/);assert.match(app,/matchesItem/);assert.match(app,/normalize\('NFKC'\)/);
 assert.match(app,/stockCards.clear\(\)/);assert.match(read('index.html'),/id="stock-item-filters"/);assert.match(read('style.css'),/\.item-filters/);
});

test('WorkTimeと同じ要確認表示に固定コードと対処操作を添える',()=>{
 const app=read('app.js'),html=read('index.html'),css=read('style.css');
 assert.match(html,/id="status-detail"/);assert.match(html,/role="alert"/);
 assert.match(app,/statusGuides/);assert.match(app,/確認コード：/);assert.match(app,/TENANT_SAVE_UNKNOWN/);
 assert.match(app,/同じ操作を再確認/);assert.match(css,/\.status-needs-action/);assert.match(css,/⚠ 要確認/);
 assert.match(html,/app\.js\?v=[a-f0-9]{12}/);assert.match(html,/JS_START_FAILED/);
});

test('在庫の再ログインを無効化せず、Core失敗を期限切れと断定しない',()=>{
 const app=read('app.js'),auth=readFileSync(new URL('../workforce/inventory/auth/auth.js',import.meta.url),'utf8');
 assert.match(app,/button.dataset.recovery=action/);assert.match(app,/b.dataset.recovery/);
 assert.match(app,/ACCOUNT_NOT_REGISTERED/);assert.match(app,/AUTH_SERVICE_ERROR/);
 assert.doesNotMatch(app,/認証の有効期限が切れました/);assert.match(read('employee-login.js'),/reauth=1/);
 assert.match(auth,/liff.logout\(\)/);assert.match(auth,/if\(reauthenticate/);
});
