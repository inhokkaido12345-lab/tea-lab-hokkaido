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
        !['/software/inventory/','/inventory/','/workforce/inventory/'].includes(global.location.pathname) ||
        !config || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.apiUrl)) throw Error('NOT_CONFIGURED');
    configured=true;
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
      // 独立PWAではclickの同期処理中にpopupを開き、ブラウザーの操作許可を失わない。
      if(!configured)await ready;
      if (stopped) return;
      if(global.TlhInventoryLogin){
        await global.TlhInventoryLogin.login();
        if(stopped)return;login.hidden=true;document.getElementById('refresh').click();return;
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
      if (data.code === 'AUTH_REQUIRED') {
        global.TlhInventoryLogin?.clearToken?.();storeContext=null;selectedStore=null;
        clearStoreView();contextHost()?.replaceChildren();showLogin();
      }
      if (data.code !== 'OK') {finish(null, {ok: false, code: data.code}); return;}
      finish(null, {ok: true, value: JSON.parse(data.data)});
    } catch (_error) { /* 未検証の結果は表示せず、元の期限で失敗にする。 */ }
  });

  async function request(command, input = {}) {
    await ready;
    if (stopped) throw Error('PAGE_CLOSED');
    if (navigator.onLine === false) throw Error('OFFLINE');
    if (!['ACCOUNT','TENANT','READ','COMMAND'].includes(command) || pending) throw Error('BUSY');
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
    stopped = true;finish('PAGE_CLOSED');login.hidden = true;storeContext=null;selectedStore=null;clearStoreView();contextHost()?.replaceChildren();
    for (const id of ['cards','logs','lines']) document.getElementById(id).replaceChildren();
    document.getElementById('status').textContent = '';
  });
  global.addEventListener('pageshow', event => {if (event.persisted) global.location.reload();});
  // 店舗選択はページ内だけに保持。選択したID自体は権限の証拠にならない。
  let storeContext=null, selectedStore=null, contextBusy=false, uncertainTenant=false;
  const contextHost=()=>document.getElementById('inventory-stores');
  const node=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;n.dataset.tenant='true';return n;};
  const status=(text,code='')=>{if(global.TlhInventoryStatus)global.TlhInventoryStatus.show(text,code);else document.getElementById('status').textContent=text;};
  function clearStoreView(){
    for(const id of ['cards','logs','lines','catalog-content','stock-workspaces','overview'])document.getElementById(id)?.replaceChildren();
  }
  function renderStores(){
    const host=contextHost();if(!host||!storeContext)return;host.replaceChildren();
    const label=node('label','利用する店舗'),select=node('select');select.appendChild(new Option('店舗を選択してください',''));
    for(const store of storeContext.stores)select.appendChild(new Option(store.name,store.id));select.value=selectedStore||'';label.appendChild(select);host.appendChild(label);
    select.onchange=()=>{if(contextBusy||pending||uncertainTenant){select.value=selectedStore||'';return;}if(selectedStore&&select.value!==selectedStore&&!global.confirm('店舗を切り替えると、保存していない入力は消えます。切り替えますか？')){select.value=selectedStore;return;}selectedStore=select.value||null;clearStoreView();document.getElementById('refresh').click();};
    const details=node('details'),summary=node('summary','店舗を作成・招待コードで参加');details.appendChild(summary);host.appendChild(details);
    const name=node('input');name.placeholder='新しく作る店舗の名前';name.maxLength=100;details.appendChild(name);
    const create=node('button','新しい店舗を作成');create.onclick=()=>{if(!name.value.trim()){status('店舗名を入力してください。');return;}contextAction({action:'CREATE',storeId:'store-'+crypto.randomUUID(),name:name.value});};details.appendChild(create);
    const code=node('input');code.placeholder='管理者から受け取った招待コード';code.maxLength=48;details.appendChild(code);
    const join=node('button','招待された店舗に参加');join.onclick=()=>contextAction({action:'JOIN',code:code.value.trim()});details.appendChild(join);
    const owner=storeContext.stores.find(s=>s.id===selectedStore)?.role==='OWNER';
    if(owner){
      const manage=node('details');manage.appendChild(node('summary','この店舗のメンバー・招待'));host.appendChild(manage);
      const help=node('p','招待コードは7日間・1人1回限りです。参加させる人にだけ共有してください。WorkTimeの所属は変更しません。');manage.appendChild(help);
      const invite=node('button','メンバー招待コードを作る');invite.onclick=()=>{
        const value=random(24);contextAction({action:'INVITE',storeId:selectedStore,code:value},value);
      };manage.appendChild(invite);
      const read=node('button','メンバーと有効な招待を確認');read.onclick=async()=>{
        if(contextBusy)return;contextBusy=true;
        try{const reply=await request('ACCOUNT',{storeId:selectedStore});if(!reply.ok)throw Error();storeContext=reply.value;renderStores();}
        catch{status('メンバー情報を確認できませんでした。');}finally{contextBusy=false;}
      };manage.appendChild(read);
      for(const member of storeContext.members||[]){
        const row=node('p',member.name+' ／'+(member.role==='OWNER'?'管理者':'メンバー'));manage.appendChild(row);
        if(member.role!=='OWNER'){const remove=node('button','このメンバーの参加を解除');remove.onclick=()=>{if(global.confirm('この店舗の在庫情報へアクセスできなくなります。参加を解除しますか？'))contextAction({action:'REMOVE',storeId:selectedStore,userId:member.userId});};manage.appendChild(remove);}
      }
      for(const invite of storeContext.invitations||[]){const revoke=node('button','招待を無効にする（期限 '+invite.expiresAt.slice(0,10)+'）');revoke.onclick=()=>contextAction({action:'REVOKE',storeId:selectedStore,inviteId:invite.id});manage.appendChild(revoke);}
    }
  }
  async function contextAction(input,invitationCode){
    if(contextBusy||uncertainTenant)return;contextBusy=true;status('店舗情報を保存しています…');
    const command={...input,operationId:crypto.randomUUID()};
    try{
      const reply=await request('TENANT',command);
      if(!reply.ok){status(reply.code==='INVALID_INVITATION'?'招待コードが無効・使用済み・期限切れです。':reply.code==='FORBIDDEN'?'この操作を行う権限がありません。':'店舗情報を保存できませんでした。');return;}
      storeContext=reply.value;selectedStore=reply.value.storeId||selectedStore;renderStores();
      if(invitationCode){
        const output=node('p','招待コード（この画面を閉じると再表示できません）：'+invitationCode);contextHost()?.appendChild(output);
        status('招待を作成しました。コードを招待する人に共有してください。');
      }else{clearStoreView();document.getElementById('refresh').click();}
    }catch{
      uncertainTenant=true;
      status('店舗操作の結果を確認できません。同じ操作を確認するまで、作成や参加を繰り返さないでください。','TENANT_SAVE_UNKNOWN');
      const retry=node('button','同じ店舗操作の結果を確認');
      retry.onclick=async()=>{try{const reply=await request('TENANT',command);if(!reply.ok){status('操作を確認できませんでした。');return;}uncertainTenant=false;storeContext=reply.value;selectedStore=reply.value.storeId||selectedStore;renderStores();if(invitationCode)contextHost()?.appendChild(node('p','招待コード：'+invitationCode));else{clearStoreView();document.getElementById('refresh').click();}}catch{status('接続を確認して、同じ操作をもう一度確認してください。');}};
      contextHost()?.appendChild(retry);
    }finally{contextBusy=false;}
  }
  async function readView(){
    if(!storeContext){const reply=await request('ACCOUNT');if(!reply.ok)return reply;storeContext=reply.value;
      selectedStore=storeContext.stores.length===1?storeContext.stores[0].id:storeContext.stores.some(s=>s.id==='demo-shop')?'demo-shop':null;renderStores();}
    if(!selectedStore)return {ok:false,code:'STORE_SELECTION_REQUIRED'};
    const result=await request('READ',{storeId:selectedStore});
    if(result.code==='FORBIDDEN'){storeContext=null;selectedStore=null;clearStoreView();}
    return result;
  }

  // 未ログインは通常の開始状態。画面はこの時点ではACCOUNT/READを送らない。
  const requiresLogin=()=>Boolean(global.TlhInventoryLogin&&!global.TlhInventoryLogin.getToken());
  global.TlhInventory = Object.freeze({request,readView,requiresLogin});
})(window);
