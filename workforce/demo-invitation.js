/**
 * 【D9/D10 controller / 現役】責務: ダミー登録・招待受取り・解除の明示操作と応答認証。
 * 消すとD9/D10が使えない。古い診断・Sheetデータは変わらない。
 * 構成: 乱数→HMAC検証→一回用通信状態→画面更新。
 * 拡張: 実在従業員への招待共有/URL/個人情報表示は未対応。別設計にする。
 * tokenはメモリのみ。再読込は新規発行で旧PENDINGを失効。期限30分。
 * HMACは応答の偽装対策で認可ではない。GASが毎回LINEとroleを再検証する。
 * 概念: event-driven controller / request correlation / message authentication。
 * 初歩: pendingは通信中request、awaitは暗号検査の完了待ち。textContentは文字だけ表示。
 * 検証: tests/workforce-invitation.test.mjs→Actions→LINE実機。GAS側も同時に変更する。
 * 改造箇所: messages/verifyResponse/initはBridgeEmployeeInvitation/両ダミーServiceと同期。
 * 実社員招待はD11 staff-enrollment.js。ダミー条件を解除して流用しない。
 */
(function(global) {
  'use strict';
  const TYPE = 'TLH_BRIDGE_DEMO_INVITATION';
  const messages = Object.freeze({
    INVITATION_READY: 'ダミー従業員を事前登録しました。招待は30分間有効です。',
    DEMO_EMPLOYEE_LINKED: 'ダミー従業員とあなたのTLHアカウントの紐付けが完了しました。',
    ALREADY_CLAIMED: 'この招待は受取り済みです。重複登録はしていません。',
    DEMO_RELEASED: '試験用ダミーの従業員情報と従業員権限を停止しました。管理者権限と履歴は残しています。',
    DEMO_ALREADY_RELEASED: '試験用ダミーは解除済みです。追加の変更はしていません。',
    NO_LINKED_DEMO: '解除対象の紐付け済みダミーがありません。変更はしていません。',
    DEMO_NOT_OWNED: 'このダミーはあなたのアカウントに紐付いていません。変更はしていません。',
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
  /**
   * @param {number} size 生成する乱数のバイト数。16は32hex、32は64hexになる。
   * @return {string} 暗号用乱数の小文字hex。Web Crypto非対応/不正sizeは例外になり得る。
   * nonce/応答鍵/招待秘密をMath.randomや時刻へ置換しない。生成長変更はGASの形式検査とテストを同期する。
   */
  function randomHex(size) {
    return Array.from(crypto.getRandomValues(new Uint8Array(size)),
      function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  /**
   * @param {Object} data 受信結果。type/nonce/action/許可code/macと署名を照合する。
   * @param {Object} request ページメモリにある、その通信のnonce/action/responseKey。
   * @return {Promise<boolean>} 要求対応とHMAC一致ならtrue、形式/照合不一致ならfalse。
   * Crypto失敗はrejectしmessage側で処理する。dataだけで管理者権限を証明する処理ではない。
   * 鍵はhex文字列をUTF-8文字として使う契約。GASと違う生バイト変換を片側だけ追加しない。
   * 変更はBridgeEmployeeInvitationと両repoの偽装/遅延応答テストを同期する。
   */
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
  /**
   * @param {{liff:Object,gasUrl:string}} options index.htmlからのLIFFと公開GAS接続設定。
   * @return {undefined} DOM/イベントを結ぶだけ。必須DOMの欠落は初期化エラーになり得る。
   * tokenは招待秘密、pendingは通信、ready/completed/releasedはUI状態。いずれもGASの認可証明ではない。
   * timeout再送は同じ招待秘密を保ち、nonce/応答鍵は新しくする。解除は再読込後も秘密なしで依頼できる。
   * id/操作変更はHTML・Bridge・Service・テストも同期。ダミーを実社員の練習へ流用しない。
   */
  function init(options) {
    const issue = document.getElementById('demo-issue');
    const claim = document.getElementById('demo-claim');
    const release = document.getElementById('demo-release');
    const status = document.getElementById('demo-status');
    let token = null, pending = null, ready = false, completed = false;
    let released = false, blocked = false;
    function finish() {
      if (pending) clearTimeout(pending.timer);
      pending = null;
      issue.disabled = ready || completed || released || blocked;
      claim.disabled = !ready || completed || released || blocked;
      release.disabled = released || blocked;
    }
    async function send(action) {
      const releasing = action === 'bridgeReleaseDemoEmployee';
      if (pending || released || blocked || (completed && !releasing)) return;
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
      if (!releasing && !token) token = randomHex(32);
      const request = { action: action, nonce: randomHex(16), responseKey: randomHex(32) };
      pending = request;
      issue.disabled = true;
      claim.disabled = true;
      release.disabled = true;
      status.textContent = '処理中です。';
      request.timer = setTimeout(function() {
        if (pending !== request) return;
        status.textContent = '応答を確認できませんでした。同じボタンで再試行してください。';
        finish();
      }, 30000);
      const form = document.createElement('form');
      form.method = 'POST'; form.action = options.gasUrl; form.target = 'tlhDemoFrame';
      form.hidden = true;
      const fields = { action: action, nonce: request.nonce, responseKey: request.responseKey,
        idToken: idToken };
      // D10は元招待tokenを不要とする。本人・D9来歴をサーバーで照合する。
      if (!releasing) fields.inviteToken = token;
      Object.entries(fields).forEach(function(entry) {
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
        if (data.code === 'DEMO_RELEASED' || data.code === 'DEMO_ALREADY_RELEASED') {
          released = true; token = null;
        }
        if (data.code === 'D9_REVIEW_REQUIRED') { blocked = true; token = null; }
        finish();
      } catch (_error) { /* 検証できない応答は無視し、秘密を含む例外を表示しない。 */ }
    });
    issue.addEventListener('click', function() {
      send('bridgeIssueDemoInvitation').catch(function() {
        status.textContent = '安全な送信を開始できませんでした。'; finish();
      });
    });
    claim.addEventListener('click', function() {
      if (pending || blocked || completed || released) return;
      if (!global.confirm('あなたのTLHアカウントを「D9 ダミー従業員」に紐付けます。続けますか？')) return;
      send('bridgeClaimDemoInvitation').catch(function() {
        status.textContent = '安全な送信を開始できませんでした。'; finish();
      });
    });
    release.addEventListener('click', function() {
      if (pending || blocked || released) return;
      if (!global.confirm('試験用ダミーの従業員情報と従業員権限を停止します。管理者権限・TLHアカウント・履歴は残します。続けますか？')) return;
      send('bridgeReleaseDemoEmployee').catch(function() {
        status.textContent = '安全な送信を開始できませんでした。'; finish();
      });
    });
  }
  global.TlhDemoInvitation = Object.freeze({ init: init, verifyResponse: verifyResponse });
})(window);
