import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
test('status remedies distinguish uncertain writes, expired login and ordinary reads without side effects',()=>{
 const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(new URL('../workforce/status-guidance.js',import.meta.url),'utf8'),context);const guide=context.window.TlhStatusGuidance.guidance;
 assert.match(guide('保存結果を確認できません。同じ操作で再確認してください。'),/送信ボタンを押し直さず/);
 assert.match(guide('LINEでログインし直してください。'),/元の画面/);
 assert.match(guide('シフトを取得できませんでした。'),/通信状況/);
 assert.match(guide('入力シートに修正が必要な箇所が5件あります。'),/表示されたセル/);
 for(const ok of ['保存しました。','保存結果を確認しました。','月全体の公開・変更反映を確認しました。','管理者権限：有効です','未確認'])assert.equal(guide(ok),'');
});
