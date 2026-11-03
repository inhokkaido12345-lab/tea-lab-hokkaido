/**
 * UI1の全controller+実HTMLのID契約を偽DOM/偽LIFFで検査。Googleへ接続しない。
 * HTMLからID/pane fixture→既存全script/起動→tab/拒否応答。削除時は配置替えによるDOM欠落を見逃す。
 * 暗号はNode標準を使用。見た目/実LINEの成功は別途確認する。改造はlayout/HTML/READMEを同期。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHmac } from 'node:crypto';

const html = fs.readFileSync(new URL('../workforce/index.html', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../workforce/layout.js', import.meta.url), 'utf8');
async function harness({ loggedIn = true, proof = 'fake.jwt.proof' } = {}) {
  const nodes = new Map(), panes = [], handlers = {}, sent = [], timers = new Map(); let timer = 0, focused = '';
  const observers=new Set();class Observer{constructor(fn){this.fn=fn;}observe(n){this.node=n;observers.add(this);}disconnect(){observers.delete(this);}}
  // 既知の二重引用ID属性をfixtureにするだけ。HTML構文/親子関係/描画の検証ではない。
  for (const match of html.matchAll(/<[a-z][a-z0-9-]*\b([^<>]*\bid="([^"]+)"[^<>]*)>/gi)) {
    const attrs = match[1], id = match[2]; assert.ok(!nodes.has(id), 'duplicate DOM id: ' + id);
    const pane = attrs.match(/data-workforce-pane="([^"]+)"/);
    const node = { id, hidden: /\bhidden\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs), value: '', textContent: '', events: {}, contentWindow:{},
      dataset: pane ? { workforcePane: pane[1] } : {}, attributes: {},
      addEventListener(type, fn) { this.events[type] = fn; },
      setAttribute(name, value) { this.attributes[name] = value;for(const o of observers)if(o.node===this)queueMicrotask(()=>{if(observers.has(o))o.fn();}); },getAttribute(name){return this.attributes[name]??null;},click(){if(!this.disabled)this.events.click?.();}, replaceChildren() {}, appendChild() {}, focus() { focused = id; } };
    nodes.set(id, node); if (pane) panes.push(node);
  }
  const node = id => { assert.ok(nodes.has(id), 'missing actual DOM id: ' + id); return nodes.get(id); };
  node('journal-mode').value='self'; // 実HTMLの唯一のoptionが初期選択される。
  const diagnostics = { open: false };
  const context = { crypto: webcrypto, Uint8Array, TextEncoder, URL,MutationObserver:Observer,
    location: { origin: 'https://tealabhokkaido.com', pathname: '/workforce/' },
    confirm: () => false,
    liff: { init: async () => {}, isLoggedIn: () => loggedIn, isInClient: () => true, getIDToken: () => proof },
    setTimeout(fn) { const id = ++timer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    document: { getElementById: node,
      querySelectorAll(selector) { if(selector==='[data-approval-badge]')return [];assert.equal(selector, '[data-workforce-pane]'); return panes; },
      querySelector(selector) { assert.equal(selector, '.diagnostics'); return diagnostics; },
      body: { appendChild() {} }, createElement() { return { children: [],
        appendChild(child) { this.children.push(child); }, remove() {},
        submit() { sent.push(Object.fromEntries(this.children.map(child => [child.name, child.value]))); } }; } },
    fetch() { throw Error('unexpected network'); },
  };
  context.window = context; context.top = context;
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"?]+)(?:\?[^"]*)?"[^>]*><\/script>/g)) {
    if (match[1].startsWith('https:')) continue;
    vm.runInNewContext(fs.readFileSync(new URL('../workforce/' + match[1], import.meta.url), 'utf8'), context);
  }
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; assert.equal(inline.length, 1);
  vm.runInNewContext(inline[0][1], context);
  await new Promise(resolve => setImmediate(resolve));
  return { node, panes, context, diagnostics, sent, timers, focused: () => focused,
    click(id) { node(id).events.click(); },
    key(id, key) { let prevented = false; node(id).events.keydown({ key, preventDefault() { prevented = true; } }); return prevented; },
    async replyAccess(code='STAFF_ADMIN_READY') {
      const request=sent.find(r=>r.action==='bridgeCheckStaffEnrollment'),data={type:'TLH_BRIDGE_STAFF_ENROLLMENT',action:request.action,nonce:request.nonce,code};
      data.mac=createHmac('sha256',request.responseKey).update([data.type,data.nonce,data.action,data.code].join('\n')).digest('hex');
      for(const fn of handlers.message)await fn({origin:'null',source:node('admin-access-frame').contentWindow,data});
    },
    async replyPunch(code) {
      const request = sent.at(-1), data = { type: 'TLH_BRIDGE_PUNCH', action: request.action,
        nonce: request.nonce, code, revision: '' };
      data.mac = createHmac('sha256', request.responseKey).update(
        [data.type, data.nonce, data.action, data.code, data.revision].join('\n')).digest('hex');
      for (const fn of handlers.message) await fn({ origin: 'null', data });
      await new Promise(resolve=>setImmediate(resolve));
    },
  };
}

test('LIFF-ready defaults to employee, sends one role check and reads visible punch state automatically', async () => {
  const h = await harness(); assert.equal(h.sent.length, 2);assert.equal(h.sent[0].action,'bridgeCheckStaffEnrollment');assert.equal(h.sent[1].action,'bridgeGetPunchReadiness');assert.equal(h.node('manager-tab').disabled,true); assert.equal(h.node('workforce-tabs').hidden, false);
  assert.equal(h.node('punch-section').hidden, false); assert.equal(h.node('employee-work-panel').hidden, false);
  assert.equal(h.node('manager-registration-panel').hidden, true); assert.equal(h.node('staff-admin').hidden, true);
  for (const id of ['punch-in', 'punch-out', 'punch-break-start', 'punch-break-end']) assert.equal(h.node(id).hidden, true);
});
test('tabs change only wrapper visibility, not permissions, pending values, command visibility or form content', async () => {
  const h = await harness();await h.replyAccess(); h.node('staff-issued-code').value = 'fake-private-draft'; h.node('staff-check').disabled = true;
  h.node('staff-status').textContent = '処理中です。';
  for (let count = 0; count < 3; count++) { h.click('manager-tab'); h.click('employee-tab'); }
  h.click('manager-tab'); assert.equal(h.node('manager-registration-panel').hidden, false);
  assert.equal(h.node('employee-registration-panel').hidden, true); assert.equal(h.node('staff-admin').hidden, true);
  assert.equal(h.node('staff-issued-code').value, 'fake-private-draft'); assert.equal(h.node('staff-check').disabled, true);
  assert.equal(h.node('staff-status').textContent, '処理中です。'); assert.equal(h.sent.length, 3);assert.equal(h.sent[2].action,'bridgeGetAdminOverview');
});
test('arrow/Home/End navigation maintains selected tab, focus and tab stop; other keys are untouched', async () => {
  const h = await harness();await h.replyAccess(); assert.equal(h.key('employee-tab', 'ArrowRight'), true); assert.equal(h.focused(), 'records-tab');
  assert.equal(h.node('records-tab').attributes['aria-selected'], 'true'); assert.equal(h.node('employee-tab').tabIndex, -1);
  assert.equal(h.key('manager-tab', 'Home'), true); assert.equal(h.focused(), 'employee-tab');
  assert.equal(h.key('employee-tab', 'End'), true); assert.equal(h.focused(), 'more-tab');
  assert.equal(h.key('more-tab', 'ArrowRight'), true); assert.equal(h.focused(), 'employee-tab');
  assert.equal(h.key('employee-tab', 'ArrowLeft'), true); assert.equal(h.focused(), 'more-tab');
  assert.equal(h.key('manager-tab', 'Tab'), false);
});
test('four destinations expose only their wrappers and queue lazy reads without duplicating pending requests', async () => {
  const h = await harness();await h.replyAccess();
  h.click('records-tab');assert.equal(h.node('records-work-panel').hidden,false);assert.equal(h.node('employee-work-panel').hidden,true);
  h.click('more-tab');assert.equal(h.node('employee-registration-panel').hidden,false);assert.equal(h.node('more-tools-panel').hidden,false);
  assert.equal(h.node('manager-registration-panel').hidden,true);assert.equal(h.node('records-work-panel').hidden,true);
  h.click('manager-tab');assert.equal(h.node('manager-tools-panel').hidden,false);assert.equal(h.node('more-tools-panel').hidden,true);
  assert.equal(h.sent.length,3);assert.equal(h.sent[2].action,'bridgeGetAdminOverview');
});

test('developer demo also separates manager issue/release from personal invitation claim',async()=>{
  const h=await harness();await h.replyAccess();h.click('manager-tab');assert.equal(h.node('manager-test-panel').hidden,false);assert.equal(h.node('more-tools-panel').hidden,true);
  const admin=html.slice(html.indexOf('<div id="manager-test-panel"'),html.indexOf('<div id="more-tools-panel"'));
  assert.match(admin,/id="demo-issue"/);assert.match(admin,/id="demo-release"/);assert.doesNotMatch(admin,/id="demo-claim"/);
  const personal=html.slice(html.indexOf('<section id="personal-demo-panel"'),html.indexOf('<section class="card" aria-live="polite">',html.indexOf('<section id="personal-demo-panel"')));
  assert.match(personal,/id="demo-claim"/);assert.doesNotMatch(personal,/id="demo-(?:issue|release)"/);
  h.click('more-tab');assert.equal(h.node('manager-test-panel').hidden,true);assert.equal(h.node('more-tools-panel').hidden,false);assert.equal(h.sent.length,3);
});
test('missing login or proof keeps business sections and nav closed, while diagnostics remain accessible', async () => {
  for (const options of [{ loggedIn: false }, { proof: '' }]) {
    const h = await harness(options); assert.equal(h.node('workforce-tabs').hidden, true);
    assert.equal(h.node('punch-section').hidden, true); assert.equal(h.diagnostics.open, true); assert.equal(h.sent.length, 0);
    h.click('manager-tab'); assert.equal(h.node('staff-section').hidden, true); assert.equal(h.node('maintenance-section').hidden, true);
  }
});
test('signed closed-reception response stays closed through view changes and does not create a punch', async () => {
  const h = await harness(); h.click('punch-check'); assert.equal(h.sent.length, 2);
  await h.replyPunch('PUNCH_DISABLED'); h.click('manager-tab'); h.click('employee-tab');
  assert.equal(h.node('punch-status').textContent, '打刻受付は停止中です。');
  for (const id of ['punch-in', 'punch-out', 'punch-break-start', 'punch-break-end']) assert.equal(h.node(id).hidden, true);
  assert.equal(h.sent.length, 3); assert.equal(h.sent[1].action, 'bridgeGetPunchReadiness');assert.equal(h.sent[2].action,'bridgeGetAttendanceJournalV2');
});
test('layout source cannot send, store, authorize, expose secret values or overwrite controller controls', () => {
  assert.ok(!/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|liff|crypto|submit|confirm)\s*[.(]/.test(layout));
  assert.ok(!/\.value\s*=|\.textContent\s*=/.test(layout));
  assert.match(layout,/tab\.disabled=!adminAllowed/);
  assert.ok(html.indexOf('id="punch-section"') < html.indexOf('id="daily-summary-section"'));
  assert.ok(html.indexOf('id="work-state-section"') > html.indexOf('<details class="diagnostics">'));
  assert.match(html, /id="staff-issued-code"[^>]*readonly/);
});
test('employee cannot click or keyboard into management and a thousand tab attempts send no extra requests',async()=>{
  const h=await harness();await h.replyAccess('TLH_ADMIN_REQUIRED');
  for(let i=0;i<1000;i++){h.click('manager-tab');h.key('records-tab','ArrowRight');}
  assert.equal(h.node('manager-tab').disabled,true);assert.equal(h.node('manager-tools-panel').hidden,true);
  assert.equal(h.node('manager-registration-panel').hidden,true);assert.equal(h.node('admin-demo-panel').hidden,true);
  assert.equal(h.focused(),'more-tab');assert.equal(h.sent.length,2);
});
