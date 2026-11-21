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
  let configured = false;
  let pending = null;
  const login = document.getElementById('line-login');
  const frame = document.getElementById('inventory-api-frame');
  const showLogin = () => {login.hidden = false;};
  const ready = (async () => {
    if (global !== global.top || global.location.origin !== 'https://tealabhokkaido.com' ||
        !config || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.apiUrl)) throw Error('NOT_CONFIGURED');
    const flow=global.TlhInventoryLogin;
    const callback=['/software/worktime/inventory/auth/return/','/software/worktime/inventory/auth/return/index.html'].includes(global.location.pathname);
    if(callback){
      const notice=document.getElementById('inventory-auth-status');
      if(flow?.isReturning?.()!==true||typeof flow.resume!=='function')return;
      const outcome=await flow.resume();
      if(stopped)return;
      if(outcome!=='ready'||global.location.pathname!=='/software/inventory/line-preview/'||!flow.getToken()){
        if(notice)notice.textContent=outcome==='redirecting'?'LINEの画面で本人確認を完了してください。':'LINE本人確認を完了できませんでした。在庫画面からもう一度お試しください。';
        return;
      }
      configured=true;login.hidden=true;
      document.body?.removeAttribute('data-inventory-auth-return');
      const start=()=>document.getElementById('refresh')?.click();
      if(typeof document.getElementById('refresh')?.onclick==='function')start();
      else document.addEventListener('DOMContentLoaded',start,{once:true});
      return;
    }
    if(!['/software/inventory/line-preview/','/software/inventory/line-preview/index.html'].includes(global.location.pathname))throw Error('NOT_CONFIGURED');
    configured=true;
    if(flow){if(!flow.getToken?.())showLogin();return;}
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
      // A redirect begins only from an explicit login click; no popup.
      if(!configured)await ready;
      if (stopped) return;
      if(uncertainTenant){status('店舗操作の結果が未確認です。画面を切り替える前に、同じ店舗操作の結果を確認してください。','TENANT_SAVE_UNKNOWN');return;}
      if(contextBusy||pending){status('処理中です。完了後にLINEでログインしてください。','BUSY');return;}
      if(global.TlhInventoryLogin){
        status('LINEで本人確認しています…');
        const finishLogin=global.TlhInventoryTiming?.start('login');
        let outcome;try{outcome=await global.TlhInventoryLogin.login();}finally{finishLogin?.();}
        if(stopped||outcome==='redirecting')return;login.hidden=true;document.getElementById('refresh').click();return;
      }
      await ready;
      if (global.liff.isInClient()) {
        global.location.href = 'https://miniapp.line.me/' + config.liffId + '/inventory/';
        return;
      }
      if (global.liff.isLoggedIn()) global.liff.logout();
      global.liff.login({redirectUri: global.location.origin + global.location.pathname});
    } catch (error) {
      status(error?.message==='LOGIN_POPUP_BLOCKED'
        ? 'LINE本人確認の画面を開けません。このサイトのポップアップを許可して、もう一度ログインしてください。'
        : 'LINEログインを開始できません。通信状態を確認して再読み込みしてください。',error?.message==='LOGIN_POPUP_BLOCKED'?'LOGIN_POPUP_BLOCKED':'LOGIN_UNAVAILABLE');
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

  const validStoreId=storeId=>typeof storeId==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(storeId);
  const signedTransientCodes=new Set(['BUSY','UNAVAILABLE','AUTH_UNAVAILABLE']);
  const transportTransientCodes=new Set(['RPC_TIMEOUT','RPC_FAILED','OFFLINE']);
  const storeDenialCodes=new Set(['FORBIDDEN','COMMON_MEMBERSHIP_REQUIRED','COMMON_SERVICE_PERMISSION_REQUIRED',
    'COMMON_SERVICE_NOT_ENABLED','COMMON_STORE_BINDING_NOT_FOUND','COMMON_STORE_BINDING_CONFLICT','PERSONAL_SPACE_CONFLICT']);
  function readScopeHint(command,storeId,identity){
    // The store ID only directs the next fresh ACCOUNT request; neither view nor access is cached.
    return ['READ','ACCOUNT'].includes(command)&&validStoreId(storeId)&&identity?{storeId,identity}:null;
  }

  function finish(error, value) {
    const current = pending;
    if (!current) return;
    pending = null;
    clearTimeout(current.timer);
    current.finishTiming?.();
    current.responseKey = '';
    if(error){
      const temporary=transportTransientCodes.has(error);
      invalidateStoreContext(temporary?readScopeHint(current.command,current.readStoreId,current.identitySession):null,temporary);
    }
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
      if (data.code === 'AUTH_REQUIRED') {
        global.TlhInventoryLogin?.clearToken?.();storeContext=null;selectedStore=null;
        clearStoreView();contextHost()?.replaceChildren();showLogin();
      }
      if (data.code !== 'OK') {
        if(current.command==='READ'||current.command==='ACCOUNT'||/^(COMMON_|AUTH_|ACCOUNT_|PERSONAL_SPACE_)/.test(data.code)||data.code==='FORBIDDEN'){
          const temporary=signedTransientCodes.has(data.code);
          const hint=temporary?readScopeHint(current.command,current.readStoreId,current.identitySession):null;
          const sameIdentity=current.identitySession===(global.TlhInventoryLogin?global.TlhInventoryLogin.getToken():global.liff?.getIDToken());
          if(sameIdentity&&current.readStoreId&&storeDenialCodes.has(data.code))explicitSelectionIdentity=current.identitySession;
          invalidateStoreContext(hint,temporary&&sameIdentity);
        }
        finish(null,{ok:false,code:data.code});return;
      }
      const value=JSON.parse(data.data);
      finish(null, {ok: true, value});
    } catch (_error) { /* 未検証の結果は表示せず、元の期限で失敗にする。 */ }
  });

  async function wireRequest(command, input = {}, expectedSession = null) {
    await ready;
    if (stopped) throw Error('PAGE_CLOSED');
    if(!configured)throw Error('LOGIN_UNAVAILABLE');
    if(command!=='ACCOUNT'||!input||Object.keys(input).length!==1||input.includeView!==true)throw Error('PREVIEW_READ_ONLY');
    if(pending)throw Error('BUSY');
    const idToken = global.TlhInventoryLogin?global.TlhInventoryLogin.getToken():global.liff.getIDToken();
    if(expectedSession!==null&&idToken!==expectedSession){invalidateStoreContext();throw Error('AUTH_REQUIRED');}
    if (!idToken || !global.TlhInventoryLogin&&!global.liff.isLoggedIn()) {invalidateStoreContext();showLogin(); throw Error('AUTH_REQUIRED');}
    const hint=readScopeHint(command,input.storeId,idToken);
    if(navigator.onLine===false){invalidateStoreContext(hint,true);throw Error('OFFLINE');}
    return new Promise((resolve, reject) => {
      const current = {command, readStoreId:hint?.storeId??null, identitySession:idToken, nonce: random(16), responseKey: random(32), resolve, reject};
      pending = current;
      if(['ACCOUNT','READ'].includes(command))current.finishTiming=global.TlhInventoryTiming?.start(command==='ACCOUNT'?'initial-read':'refresh-read');
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

  const recovery=null;
  global.addEventListener('pagehide', () => {
    stopped = true;finish('PAGE_CLOSED');login.hidden = true;explicitSelectionIdentity=null;storeContext=null;selectedStore=null;readRouteHint=null;contextIdentity=null;clearStoreView();contextHost()?.replaceChildren();
    for (const id of ['cards','logs','lines']) document.getElementById(id).replaceChildren();
    document.getElementById('status').textContent = '';
  });
  global.addEventListener('pageshow', event => {if (event.persisted) global.location.reload();});
  // 店舗選択はページ内だけに保持。選択したID自体は権限の証拠にならない。
  let storeContext=null, selectedStore=null, contextBusy=false, uncertainTenant=false, readRouteHint=null,contextIdentity=null,interruptedReceivingStore=null,explicitSelectionIdentity=null;
  const contextHost=()=>document.getElementById('inventory-stores');
  const node=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;n.dataset.tenant='true';return n;};
  const status=(text,code='')=>{if(global.TlhInventoryStatus)global.TlhInventoryStatus.show(text,code);else document.getElementById('status').textContent=text;};
  function invalidateStoreContext(hint=null,temporaryFailure=false){
    const token=global.TlhInventoryLogin?global.TlhInventoryLogin.getToken():global.liff?.getIDToken();
    // This preserves only the same session's inactive receiving draft on a transient failure, never the view or authority.
    // Keep the identity witness even when selection is cleared so a later token change still scrubs that draft.
    const previousStore=selectedStore||interruptedReceivingStore;
    const sameIdentityHint=hint?.identity===token?hint:null;
    const transient=temporaryFailure&&Boolean(previousStore&&token&&contextIdentity===token&&(!sameIdentityHint||sameIdentityHint.storeId===previousStore));
    if(transient)interruptedReceivingStore=previousStore;
    storeContext=null;selectedStore=null;if(!transient)contextIdentity=null;
    readRouteHint=sameIdentityHint;clearStoreView(transient);contextHost()?.replaceChildren();
  }
  function readSelection(){
    const identity=global.TlhInventoryLogin?global.TlhInventoryLogin.getToken():global.liff?.getIDToken();
    if(explicitSelectionIdentity!==identity)explicitSelectionIdentity=null;
    if(readRouteHint&&readRouteHint.identity!==identity||contextIdentity&&contextIdentity!==identity)invalidateStoreContext();
    return selectedStore||readRouteHint?.storeId||null;
  }
  function clearStoreView(transient=false){
    if(!transient)interruptedReceivingStore=null;
    global.TlhInventoryView?.invalidate?.({transient});
    for(const id of ['cards','logs','lines','catalog-content','stock-workspaces','overview'])document.getElementById(id)?.replaceChildren();
  }
  global.TlhInventory = Object.freeze({sameTabVersion:1,check:()=>wireRequest('ACCOUNT',{includeView:true}).then(r=>({ok:r.ok,view:r.ok&&typeof r.value?.view?.storeId==='string',code:r.ok?'':r.code}))});
})(window);
