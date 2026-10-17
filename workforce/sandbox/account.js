/**
 * 【試験専用controller】責務: LIFF準備と本人の明示登録/読取。通常勤怠のcontrollerは呼ばない。
 * 構成: start -> 固定接続先/LIFF -> POST一回 -> HMAC検証 -> 固定状態表示。
 * 削除影響: 試験登録画面だけ停止。既存従業員/管理者tab/受付設定は変わらない。
 * 概念: async state machine / request correlation / authenticated DTO / uncertain result handling。
 * 初歩: Web Cryptoはブラウザ標準の乱数/暗号。nonceは通信ごとに変え、登録を自動再送しない。
 * 改造: private repoのSandboxLineApi/Repository/両repoテスト/手順書も同時更新する。
 * 境界: token/コード/鍵はPOST中のメモリだけ。URL/ログ/storageへ書かず、decoded profileを本人証明にしない。
 * 検証: 実HTML+代用品試験 -> Pages -> 実LINE登録/再照会/監査。表示成功だけで保存成功としない。
 */
(function (global) {
  'use strict';
  const TYPE = 'TLH_SANDBOX_ACCOUNT_RESULT';
  const messages = Object.freeze({
    REGISTERED: '試験用TLHアカウントを登録済みです。従業員・管理者権限は付与していません。',
    NOT_REGISTERED: 'このLINEの試験用TLHアカウントは未登録です。',
    TICKET_UNAVAILABLE: '試験登録コードは未発行・期限切れ、または利用できません。',
    LINE_REJECTED: 'LINE本人確認ができませんでした。LINEから開き直してください。',
    REVIEW_REQUIRED: '保存状態の確認が必要です。再登録せず担当者へ知らせてください。',
    BUSY: '他の操作中です。登録状態を確認してください。',
    INVALID_REQUEST: '送信内容を確認できませんでした。',
    UNAVAILABLE: '結果を確認できませんでした。登録状態を確認してください。',
  });
  function randomHex(size) {
    return Array.from(global.crypto.getRandomValues(new Uint8Array(size)), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');
  }
  /** 固定5項目と通信ごとのHMACを検証。成功codeだけで権限を推測しない。 */
  async function verify(data, request) {
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      Object.keys(data).sort().join('|') !== 'action|code|mac|nonce|type' ||
      data.type !== TYPE ||
      data.nonce !== request.nonce ||
      data.action !== request.action ||
      typeof data.code !== 'string' ||
      !Object.hasOwn(messages, data.code) ||
      typeof data.mac !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.mac)
    )
      return false;
    const enc = new TextEncoder(),
      key = await global.crypto.subtle.importKey(
        'raw',
        enc.encode(request.responseKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
    const bytes = Uint8Array.from(data.mac.match(/../g), (pair) => parseInt(pair, 16));
    return global.crypto.subtle.verify(
      'HMAC',
      key,
      bytes,
      enc.encode([TYPE, data.nonce, data.action, data.code].join('\n'))
    );
  }
  /** 初期化だけではGASへtokenを送らない。LIFF完了前にSDKのURL/queryを変更しない。 */
  function start(options) {
    const doc = global.document,
      status = doc.getElementById('status'),
      register = doc.getElementById('register'),
      check = doc.getElementById('check');
    const ticket = doc.getElementById('ticket'),
      login = doc.getElementById('login');
    let ready = false,
      pending = null,
      attempted = false,
      disposed = false,
      sequence = 0,
      operationId = null,
      initTimer = null;
    const validUrl =
      typeof options.gasUrl === 'string' &&
      /^https:\/\/script\.google\.com\/(?:macros\/s|a\/macros\/tealabhokkaido\.com\/s)\/[A-Za-z0-9_-]+\/exec$/.test(
        options.gasUrl
      );
    const text = (value, error = false) => {
      status.textContent = value;
      status.dataset.error = String(error);
    };
    function controls() {
      register.disabled = !ready || !!pending || attempted || disposed;
      check.disabled = !ready || !!pending || disposed;
    }
    function finish(request) {
      if (pending !== request) return;
      global.clearTimeout(request.timer);
      pending = null;
      request.responseKey = '';
      controls();
    }
    function cleanup() {
      disposed = true;
      sequence++;
      ready = false;
      ticket.value = '';
      global.clearTimeout(initTimer);
      if (pending) finish(pending);
      controls();
    }
    async function send(action) {
      if (!ready || pending || disposed || (action === 'register' && attempted)) return;
      const code = action === 'register' ? ticket.value.trim() : '';
      if (action === 'register' && !/^[a-f0-9]{64}$/.test(code)) {
        text('試験登録コードを確認してください。', true);
        return;
      }
      if (
        action === 'register' &&
        !global.confirm(
          '空の試験環境に、あなたのLINEに対応するTLHアカウントを1件登録します。従業員・管理者権限は付与しません。'
        )
      )
        return;
      let idToken;
      try {
        idToken = global.liff.getIDToken();
      } catch (_error) {
        text(messages.LINE_REJECTED, true);
        return;
      }
      if (
        typeof idToken !== 'string' ||
        idToken.length < 20 ||
        idToken.length > 8192 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)
      ) {
        text(messages.LINE_REJECTED, true);
        return;
      }
      let request;
      try {
        operationId = operationId || randomHex(16);
        request = { action, nonce: randomHex(16), responseKey: randomHex(32), sequence: ++sequence };
      } catch (_error) {
        text(messages.UNAVAILABLE, true);
        return;
      }
      if (action === 'register') attempted = true;
      pending = request;
      controls();
      text('確認中です。');
      request.timer = global.setTimeout(() => {
        if (pending !== request) return;
        text('応答を確認できませんでした。再登録せず、登録状態を確認してください。', true);
        finish(request);
      }, 30000);
      const form = doc.createElement('form');
      form.method = 'POST';
      form.action = options.gasUrl;
      form.target = 'sandboxAccountFrame';
      form.hidden = true;
      const fields = {
        action,
        nonce: request.nonce,
        responseKey: request.responseKey,
        operationId,
        idToken,
        ticket: code,
      };
      try {
        for (const [name, value] of Object.entries(fields)) {
          const input = doc.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.appendChild(input);
        }
        doc.body.appendChild(form);
        form.submit();
      } catch (_error) {
        text(messages.UNAVAILABLE, true);
        finish(request);
      } finally {
        form.remove();
        idToken = null;
        fields.idToken = '';
        fields.ticket = '';
        ticket.value = '';
      }
    }
    global.addEventListener('message', async (event) => {
      const request = pending;
      if (
        !request ||
        disposed ||
        !(
          event.origin === 'null' ||
          event.origin === 'https://script.google.com' ||
          /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)
        )
      )
        return;
      try {
        const data = event.data;
        if (
          !(await verify(data, request)) ||
          pending !== request ||
          disposed ||
          request.sequence !== sequence
        )
          return;
        text(messages[data.code], !['REGISTERED', 'NOT_REGISTERED'].includes(data.code));
        if (data.code === 'REGISTERED') attempted = true;
        finish(request);
      } catch (_error) {
        /* 未検証の返答や内部例外を表示しない。timeoutで読取確認へ戻る。 */
      }
    });
    register.addEventListener('click', () =>
      send('register').catch(() => {
        text(messages.UNAVAILABLE, true);
        if (pending) finish(pending);
      })
    );
    check.addEventListener('click', () =>
      send('status').catch(() => {
        text(messages.UNAVAILABLE, true);
        if (pending) finish(pending);
      })
    );
    login.addEventListener('click', () => {
      if (disposed || !global.liff) return;
      try {
        global.liff.login({ redirectUri: 'https://tealabhokkaido.com/workforce/sandbox/' });
      } catch (_error) {
        text(messages.LINE_REJECTED, true);
      }
    });
    global.addEventListener('pagehide', cleanup);
    global.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        text('LINEから画面を開き直してください。', true);
        controls();
      }
    });
    controls();
    if (global !== global.top || !global.crypto?.subtle) {
      text('安全な通信を開始できません。LINEから開き直してください。', true);
      return;
    }
    if (!validUrl) {
      text('試験用の接続準備中です。', true);
      return;
    }
    if (!global.liff?.init) {
      text(messages.LINE_REJECTED, true);
      return;
    }
    let expired = false;
    initTimer = global.setTimeout(() => {
      expired = true;
      text('LINEの準備を確認できませんでした。開き直してください。', true);
    }, 15000);
    Promise.resolve()
      .then(() => global.liff.init({ liffId: options.liffId }))
      .then(() => {
        if (disposed || expired) return;
        global.clearTimeout(initTimer);
        if (!global.liff.isLoggedIn()) {
          login.hidden = false;
          text('LINEログインが必要です。');
          return;
        }
        ready = true;
        text('試験用アカウントは、登録状態を確認してください。');
        controls();
      })
      .catch(() => {
        if (disposed || expired) return;
        global.clearTimeout(initTimer);
        text(messages.LINE_REJECTED, true);
      });
  }
  global.TlhSandboxAccount = Object.freeze({ start, verify });
})(window);
