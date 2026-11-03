/** 実表示で見つかったCSS先頭の不正なコメント断片による変数未定義を検出する。 */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createHash} from 'node:crypto';

test('self-hosted Japanese font distribution is intact and every CSS file reference exists without external font requests',()=>{
  const base=new URL('../workforce/fonts/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base),'utf8'));
  const css=fs.readFileSync(new URL('ibm-plex-sans-jp.css',base),'utf8');
  assert.match(css,/font-display: swap/);assert.doesNotMatch(css,/url\(https?:|@import/);
  const referenced=[...css.matchAll(/url\(([^)]+)\)/g)].map(m=>m[1]);assert.equal(referenced.length,manifest.files.length);
  for(const file of manifest.files){assert.ok(referenced.includes(file.name));const bytes=fs.readFileSync(new URL(file.name,base));assert.equal(bytes.subarray(0,4).toString(),'wOF2');assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
  const license=fs.readFileSync(new URL('OFL.txt',base));assert.equal(createHash('sha256').update(license).digest('hex'),manifest.licenseSha256);
});
test('shared stylesheet starts with a valid root variable block and every var reference is declared',()=>{
  const css=fs.readFileSync(new URL('../workforce/app.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').trim();
  assert.ok(!css.includes('*/'),'unmatched comment ending');
  const root=css.match(/^:root\s*\{([^}]+)\}/);assert.ok(root,'root declarations must not be swallowed by an invalid selector');
  const declared=new Set([...root[1].matchAll(/(--[a-z-]+)\s*:/g)].map(m=>m[1]));
  for(const used of css.matchAll(/var\((--[a-z-]+)/g))assert.ok(declared.has(used[1]),'undefined visual token: '+used[1]);
  assert.match(css,/\[hidden\]\s*\{\s*display:none!important/);
});
