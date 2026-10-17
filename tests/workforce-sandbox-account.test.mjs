/** 実試験controller+架空DOM/LIFFで、明示登録/HMAC/無再送/秘密消去を検査。実LINE描画/保存は別。
 * 削除時は試験だけの通信先分離と不明結果の回帰を失う。node --test tests/workforce-sandbox-account.test.mjs。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHmac } from 'node:crypto';
const source = fs.readFileSync(new URL('../workforce/sandbox/account.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../workforce/sandbox/index.html', import.meta.url), 'utf8');
const gasUrl = 'https://script.google.com/macros/s/trial_fixture/exec',
  fakeToken = 'headersegment.payloadsegment.signaturesegment',
  ticket = 'a'.repeat(64);
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
function harness(changes = {}) {
  const elements = new Map(),
    events = {},
    timers = new Map(),
    forms = [],
    posts = [];
  let next = 0,
    tokenReads = 0,
    initCalls = 0;
  for (const id of ['status', 'register', 'check', 'ticket', 'login']) {
    assert.match(html, new RegExp('id="' + id + '"'));
    elements.set(id, {
      value: '',
      disabled: true,
      hidden: id === 'login',
      textContent: '',
      dataset: {},
      events: {},
      addEventListener(n, f) {
        this.events[n] = f;
      },
    });
  }
  const liff = {
    init() {
      initCalls++;
      return Promise.resolve();
    },
    isLoggedIn: () => true,
    getIDToken() {
      tokenReads++;
      return fakeToken;
    },
    login() {
      events.loggedIn = true;
    },
    ...changes.liff,
  };
  const window = {
    crypto: webcrypto,
    document: {
      getElementById: (id) => elements.get(id),
      createElement(tag) {
        return {
          tag,
          children: [],
          appendChild(e) {
            this.children.push(e);
          },
          remove() {
            forms.splice(forms.indexOf(this), 1);
          },
          submit() {
            posts.push(Object.fromEntries(this.children.map((e) => [e.name, e.value])));
          },
        };
      },
      body: {
        appendChild(form) {
          forms.push(form);
        },
      },
    },
    liff,
    confirm: () => true,
    addEventListener(n, f) {
      events[n] = f;
    },
    setTimeout(f) {
      timers.set(++next, f);
      return next;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    ...changes.window,
  };
  window.top = changes.embedded ? {} : window;
  vm.runInNewContext(source, { window, Uint8Array, TextEncoder, Promise });
  window.TlhSandboxAccount.start({ liffId: '1234567890-fixture', gasUrl: changes.gasUrl ?? gasUrl });
  const response = (index = posts.length - 1, code = 'REGISTERED') => {
    const p = posts[index],
      data = { type: 'TLH_SANDBOX_ACCOUNT_RESULT', nonce: p.nonce, action: p.action, code };
    data.mac = createHmac('sha256', p.responseKey)
      .update([data.type, data.nonce, data.action, data.code].join('\n'))
      .digest('hex');
    return data;
  };
  return {
    window,
    elements,
    events,
    timers,
    forms,
    posts,
    response,
    get tokenReads() {
      return tokenReads;
    },
    get initCalls() {
      return initCalls;
    },
    click: (id) => elements.get(id).events.click(),
    setTicket: () => {
      elements.get('ticket').value = ticket;
    },
  };
}
test('LIFF initialization alone never sends proof; registration requires a valid code and explicit consent', async () => {
  const h = harness();
  await flush();
  assert.equal(h.initCalls, 1);
  assert.equal(h.posts.length, 0);
  assert.equal(h.tokenReads, 0);
  h.click('register');
  await flush();
  assert.equal(h.posts.length, 0);
  h.setTicket();
  h.window.confirm = () => false;
  h.click('register');
  await flush();
  assert.equal(h.posts.length, 0);
  h.window.confirm = () => true;
  h.click('register');
  await flush();
  assert.equal(h.posts.length, 1);
  assert.equal(h.forms.length, 0);
  assert.equal(h.elements.get('ticket').value, '');
  assert.deepEqual(
    Object.keys(h.posts[0]).sort(),
    ['action', 'idToken', 'nonce', 'operationId', 'responseKey', 'ticket'].sort()
  );
  assert.equal(h.posts[0].idToken, fakeToken);
  assert.equal(h.posts[0].ticket, ticket);
});
test('duplicate taps and register timeouts never automatically resubmit; the separate status action contains no code', async () => {
  const h = harness();
  await flush();
  h.setTicket();
  h.click('register');
  h.click('register');
  await flush();
  assert.equal(h.posts.length, 1);
  [...h.timers.values()][0]();
  h.click('register');
  await flush();
  assert.equal(h.posts.length, 1);
  h.click('check');
  await flush();
  assert.equal(h.posts.length, 2);
  assert.equal(h.posts[1].action, 'status');
  assert.equal(h.posts[1].ticket, '');
  assert.equal(h.posts[1].operationId, h.posts[0].operationId);
  assert.notEqual(h.posts[1].nonce, h.posts[0].nonce);
  assert.notEqual(h.posts[1].responseKey, h.posts[0].responseKey);
});
test('only exact authenticated DTO and matching origin/action/nonce can show registration success', async () => {
  const h = harness();
  await flush();
  h.setTicket();
  h.click('register');
  await flush();
  const good = h.response();
  for (const [data, origin] of [
    [{ ...good, mac: '0'.repeat(64) }, 'null'],
    [{ ...good, nonce: '0'.repeat(32) }, 'null'],
    [{ ...good, action: 'status' }, 'null'],
    [{ ...good, code: '<script>secret</script>' }, 'null'],
    [{ ...good, extra: 'secret' }, 'null'],
    [good, 'https://attacker.invalid'],
  ]) {
    await h.events.message({ data, origin });
    assert.doesNotMatch(h.elements.get('status').textContent, /登録済み|secret/);
  }
  await h.events.message({ data: good, origin: 'null' });
  assert.match(h.elements.get('status').textContent, /登録済み/);
  assert.equal(h.elements.get('register').disabled, true);
  assert.equal(h.elements.get('check').disabled, false);
});
test('late responses after timeout or page departure cannot replace a fresh status or restore pasted secrets', async () => {
  const h = harness();
  await flush();
  h.setTicket();
  h.click('register');
  await flush();
  const old = h.response();
  [...h.timers.values()][0]();
  h.click('check');
  await flush();
  await h.events.message({ data: old, origin: 'null' });
  assert.doesNotMatch(h.elements.get('status').textContent, /登録済み/);
  h.elements.get('ticket').value = ticket;
  h.events.pagehide();
  assert.equal(h.elements.get('ticket').value, '');
  assert.equal(h.timers.size, 0);
  await h.events.message({ data: h.response(), origin: 'null' });
  assert.doesNotMatch(h.elements.get('status').textContent, /登録済み/);
  h.events.pageshow({ persisted: true });
  h.click('register');
  h.click('check');
  await flush();
  assert.equal(h.posts.length, 2);
});
test('invalid connection, embedding, absent crypto, LIFF rejection, missing proof and late initialization stay closed', async () => {
  for (const options of [
    { gasUrl: '' },
    { gasUrl: 'https://attacker.invalid/' },
    { embedded: true },
    { window: { crypto: {} } },
    { liff: { init: () => Promise.reject(Error('secret')) } },
  ]) {
    const h = harness(options);
    await flush();
    assert.equal(h.elements.get('register').disabled, true);
    assert.equal(h.posts.length, 0);
    assert.doesNotMatch(h.elements.get('status').textContent, /secret/);
  }
  const noProof = harness({ liff: { getIDToken: () => null } });
  await flush();
  noProof.setTicket();
  noProof.click('register');
  await flush();
  assert.equal(noProof.posts.length, 0);
  let resolve;
  const slow = harness({
    liff: {
      init: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  });
  await flush();
  [...slow.timers.values()][0]();
  resolve();
  await flush();
  assert.equal(slow.elements.get('register').disabled, true);
});
test('login is explicit with a fixed redirect under the existing endpoint; no production commands or persistent secrets', async () => {
  const h = harness({ liff: { isLoggedIn: () => false } });
  await flush();
  assert.equal(h.elements.get('login').hidden, false);
  assert.equal(h.posts.length, 0);
  h.click('login');
  assert.equal(h.events.loggedIn, true);
  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|indexedDB|console\.|getDecodedIDToken|bridgePunch|bridgeCreateAccount|location\.(?:search|hash)\s*=/
  );
  assert.match(source, /https:\/\/tealabhokkaido\.com\/workforce\/sandbox\//);
  assert.doesNotMatch(html, /onload=|grantFirst|TLH_ACCOUNT_SIGNUP_ENABLED/);
});
