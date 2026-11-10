/**
 * 現役PWA用通信: 同じWorkTimeのLINEログイン→署名付きform POST→既存在庫サービス。
 * 削除で独自ドメイン版だけ通信不能。GAS所有者版・原簿は別に維持される。
 * 概念: bearer authentication / signed message / per-request correlation。
 * 初歩: iframeはPOST結果の受信窓、nonceは要求の目印。どちらも従業員権限ではない。
 * 改造: 固定URL/型/署名順はemployee-bridgeと拒否試験を同期。別サイトへtokenを送らない。
 * 秘密: token/鍵/結果はページ内だけ。URL/Storage/console/キャッシュへ保存しない。
 * 検証: transport模擬試験→GitHub CI→外部ブラウザーで本人READ/停止者拒否/ホーム追加。
 */
(function(global) {
  'use strict';
  const config = global.TlhInventoryConfig;
  const random = size => Array.from(crypto.getRandomValues(new Uint8Array(size)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  let stopped = false;
  let pending = null;
  const login = document.getElementById('line-login');
  const frame = document.getElementById('inventory-api-frame');
  const showLogin = () => {login.hidden = false;};
  const ready = (async () => {
    if (global !== global.top || global.location.origin !== 'https://tealabhokkaido.com' ||
        !['/software/inventory/','/inventory/','/workforce/inventory/'].includes(global.location.pathname) ||
        !config || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.apiUrl)) throw Error('NOT_CONFIGURED');
    if(global.TlhInventoryLogin){showLogin();return;}
    if (!global.liff) throw Error('LOGIN_UNAVAILABLE');
    await Promise.race([global.liff.init({liffId: config.liffId}),
      new Promise((_, reject) => setTimeout(() => reject(Error('LOGIN_UNAVAILABLE')), 15000))]);
    if (stopped) throw Error('PAGE_CLOSED');
    if (!global.liff.isLoggedIn()) showLogin();
  })();
  // 初期化失敗を未処理Promiseにせず、request側が画面へ固定文言を返す。
  ready.catch(() => {});

  login.onclick = async () => {
    try {
      await ready;
      if (stopped) return;
      if(global.TlhInventoryLogin){
        await global.TlhInventoryLogin.login();
        if(stopped)return;login.hidden=true;document.getElementById('refresh').click();return;
      }
      if (global.liff.isInClient()) {
        global.location.href = 'https://miniapp.line.me/' + config.liffId + '/inventory/';
        return;
      }
      if (global.liff.isLoggedIn()) global.liff.logout();
      global.liff.login({redirectUri: global.location.origin + global.location.pathname});
    } catch (error) {
      document.getElementById('status').textContent = error?.message==='LOGIN_POPUP_BLOCKED'
        ? 'LINE本人確認の画面を開けません。このサイトのポップアップを許可して、もう一度ログインしてください。'
        : 'LINEログインを開始できません。通信状態を確認して再読み込みしてください。';
    }
  };

  function related(source) {
    try {
      for (let n = 0; source && n < 8; n++) {
        if (source === frame.contentWindow) return true;
        const parent = source.parent;
        if (!parent || parent === source) return false;
        source = parent;
      }
    } catch (_error) {}
    return false;
  }

  function finish(error, value) {
    const current = pending;
    if (!current) return;
    pending = null;
    clearTimeout(current.timer);
    current.responseKey = '';
    if (error) current.reject(Error(error)); else current.resolve(value);
  }

  global.addEventListener('message', async event => {
    const current = pending;
    if (!current || stopped || !related(event.source) ||
        !(event.origin === 'null' || event.origin === 'https://script.google.com' ||
          event.origin === 'https://script.googleusercontent.com' ||
          /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin))) return;
    const data = event.data;
    if (!data || Object.keys(data).sort().join(',') !== 'action,code,command,data,mac,nonce,type' ||
        data.type !== 'TLH_INVENTORY_V1' || data.action !== 'inventoryEmployeeV1' ||
        data.command !== current.command || data.nonce !== current.nonce ||
        typeof data.code !== 'string' || !/^[A-Z_]{2,80}$/.test(data.code) ||
        typeof data.data !== 'string' || data.data.length > 1000000 ||
        typeof data.mac !== 'string' || !/^[a-f0-9]{64}$/.test(data.mac)) return;
    try {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(current.responseKey),
        {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
      const text = [data.type,data.action,data.command,data.nonce,data.code,data.data].join('\n');
      const valid = await crypto.subtle.verify('HMAC', key,
        Uint8Array.from(data.mac.match(/../g), byte => parseInt(byte, 16)), encoder.encode(text));
      if (!valid || stopped || pending !== current) return;
      if (data.code === 'AUTH_REQUIRED') showLogin();
      if (data.code !== 'OK') {finish(null, {ok: false, code: data.code}); return;}
      finish(null, {ok: true, value: JSON.parse(data.data)});
    } catch (_error) { /* 未検証の結果は表示せず、元の期限で失敗にする。 */ }
  });

  async function request(command, input = {}) {
    await ready;
    if (stopped) throw Error('PAGE_CLOSED');
    if (navigator.onLine === false) throw Error('OFFLINE');
    if (!['READ','COMMAND'].includes(command) || pending) throw Error('BUSY');
    const idToken = global.TlhInventoryLogin?global.TlhInventoryLogin.getToken():global.liff.getIDToken();
    if (!idToken || !global.TlhInventoryLogin&&!global.liff.isLoggedIn()) {showLogin(); throw Error('AUTH_REQUIRED');}
    return new Promise((resolve, reject) => {
      const current = {command, nonce: random(16), responseKey: random(32), resolve, reject};
      pending = current;
      current.timer = setTimeout(() => finish('RPC_TIMEOUT'), 45000);
      const form = document.createElement('form');
      form.method = 'POST';form.action = config.apiUrl;form.target = frame.name;form.hidden = true;
      for (const [name, value] of Object.entries({action: 'inventoryEmployeeV1', command,
        idToken, input: JSON.stringify(input), nonce: current.nonce, responseKey: current.responseKey})) {
        const field = document.createElement('input');field.type = 'hidden';field.name = name;field.value = value;form.appendChild(field);
      }
      document.body.appendChild(form);
      try {form.submit();} catch (_error) {finish('RPC_FAILED');} finally {form.remove();}
    });
  }

  global.addEventListener('pagehide', () => {
    stopped = true;finish('PAGE_CLOSED');login.hidden = true;
    for (const id of ['cards','logs','lines']) document.getElementById(id).replaceChildren();
    document.getElementById('status').textContent = '';
  });
  global.addEventListener('pageshow', event => {if (event.persisted) global.location.reload();});
  global.TlhInventory = Object.freeze({request});
})(window);
