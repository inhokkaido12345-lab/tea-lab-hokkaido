/**
 * 役割: 旧Workforceページを同じページのWork Time公開URLへ移す、初期化前だけの互換入口。
 * 呼出元: 旧HTMLのhead。呼出先: 同一originの固定ルートだけ。新HTMLには読み込まない。
 * 削除影響: 旧ブックマーク/PWAからの移行が止まる。打刻・シフトの保存先は変わらない。
 * 一般化: URLの互換性とアプリの認可は別。任意のreturn URL/open redirectを作らない。
 * 魔改造: ページ追加はroutes・sync-worktime-url.py・移行テストを同時更新する。
 * 秘密: SDKのcode/state/tokenや未知queryをコピー・保存・記録しない。店舗queryはそのまま
 * 引き継ぎ、重複や別店舗の指定を勝手に消して通常店舗へ読み替えない。判定は従来のGAS。
 * 検証: tests/worktime-url.test.mjs。進行中のOAuthは新入口から本人がやり直す。
 */
(function(global){
  'use strict';
  const routes = new Set(['','index.html','account-info.html','admin-day-change.html',
    'admin-guide.html','admin-schedule-bulk.html','admin-schedule.html','admin-timecard-records.html',
    'bridge-test.html','company-operations.html','day-change.html','employee-help.html',
    'labor-policy.html','platform-operations.html','recovery.html','schedule.html',
    'staff-code-change.html','timecard-records.html','sandbox/','sandbox/index.html',
    'inventory/auth/','inventory/auth/index.html']);
  /** 固定ページだけを移す。未知のURL/認証中queryは書換えず、無限転送を作らない。 */
  function destination(href){
    const url=new URL(href);
    if(url.origin!=='https://tealabhokkaido.com'||!url.pathname.startsWith('/workforce/'))return null;
    const page=url.pathname.slice('/workforce/'.length);
    if(!routes.has(page)||[...url.searchParams.keys()].some(key=>!['organizationId','workplaceId'].includes(key)))return null;
    const fragment=/^#[a-z][a-z0-9-]*$/i.test(url.hash)?url.hash:'';
    return url.origin+'/software/worktime/'+page+url.search+fragment;
  }
  global.TlhWorkTimeUrl=Object.freeze({destination});
  const target=destination(global.location.href);
  if(target)global.location.replace(target);
})(window);
