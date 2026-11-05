/**
 * 通信表示: aria-busyを実pendingに同期し、CSSだけで回す。成功/失敗/timeout後は停止。認可/送信条件は不変。
 * 現役・本人情報の表示。index.htmlのその他/単独account-info.html→LINE証明をPOST→署名付きDTO→textContent。
 * 削除影響: 本人情報の読取だけ停止。勤怠/アカウントの保存や認可は変えない。
 * 概念: authenticated read model / allowlist / request correlation。initだけでは通信しない。
 * 魔改造: parseInfo/renderをGAS AccountInfoService/BridgeAccountInfo/両repoテスト/ACCOUNT-INFO.mdと同期。
 * 境界: 対象はサーバーが本人へ固定。token/個人情報/鍵をURL/Storage/ログへ出さず、画面退場時に消す。
 * 検証: account-info.test.mjs→実GAS連結→LINE本人の読取。表示した役割を管理APIの認可へ流用しない。
 * 再ログイン: 公式検証の署名付き拒否/証明なしで入口を再表示。本人クリックでだけSDKをlogout→login。
 * isLoggedIn=trueでもID tokenの有効性は別。勝手な認証延長・自動logout・業務の自動再送は禁止。
 * 起動: bootstrapはLINE準備後にloadを1回直接呼ぶ。単独読取画面なのでボタンクリックのqueueへ委ねない。
 * 改造: loadは初回/手動更新の共通入口。pendingのaria-busyをbootstrapのfinallyで上書きしない。
 * ホーム: initだけを既存LIFFで呼び、loadVisiblePane→auto-readのaccountキーで初回取得。SDKを二重初期化しない。
 * 削除/拡張: 両HTMLのaccount-info-*とiframe名、ホームの読込順・タブ初回/再訪/失敗の検査を同期する。
 */
