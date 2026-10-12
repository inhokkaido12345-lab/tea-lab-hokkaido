/**
 * 【D9 controller / 現役】責務: ダミー登録・自分への招待の明示操作と応答認証。
 * 消すとD9が使えない。古い診断・Sheetデータは変わらない。
 * 構成: 乱数→HMAC検証→一回用通信状態→画面更新。
 * 拡張: 実在従業員への招待共有/URL/個人情報表示は未対応。別設計にする。
 * tokenはメモリのみ。再読込は新規発行で旧PENDINGを失効。期限30分。
 * HMACは応答の偽装対策で認可ではない。GASが毎回LINEとroleを再検証する。
 * 概念: event-driven controller / request correlation / message authentication。
 * 初歩: pendingは通信中request、awaitは暗号検査の完了待ち。textContentは文字だけ表示。
 * 検証: tests/workforce-invitation.test.mjs→Actions→LINE実機。GAS側も同時に変更する。
 */
(function(global) {
  'use strict';
  const TYPE = 'TLH_BRIDGE_DEMO_INVITATION';
  const messages = Object.freeze({
    INVITATION_READY: 'ダミー従業員を事前登録しました。招待は30分間有効です。',
    DEMO_EMPLOYEE_LINKED: 'ダミー従業員とあなたのTLHアカウントの紐付けが完了しました。',
    ALREADY_CLAIMED: 'この招待は受取り済みです。重複登録はしていません。',
    TLH_ADMIN_REQUIRED: '管理者権限が必要です。',
    TLH_ACCOUNT_REQUIRED: 'TLHアカウントの登録が必要です。',
    LINE_VERIFY_REJECTED: 'LINE本人確認が失敗しました。LINEから開き直してください。',
    DEMO_ALREADY_LINKED_OR_REVIEW: 'ダミーは紐付け済み、または管理者確認が必要です。',
    INVITATION_NOT_AVAILABLE: '招待が期限切れ・失効済み、または利用できません。',
    EMPLOYEE_ALREADY_EXISTS: '既存の従業員登録があるため、ダミーを紐付けませんでした。',
    D9_REVIEW_REQUIRED: '記録の整合性確認が必要です。操作を止めて開発担当に知らせてください。',
    D9_BUSY: '別の登録処理中です。同じボタンで再試行してください。',
    D9_UNAVAILABLE: '処理を完了できませんでした。同じボタンで再試行してください。',
    INVALID_REQUEST: '送信内容を確認できませんでした。',
  });
  function randomHex(size) {
    return Array.from(crypto.getRandomValues(new Uint8Array(size)),
      function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  async function verifyResponse(data, request) {
    if (!data || !request || data.type !== TYPE || data.nonce !== request.nonce ||
        data.action !== request.action || !Object.hasOwn(messages, data.code) ||
        typeof data.mac !== 'string' || !/^[a-f0-9]{64}$/.test(data.mac)) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(request.responseKey),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const mac = Uint8Array.from(data.mac.match(/../g), function(pair) { return parseInt(pair, 16); });
    return crypto.subtle.verify('HMAC', key, mac,
      encoder.encode([TYPE, data.nonce, data.action, data.code].join('\n')));
  }
  function init(options) {
    const issue = document.getElementById('demo-issue');
    const claim = document.getElementById('demo-claim');
    const status = document.getElementById('demo-status');
    let token = null, pending = null, ready = false, completed = false;
    function finish() {
      if (pending) clearTimeout(pending.timer);
      pending = null;
      issue.disabled = ready || completed;
      claim.disabled = !ready || completed;
    }
    async function send(action) {
      if (pending || completed) return;
      if (!crypto.subtle || global !== global.top) {
        status.textContent = '安全な通信を開始できません。LINEから開き直してください。';
        return;
      }
      if (action === 'bridgeClaimDemoInvitation' && !ready) return;
      const idToken = options.liff && options.liff.getIDToken();
      if (typeof idToken !== 'string' || !idToken) {
        status.textContent = 'LINE本人確認情報がありません。LINEから開き直してください。';
        return;
      }
      // tokenはリトライ時に固定。再送で招待を複数発行しない。
      if (!token) token = randomHex(32);
      const request = { action: action, nonce: randomHex(16), responseKey: randomHex(32) };
      pending = request;
      issue.disabled = true;
      claim.disabled = true;
      status.textContent = '処理中です。';
      request.timer = setTimeout(function() {
        if (pending !== request) return;
        status.textContent = '応答を確認できませんでした。同じボタンで再試行してください。';
        finish();
      }, 30000);
      const form = document.createElement('form');
      form.method = 'POST'; form.action = options.gasUrl; form.target = 'tlhDemoFrame';
      form.hidden = true;
      Object.entries({ action: action, nonce: request.nonce, responseKey: request.responseKey,
        idToken: idToken, inviteToken: token }).forEach(function(entry) {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = entry[0]; input.value = entry[1];
        form.appendChild(input);
      });
      document.body.appendChild(form);
      try { form.submit(); }
      catch (_error) { status.textContent = '送信できませんでした。'; finish(); }
      finally { form.remove(); }
    }
    global.addEventListener('message', async function(event) {
      const request = pending;
      // Googleの入れ子iframeではsourceが直下frameと一致しないためHMACも必須。
      if (!request || !(event.origin === 'null' ||
          /^https:\/\/(?:[a-z0-9-]+\.)*(?:googleusercontent|google)\.com$/.test(event.origin))) return;
      try {
        // await中のタイムアウト/次request/複数messageも再検査。
        const data = { type: event.data && event.data.type, nonce: event.data && event.data.nonce,
          action: event.data && event.data.action, code: event.data && event.data.code,
          mac: event.data && event.data.mac };
        if (!await verifyResponse(data, request) || pending !== request) return;
        status.textContent = messages[data.code];
        if (data.code === 'INVITATION_READY') ready = true;
        if (data.code === 'DEMO_EMPLOYEE_LINKED' || data.code === 'ALREADY_CLAIMED') {
          completed = true; token = null;
        }
        if (data.code === 'D9_REVIEW_REQUIRED') { completed = true; token = null; }
        finish();
      } catch (_error) { /* 検証できない応答は無視し、秘密を含む例外を表示しない。 */ }
    });
    issue.addEventListener('click', function() {
      send('bridgeIssueDemoInvitation').catch(function() {
        status.textContent = '安全な送信を開始できませんでした。'; finish();
      });
    });
    claim.addEventListener('click', function() {
      if (!global.confirm('あなたのTLHアカウントを「D9 ダミー従業員」に紐付けます。続けますか？')) return;
      send('bridgeClaimDemoInvitation').catch(function() {
        status.textContent = '安全な送信を開始できませんでした。'; finish();
      });
    });
  }
  global.TlhDemoInvitation = Object.freeze({ init: init, verifyResponse: verifyResponse });
})(window);
