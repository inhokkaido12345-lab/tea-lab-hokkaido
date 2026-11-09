/**
 * 労務点検の専用ページ起動。HTML→LINE初期化→既存管理者gate→既存署名付きREAD。
 * 削除影響: 専用ページの自動表示だけ停止。設定・打刻・権限を保存する処理はない。
 * 一般化: ページ起動と業務controllerを分離し、許可後の初回READだけを自動化する。
 * 改造: labor-policy.html/auto-read.jsの固定laborキー/既存controller/専用テストを同期。
 * 秘密: token・応答・設定をStorage/URL/ログへ出さず、認可はGASでも毎回確認する。
 * 検証: labor-policy-page.test.mjs。拒否・未ログイン・初期化失敗・退場後は取得しない。
 */
(function(global){'use strict';
  async function start(){
    const status=document.getElementById('admin-access-status'),login=document.getElementById('labor-login');
    let stopped=false,allowed=false;
    global.addEventListener('pagehide',()=>{stopped=true;allowed=false;});
    const reads=global.TlhAutoRead.init(),gasUrl=global.TlhCurrentWorkplace.config.endpoint;
    const viewer=global.TlhLaborPolicy.init({gasUrl,liff:global.liff});
    const access=global.TlhAdminAccess.init({gasUrl,liff:global.liff,frame:document.getElementById('admin-access-frame'),status,
      onState:value=>{allowed=value===true&&!stopped;viewer.setAllowed(allowed);if(allowed)reads.once('labor',()=>allowed&&!stopped);}});
    // 通常のLINEログインだけ。認可URL/店舗指定/認証情報を独自に組み立てない。
    login.addEventListener('click',()=>{if(!stopped)global.liff.login({redirectUri:global.location.origin+global.location.pathname});});
    try{
      await global.liff.init({liffId:'2011940133-JXUDzLnG'});
      if(stopped)return;
      if(!global.liff.isLoggedIn()){login.hidden=false;status.textContent='LINEログインが必要です。ログイン後に管理者権限を確認します。';return;}
      access.start();
    }catch(_e){if(!stopped){viewer.setAllowed(false);status.textContent='LINEログインを準備できません。画面を開き直してください。';}}
  }
  void start();
})(window);