(function(global){
  'use strict';
  const config=Object.freeze({liffId:'2011940133-JXUDzLnG',gasUrl:'https://script.google.com/macros/s/AKfycbz12iRGRd1FSnmYLmfYR7ZhxNvt37LM7dXjKIqnVIaJ_Bw0B6N_YZIYIVxabp92E7PG7w/exec'});
  const TYPE='TLH_BRIDGE_ACCOUNT_INFO',ACTION='bridgeGetAccountInfo';
  const messages=Object.freeze({ACCOUNT_INFO_READY:'登録情報を読み込みました。',ACCOUNT_INFO_NOT_REGISTERED:'このLINEに対応するTLHアカウントはまだ登録されていません。',
    ACCOUNT_INFO_UNAVAILABLE:'登録情報を取得できません。管理者に確認してください。',ACCOUNT_INFO_REVIEW_REQUIRED:'登録情報の確認が必要です。管理者にお知らせください。',
    ACCOUNT_INFO_LOGIN_REQUIRED:'LINEでログインし直してください。',ACCOUNT_INFO_BUSY:'別の処理中です。少し待ってから確認してください。',ACCOUNT_INFO_INVALID:'確認リクエストを受け付けられませんでした。'});
  const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('');
  const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
  const day=value=>typeof value==='string'&&(value===''||/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);
  /** 許可項目だけのDTOを受ける。署名が正しくても未知の構造/日付/role型は表示しない。 */
  function parseInfo(text){
    if(typeof text!=='string'||text.length>8192)return null;let value;try{value=JSON.parse(text);}catch(_e){return null;}
    if(!exact(value,['version','tlhAccountId','accountStatus','currentLoginProvider','linkedProviders','employee','permissions'])||value.version!==1||
      typeof value.tlhAccountId!=='string'||!/^[-A-Za-z0-9_]{1,96}$/.test(value.tlhAccountId)||value.accountStatus!=='ACTIVE'||value.currentLoginProvider!=='LINE'||
      !Array.isArray(value.linkedProviders)||!value.linkedProviders.length||value.linkedProviders.length>8||new Set(value.linkedProviders).size!==value.linkedProviders.length||
      !value.linkedProviders.includes('LINE')||value.linkedProviders.some(p=>typeof p!=='string'||!/^[A-Z][A-Z0-9_]{0,31}$/.test(p))||
      !exact(value.permissions,['workforceEmployee','globalAdmin'])||typeof value.permissions.workforceEmployee!=='boolean'||typeof value.permissions.globalAdmin!=='boolean')return null;
    const e=value.employee;
    if(e!==null&&(!exact(e,['employeeCode','name','status','hireDate','terminationDate'])||typeof e.employeeCode!=='string'||!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(e.employeeCode)||
      typeof e.name!=='string'||!e.name||e.name.length>80||!['ACTIVE','INVITED','INACTIVE'].includes(e.status)||!day(e.hireDate)||!day(e.terminationDate)))return null;
    return value;
  }
  function related(source,frame){try{for(let i=0;source&&i<8;i++){if(source===frame)return true;const parent=source.parent;if(!parent||parent===source)return false;source=parent;}}catch(_e){}return false;}
  async function verify(d,r){
    if(!exact(d,['type','nonce','action','code','info','mac'])||d.type!==TYPE||d.action!==ACTION||d.nonce!==r.nonce||!Object.hasOwn(messages,d.code)||
      typeof d.info!=='string'||d.info.length>8192||d.code!=='ACCOUNT_INFO_READY'&&d.info!==''||typeof d.mac!=='string'||!/^[a-f0-9]{64}$/.test(d.mac))return false;
    const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(r.responseKey),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(d.mac.match(/../g),b=>parseInt(b,16)),enc.encode([TYPE,d.nonce,ACTION,d.code,d.info].join('\n')));
  }
  /** 表示の順序と日本語ラベルはここで変更。ddはtextContentだけで、氏名をHTMLとして挿入しない。 */
  function render(fields,info){
    const e=info.employee,rows=[['TLHアカウントID（問い合わせ用）',info.tlhAccountId],['アカウント状態','有効'],['現在のログイン方法','LINE'],
      ['連携済みの認証方法',info.linkedProviders.join(' / ')],['社員コード',e?e.employeeCode:'従業員登録なし'],['登録氏名',e?e.name:'従業員登録なし'],
      ['従業員登録の状態',e?({ACTIVE:'有効',INVITED:'招待待ち',INACTIVE:'停止済み'})[e.status]:'未登録'],['入社日',e?(e.hireDate||'未登録'):'未登録'],
      ['退職日',e?(e.terminationDate||'未登録'):'未登録'],['勤怠の従業員権限',info.permissions.workforceEmployee?'登録あり':'登録なし'],['管理者権限',info.permissions.globalAdmin?'登録あり':'登録なし']];
    fields.replaceChildren();for(const [label,value]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;fields.appendChild(dt);fields.appendChild(dd);}
  }
  /** 既存click経路で読取。bootstrapの自動表示/更新ボタンが同じ経路を使う。二重tap/timeout/別frame/退場後の遅延応答で情報を復活させない。 */
  function init(options){
    const n=Object.fromEntries(['check','status','result','fields','frame','login'].map(k=>[k,document.getElementById('account-info-'+k)]));let pending=null,stopped=false,loginPending=false,loginRequired=options.loginRequired===true;
    const clear=()=>{n.result.hidden=true;n.fields.replaceChildren();};
    const controls=()=>{n.status.setAttribute?.('aria-busy',String(!!pending||loginPending));n.check.disabled=!!pending||stopped||loginRequired||loginPending;if(n.login){n.login.hidden=!loginRequired||stopped;n.login.disabled=!!pending||loginPending||stopped;}};
    function finish(){if(pending)clearTimeout(pending.timer);pending=null;controls();}
    function requireLogin(){clear();loginRequired=true;controls();}
    // isLoggedIn()だけでは期限切れID tokenを解消できない。本人が押した時だけSDKの状態をリセットする。
    // 認証の判定は公式LINE/GASへ残す。再ログインしても失敗した読取や保存を自動再送しない。
    n.login?.addEventListener('click',()=>{
      if(stopped||!loginRequired||pending||loginPending)return;loginPending=true;clear();controls();
      try{
        if(options.liff.isInClient?.()){
          n.status.textContent='LINEアプリから開き直します。';global.location.assign('https://miniapp.line.me/2011940133-JXUDzLnG');return;
        }
        const redirectUri=global.TlhTenantSession?global.TlhTenantSession.loginRedirectUri():global.location.origin+global.location.pathname;
        n.status.textContent='LINEで再ログインします。完了するとこの画面へ戻ります。';
        if(options.liff.isLoggedIn())options.liff.logout();
        options.liff.login({redirectUri});
      }catch(_e){loginPending=false;n.status.textContent='LINEログインを開始できませんでした。もう一度お試しください。';controls();}
    });
    function load(){
      if(pending||stopped||loginRequired||loginPending)return;clear();
      if(global!==global.top||!crypto.subtle){n.status.textContent='安全な通信を開始できません。';return;}
      let proof;try{proof=options.liff.getIDToken();}catch(_e){}
      if(!proof){n.status.textContent='LINEログインが必要です。';requireLogin();return;}
      const r={nonce:random(16),responseKey:random(32)};pending=r;controls();n.status.textContent='登録情報を確認しています。';
      r.timer=setTimeout(()=>{if(pending!==r)return;clear();n.status.textContent='応答を確認できません。もう一度確認する場合は確認ボタンを押してください。';finish();},30000);
      const form=document.createElement('form');form.method='POST';form.action=options.gasUrl;form.target='tlhAccountInfoFrame';form.hidden=true;
      Object.entries({action:ACTION,idToken:proof,nonce:r.nonce,responseKey:r.responseKey}).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});
      document.body.appendChild(form);try{if(global.TlhCurrentWorkplace)global.TlhCurrentWorkplace.submit(form);else form.submit();}catch(_e){clear();n.status.textContent='登録情報を取得できませんでした。';finish();}finally{form.remove();}
    }
    n.check.addEventListener('click',load);
    global.addEventListener('message',async event=>{
      const r=pending;if(!r||!related(event.source,n.frame.contentWindow)||!(event.origin==='null'||event.origin==='https://script.google.com'||event.origin==='https://script.googleusercontent.com'||/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin)))return;
      let valid=false;try{valid=await verify(event.data,r);}catch(_e){}if(!valid||pending!==r)return;
      const d=event.data;if(d.code==='ACCOUNT_INFO_READY'){const info=parseInfo(d.info);if(!info)return;render(n.fields,info);n.result.hidden=false;}
      else clear();if(d.code==='ACCOUNT_INFO_LOGIN_REQUIRED')requireLogin();n.status.textContent=messages[d.code];finish();
    });
    global.addEventListener('pagehide',()=>{stopped=true;clear();finish();n.status.textContent='情報を消去しました。再確認する場合はページを開き直してください。';});clear();controls();
    return Object.freeze({load});
  }
  async function bootstrap(){
    const status=document.getElementById('account-info-status');let departed=false;
    global.addEventListener('pagehide',()=>{departed=true;});
    // 履歴復帰のGET再起動は維持。初回の本人読取は、この画面のcontrollerが直接開始する。
    global.TlhAutoRead.init();
    status.setAttribute?.('aria-busy','true');
    try{await global.liff.init({liffId:config.liffId});const loggedIn=global.liff.isLoggedIn();
      if(departed)return;
      status.textContent=loggedIn?'登録情報を自動取得します。':'LINEログインが必要です。';
      const viewer=init({liff:global.liff,gasUrl:config.gasUrl,loginRequired:!loggedIn});
      if(loggedIn)viewer.load(); // 保存しない本人読取だけ。更新ボタンは再取得/エラー後の再試行用。
    }catch(_e){if(!departed){status.textContent='LINEログインを準備できません。';status.setAttribute?.('aria-busy','false');}}
  }
  global.TlhAccountInfo=Object.freeze({init,parseInfo,verify,config});
  if(document.currentScript&&document.currentScript.dataset.bootstrap==='true')bootstrap();
})(window);
