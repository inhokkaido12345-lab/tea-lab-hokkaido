/** 公開URL移行の境界。実LINE・実データは使わず、固定転送/資産/認可の維持を検査する。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {currentWorkplaceHarness} from './helpers/current-workplace-harness.mjs';

const root=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,root),'utf8');
function route(href){
  const redirects=[],window={location:{href,replace:value=>redirects.push(value)}};
  vm.runInNewContext(read('workforce/worktime-url.js'),{window,URL});
  return {redirects,api:window.TlhWorkTimeUrl};
}

test('旧ホーム・各業務・試験・在庫認証は新固定ページへ、在庫本体は変更しない',()=>{
  for(const path of ['','index.html','account-info.html','admin-schedule.html','sandbox/','inventory/auth/']){
    assert.deepEqual(route('https://tealabhokkaido.com/workforce/'+path).redirects,['https://tealabhokkaido.com/software/worktime/'+path]);
  }
  for(const url of ['https://tealabhokkaido.com/software/worktime/','https://tealabhokkaido.com/software/inventory/','https://tealabhokkaido.com/workforce/inventory/','https://tealabhokkaido.com/workforce/not-an-app.html','https://example.com/workforce/'])assert.equal(route(url).redirects.length,0);
});

test('転送はOAuth・未知queryをコピーせず、店舗指定の重複や不一致を消さない',()=>{
  for(const query of ['?code=secret&state=value','?id_token=secret','?return=https://example.com/','?liff.state=x'])assert.equal(route('https://tealabhokkaido.com/workforce/'+query).redirects.length,0);
  for(const query of ['?organizationId=other&workplaceId=other','?organizationId=a&organizationId=b','?workplaceId=other']){
    const url=route('https://tealabhokkaido.com/workforce/'+query).redirects[0];
    assert.equal(url,'https://tealabhokkaido.com/software/worktime/'+query);
    const h=currentWorkplaceHarness({href:url});assert.throws(()=>h.api.submit(h.form()),/INVALID/);assert.equal(h.sent.length,0);
  }
  assert.equal(route('https://tealabhokkaido.com/workforce/#schedule').redirects[0],'https://tealabhokkaido.com/software/worktime/#schedule');
  assert.equal(route('https://tealabhokkaido.com/workforce/#access_token=secret').redirects[0],'https://tealabhokkaido.com/software/worktime/');
});

test('公開ページは同じ業務controllerを参照し、現役の全ローカル資産・リンクが存在する',()=>{
  const files=fs.readdirSync(new URL('workforce/',root)).filter(name=>name.endsWith('.html'));
  for(const name of files){
    const html=read('software/worktime/'+name),source=read('workforce/'+name);
    assert.match(html,/<base href="\/workforce\/">/);assert.doesNotMatch(html,/worktime-url\.js/);
    const src=text=>[...text.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1]).filter(v=>!v.endsWith('/worktime-url.js'));
    assert.deepEqual(src(html),src(source));
    for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
      if(!match[1]||match[1].startsWith('#'))continue;
      const url=new URL(match[1],'https://tealabhokkaido.com/workforce/');
      if(url.origin!=='https://tealabhokkaido.com'||url.pathname==='/')continue;
      const path=new URL('.'+url.pathname,root);
      assert.ok(fs.existsSync(path),name+' missing '+url.pathname);
    }
  }
});

test('PWAは旧manifest URLとidを引継ぎ、起動と範囲はWork Timeだけ、在庫scopeへ広げない',()=>{
  const m=JSON.parse(read('workforce/manifest.webmanifest'));
  assert.equal(m.id,'/workforce/');assert.equal(m.start_url,'/software/worktime/');assert.equal(m.scope,m.start_url);
  assert.match(read('software/worktime/index.html'),/<base href="\/workforce\/">/);
  assert.match(read('software/worktime/index.html'),/<link rel="manifest" href="manifest.webmanifest">/);
  assert.ok(!'/software/inventory/'.startsWith(m.scope));
});

test('旧在庫popupはopenerを維持して新Endpoint内の窓口へ移り、tokenは従来どおり相関照合して返信',()=>{
  const html=read('software/worktime/inventory/auth/index.html'),script=read('workforce/inventory/auth/auth.js');
  assert.match(html,/<base href="\/workforce\/inventory\/auth\/">/);
  assert.match(script,/pathname!=='\/software\/worktime\/inventory\/auth\/'/);
  assert.match(script,/redirectUri:origin\+'\/software\/worktime\/inventory\/auth\/'/);
  assert.match(script,/event\.source!==global\.opener/);assert.match(script,/event\.origin!==origin/);
  assert.doesNotMatch(script,/localStorage\.|sessionStorage\.|console\./);
});
