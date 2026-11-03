/** 実表示で見つかったCSS先頭の不正なコメント断片による変数未定義を検出する。 */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('shared stylesheet starts with a valid root variable block and every var reference is declared',()=>{
  const css=fs.readFileSync(new URL('../workforce/app.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').trim();
  assert.ok(!css.includes('*/'),'unmatched comment ending');
  const root=css.match(/^:root\s*\{([^}]+)\}/);assert.ok(root,'root declarations must not be swallowed by an invalid selector');
  const declared=new Set([...root[1].matchAll(/(--[a-z-]+)\s*:/g)].map(m=>m[1]));
  for(const used of css.matchAll(/var\((--[a-z-]+)/g))assert.ok(declared.has(used[1]),'undefined visual token: '+used[1]);
  assert.match(css,/\[hidden\]\s*\{\s*display:none!important/);
});
