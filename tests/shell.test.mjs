/** 表示時計が保存/認可へ混ざらず、退場後に更新しないことを実モジュールで確認。 */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../workforce/shell.js',import.meta.url),'utf8');
test('display clock uses JST only for presentation and stops on page departure without sending or storing',()=>{
  const nodes=new Map(),handlers={},timers=new Map();const n=id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id);};
  const window={addEventListener:(type,fn)=>handlers[type]=fn,setInterval:fn=>{timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id)};
  function Clock(){return new Date('2026-11-02T23:00:00.000Z');}
  vm.runInNewContext(source,{window,document:{getElementById:n},Intl,Date:Clock});window.TlhWorkforceShell.init();
  assert.equal(n('display-clock').textContent,'08:00');assert.equal(timers.size,1);handlers.pagehide();assert.equal(timers.size,0);assert.equal(n('display-clock').textContent,'--:--');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|liff|submit)\s*[.(]/);
});
