/**
 * 通信表示: aria-busyを実pendingに同期し、CSSだけで回す。成功/失敗/timeout後は停止。認可/送信条件は不変。
 * 公開済み・受付OFFの復旧controller。本人申請 -> 所有者照合/別経路本人確認 -> 明示承認。
 * 流れ: 公式LIFF token -> POST iframe -> 直下/子孫source・origin・nonce/action/HMAC検査 -> 固定結果。
 * 削除影響: recovery.htmlだけ停止。既存勤怠/Account/保存済み履歴を変えない。
 * 概念: command adapter / immutable review / unknown outcome。表示は認可の代わりではない。
 * 改造: BridgeAccountRecoveryの署名順/固定codeと試験を同期。GAS/LIFF設定は既存画面と照合する。
 * 境界: token/コード/氏名/鍵をURL/ログ/Storageへ出さない。コピーは本人の明示操作だけ。
 * 検証: account-recovery.test.mjs。偽DOM/実WebCryptoと実ブラウザ/LINE本人操作は別。
 */
(function(global) {
  'use strict';
  const config = Object.freeze({ liffId: '2011940133-JXUDzLnG',
    gasUrl: 'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec' });
  const TYPE = 'TLH_BRIDGE_ACCOUNT_RECOVERY';
  const messages = Object.freeze({
    RECOVERY_CLOSED: '復旧受付は停止中です。',
    RECOVERY_REQUESTED: '申請を受け付けました。所有者の確認・承認待ちです。',
    RECOVERY_READY: '対象と申請を確認しました。本人確認と所有者の最終承認が必要です。',
    RECOVERY_APPROVED: '再連携が完了しました。旧LINEは停止し、勤怠履歴は維持しています。',
    RECOVERY_CANCELLED: '申請を取り消しました。再連携はしていません。',
    RECOVERY_REJECTED: '申請は拒否されました。再連携はしていません。',
    RECOVERY_EXPIRED: '申請の有効期限が切れています。',
    RECOVERY_NOT_FOUND: 'この申請を確認できません。',
    RECOVERY_INVALID_REQUEST: '社員番号・申請コードを確認してください。',
    RECOVERY_OWNER_REQUIRED: '最終確認・承認には所有者本人の権限が必要です。',
    RECOVERY_TARGET_MISMATCH: '申請と対象の登録情報が一致しません。',
    RECOVERY_PRIVILEGED_TARGET: 'この対象は通常スタッフの復旧では扱えません。',
    RECOVERY_LINE_ALREADY_LINKED: 'このLINEには既存の登録があるため、再連携できません。',
    RECOVERY_REQUEST_EXISTS: 'このLINEには確認中の申請があります。',
    RECOVERY_RATE_LIMITED: 'このLINEからの申請回数が上限に達しました。所有者へ連絡してください。',
    RECOVERY_CAPACITY_REACHED: '復旧記録の保管上限です。開発担当の確認が必要です。',
    RECOVERY_TARGET_CHANGED: '確認後に記録が変わりました。対象を確認し直してください。',
    RECOVERY_VERIFICATION_REQUIRED: '本人確認の方法と確認済みのチェックが必要です。',
    RECOVERY_PROCESSING: '処理結果の確認が必要です。承認を再送しないでください。',
    RECOVERY_REVIEW_REQUIRED: '記録の整合性確認が必要です。操作を止めて開発担当へ連絡してください。',
    WRITE_REVIEW_REQUIRED: '記録の整合性確認が必要です。操作を止めて開発担当へ連絡してください。',
    ENROLLMENT_BUSY: '別の処理が実行中です。',
    RECOVERY_UNAVAILABLE: '結果を確認できません。状態確認を行ってください。',
    LINE_VERIFY_REJECTED: 'LINE本人確認が失敗しました。ログインし直してください。',
  });
  const random = size => Array.from(crypto.getRandomValues(new Uint8Array(size)), b => b.toString(16).padStart(2, '0')).join('');
  /**
   * Google HTML Serviceの返信元は送信先iframeの子孫Windowになることがある。
   * 入力はMessageEvent.sourceと固定通信枠のWindowProxy。祖先に同枠があればtrue。
   * cross-originでも読めるparentだけを最大8段たどり、参照拒否/循環/別窓はfalse。
   * 消すと正規返信を拒否、無条件trueへ変えると別窓も候補になる。origin/HMAC検査も必ず併用。
   * Googleの構造変更時は回帰試験と実機を確認し、origin許可範囲を無制限に広げない。
   */
  function isResponseFrame(source, frameWindow) {
    try {
      for (let depth = 0; source && depth < 8; depth++) {
        if (source === frameWindow) return true;
        const parent = source.parent;
        if (!parent || parent === source) return false;
        source = parent;
      }
    } catch (_error) { /* Window参照を読めなければ署名検査へ進めない。 */ }
    return false;
  }
  async function verifyResponse(data, request) {
    if (!data || !request || data.type !== TYPE || data.nonce !== request.nonce || data.action !== request.action ||
        !Object.hasOwn(messages, data.code) || typeof data.code !== 'string' || typeof data.revision !== 'string' ||
        (data.code === 'RECOVERY_READY' ? request.action !== 'bridgeRecoveryInspect' || !/^[a-f0-9]{64}$/.test(data.revision) : data.revision !== '') ||
        typeof data.mac !== 'string' || !/^[a-f0-9]{64}$/.test(data.mac)) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(request.responseKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, Uint8Array.from(data.mac.match(/../g), b => parseInt(b, 16)),
      enc.encode([TYPE, data.nonce, data.action, data.code, data.revision].join('\n')));
  }
  function init(options) {
    const names = ['user-code','user-receipt','owner-code','owner-name','owner-receipt','method','verified','status',
      'frame','submit','status-check','cancel','inspect','approve','reject','copy'];
    const n = Object.fromEntries(names.map(name => [name, document.getElementById('recovery-' + name)]));
    let pending = null, review = null, userActive = false, uncertain = '', stopped = false;
    const writes = ['bridgeRecoverySubmit','bridgeRecoveryCancel','bridgeRecoveryApprove','bridgeRecoveryReject'];
    function controls() {n.status.setAttribute?.('aria-busy',String(!!pending));
      for (const key of ['submit','status-check','cancel','inspect','approve','reject']) n[key].disabled = !!pending;
      n.submit.disabled ||= userActive || !!uncertain || stopped;
      n.cancel.disabled ||= !userActive || !!uncertain || stopped;
      n.approve.disabled ||= !review || !n.verified.checked || !['PHONE','VIDEO','OTHER'].includes(n.method.value) || !!uncertain || stopped;
      n.reject.disabled ||= !review || !!uncertain || stopped;
      for (const key of ['owner-code','owner-name','owner-receipt']) n[key].disabled = !!pending || !!uncertain;
      n['user-code'].disabled = !!pending || userActive || !!uncertain;
      n['user-receipt'].readOnly = !!pending || userActive || !!uncertain;
    }
    function finish() { if (pending) clearTimeout(pending.timer); pending = null; controls(); }
    function invalidate() { review = null; n.verified.checked = false; controls(); }
    async function send(action, fields) {
      if (pending || (writes.includes(action) && (uncertain || stopped))) return;
      if (global !== global.top || !crypto.subtle) { n.status.textContent = '安全な通信を開始できません。'; return; }
      const idToken = options.liff && options.liff.getIDToken();
      if (typeof idToken !== 'string' || !idToken) { n.status.textContent = 'LINEログインが必要です。'; return; }
      const request = { action, fields: Object.freeze({ ...fields }), nonce: random(16), responseKey: random(32) };
      pending = request; controls(); n.status.textContent = '処理中です。';
      const unknown = () => {
        if (pending !== request) return;
        if (writes.includes(action)) uncertain = action;
        review = null; n.verified.checked = false;
        n.status.textContent = '応答を確認できません。操作を再送せず、状態を確認してください。';
        finish();
      };
      request.timer = setTimeout(unknown, 30000);
      const form = document.createElement('form');
      form.method = 'POST'; form.action = options.gasUrl; form.target = 'tlhRecoveryFrame'; form.hidden = true;
      Object.entries({ ...fields, action, idToken, nonce: request.nonce, responseKey: request.responseKey }).forEach(([name, value]) => {
        const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input);
      });
      document.body.appendChild(form);
      try { if(global.TlhTenantSession)global.TlhTenantSession.submit(form);else form.submit(); } catch (_error) { unknown(); } finally { form.remove(); }
    }
    n.submit.addEventListener('click', () => {
      if (pending || userActive || uncertain || stopped) return;
      if (!options.liff || !options.liff.getIDToken()) { n.status.textContent = 'LINEログインが必要です。'; return; }
      const employeeCode = n['user-code'].value.trim();
      if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(employeeCode) || employeeCode.startsWith('DEMO')) {
        n.status.textContent = messages.RECOVERY_INVALID_REQUEST; return;
      }
      if (!global.confirm('社員番号 ' + employeeCode + ' のLINE復旧を申請しますか？')) return;
      // 同じ受付秘密を維持。送信結果不明で新しい申請コードを作らない。
      const receipt = random(32); n['user-receipt'].value = receipt; userActive = true; controls();
      send('bridgeRecoverySubmit', { employeeCode, receipt });
    });
    n['status-check'].addEventListener('click', () => {
      const receipt = n['user-receipt'].value.trim();
      if (/^[a-f0-9]{64}$/.test(receipt)) send('bridgeRecoveryStatus', { receipt });
      else n.status.textContent = messages.RECOVERY_INVALID_REQUEST;
    });
    n.cancel.addEventListener('click', () => {
      if (pending || !userActive || uncertain || stopped || !global.confirm('この復旧申請を取り消しますか？')) return;
      send('bridgeRecoveryCancel', { receipt: n['user-receipt'].value.trim() });
    });
    n.inspect.addEventListener('click', () => {
      const receipt = n['owner-receipt'].value.trim();
      if (!/^[a-f0-9]{64}$/.test(receipt)) { n.status.textContent = messages.RECOVERY_INVALID_REQUEST; return; }
      review = null; n.verified.checked = false;
      send('bridgeRecoveryInspect', { receipt, employeeCode: n['owner-code'].value.trim(), expectedName: n['owner-name'].value });
    });
    for (const key of ['owner-code','owner-name','owner-receipt']) n[key].addEventListener('input', invalidate);
    n.verified.addEventListener('change', controls); n.method.addEventListener('change', controls);
    n.approve.addEventListener('click', () => {
      if (n.approve.disabled || !review || !global.confirm(review.employeeCode + ' / ' + review.expectedName + ' のLINE再連携を承認しますか？ 旧LINEは停止します。')) return;
      send('bridgeRecoveryApprove', { ...review, verificationConfirmed: 'true', method: n.method.value });
    });
    n.reject.addEventListener('click', () => {
      if (n.reject.disabled || !review || !global.confirm('この復旧申請を拒否しますか？')) return;
      send('bridgeRecoveryReject', { ...review });
    });
    n.copy.addEventListener('click', async () => {
      const text = n['user-receipt'].value.trim();
      if (!/^[a-f0-9]{64}$/.test(text)) return;
      try { await navigator.clipboard.writeText(text); n.status.textContent = '申請コードをコピーしました。'; }
      catch (_error) { n.status.textContent = 'コピーできませんでした。'; }
    });
    global.addEventListener('message', async event => {
      if(global.TlhTenantSession&&!await global.TlhTenantSession.acceptEvent(event))return;
      const request = pending;
      if (!request || !isResponseFrame(event.source, n.frame.contentWindow) ||
          !(['null','https://script.google.com','https://script.googleusercontent.com'].includes(event.origin) ||
            /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin))) return;
      let valid = false;
      try { valid = await verifyResponse(event.data, request); } catch (_error) { return; }
      if (!valid || pending !== request) return;
      const data = event.data;
      if (data.code === 'RECOVERY_READY') review = Object.freeze({ ...request.fields, revision: data.revision });
      else review = null;
      if (data.code === 'RECOVERY_REQUESTED') {
        userActive = true;
        if (uncertain === 'bridgeRecoverySubmit') uncertain = '';
      }
      if (['RECOVERY_APPROVED','RECOVERY_CANCELLED','RECOVERY_REJECTED','RECOVERY_EXPIRED'].includes(data.code)) {
        uncertain = ''; userActive = data.code === 'RECOVERY_APPROVED';
      }
      if (['RECOVERY_REVIEW_REQUIRED','WRITE_REVIEW_REQUIRED','RECOVERY_PROCESSING'].includes(data.code)) stopped = true;
      if (data.code === 'RECOVERY_UNAVAILABLE' && writes.includes(request.action)) uncertain = request.action;
      n.verified.checked = false;
      n.status.textContent = messages[data.code];
      finish();
    });
    for (const tab of ['user','owner']) document.getElementById('recovery-tab-' + tab).addEventListener('click', () => {
      for (const name of ['user','owner']) {
        document.getElementById('recovery-pane-' + name).hidden = name !== tab;
        document.getElementById('recovery-tab-' + name).setAttribute('aria-pressed', String(name === tab));
      }
    });
    global.addEventListener('pagehide', () => {
      if (pending) clearTimeout(pending.timer);
      pending = null; review = null; stopped = true; n.verified.checked = false;
      for (const key of ['user-receipt','owner-receipt','owner-name','user-code','owner-code']) n[key].value = '';
      n.status.textContent = 'ページを開き直して申請状態を確認してください。'; controls();
    });
    controls();
  }
  async function bootstrap() {
    const status = document.getElementById('recovery-status'), login = document.getElementById('recovery-login');
    status.setAttribute?.('aria-busy','true');
    try {
      await global.liff.init({ liffId: config.liffId });
      login.hidden = global.liff.isLoggedIn();
      status.textContent = login.hidden ? 'LINE本人確認の準備ができました。' : 'LINEログインが必要です。';
      login.addEventListener('click', () => global.liff.login({ redirectUri: global.TlhTenantSession?global.TlhTenantSession.loginRedirectUri():global.location.origin + global.location.pathname }));
      if(global.liff.isLoggedIn()&&global.TlhTenantSession&&!await global.TlhTenantSession.ready(global.liff))return;
      init({ liff: global.liff, gasUrl: config.gasUrl });
    } catch (_error) { status.textContent = 'LINEログインを準備できません。ページを開き直してください。'; } finally { status.setAttribute?.('aria-busy','false'); }
  }
  global.TlhAccountRecovery = Object.freeze({ init, verifyResponse, config });
  if (document.currentScript && document.currentScript.dataset.bootstrap === 'true') bootstrap();
})(window);
