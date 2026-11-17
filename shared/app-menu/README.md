# TLH共通アプリメニュー（独立試作）

右上の「アプリ」1ボタンにアカウント・在庫・勤怠と将来のPOSを集約します。PCでは右上のdialog、600px以下では下から開くシート。各アプリの業務タブとこのアプリ間ナビゲーションを分離し、アカウントの権限別タブを所有・変更しません。

本番未統合・未公開。既存accountファイル・main・GAS・設定・実データ・権限は変更していません。独立branchは `prototype/shared-app-menu-20261117`。PWA調査の版・根拠・限界は [調査報告](../../docs/TLH_APP_MENU_REVIEW_20261117.md)。

## 使い方と再現

最短の表示確認は [preview.html](../../prototypes/app-menu/preview.html) をダウンロードしてブラウザーで開きます。必要なコードを1ファイルにまとめた生成物で、外部通信なしに動作します。右上のアプリ一覧、権限の表示例、現在アプリ、保存結果未確認の見本を切替できます。リンクのクリックは試作内で止め、移動先だけ表示します。実際の登録・ログイン・保存はしません。

元ファイルを編集する場合はNode.js 22以上を用意し、repository rootで以下を実行します。通常表示だけならnpm installは不要です。

```sh
node scripts/build-app-menu-preview.mjs
node scripts/build-app-menu-preview.mjs --check
node --test tests/app-menu.test.mjs
# 分割ファイル版を表示する場合（Python 3があるPC）：
python -m http.server 8080
# http://localhost:8080/prototypes/app-menu/ を開く
```

ブラウザー試験は別途PlaywrightとChromium系ブラウザーが必要です。検証環境の既存依存を使う場合は `PLAYWRIGHT_MODULE` にPlaywrightのディレクトリ、`BROWSER_EXECUTABLE` にEdge/Chrome実行ファイルを指定して `node qa/app-menu-browser.cjs` を実行します。全URLを代用品へ向けるため本番へ通信しません。今回の環境ではshellからのEdge起動は失敗したため、同じ試験のexport済み `run({browser,root,output})` を実行可能なNodeホストへ読み込みました。

## ファイルと責務

| ファイル | 役割・改造箇所 |
|---|---|
| catalog.js | 公開アプリのid/名称/説明/入口だけ。アプリ追加はここに1項目追加。会社店舗・本人情報を入れない |
| app-menu.js | dialog生成、リンク、表示hint、終了処理、保存中の移動guard。各業務APIを知らない |
| app-menu.css | `.tlh-app-*` の範囲だけ。既存画面のhidden/disabledやタブへ干渉しない |
| prototypes/app-menu/index.html・demo.js・demo.css | 架空状態を切り替える見本。実権限のadapterとして使わない |
| prototypes/app-menu/preview.html | 同じ試作の1ファイル生成版。直接編集せず再生成する |
| tests/app-menu.test.mjs | カタログ拡張・危険なURL拒否・副作用境界の6検査 |
| qa/app-menu-browser.cjs | 実ブラウザーでフォーカス、画面幅、guard、別画面、追加アプリ、URL/参照元非転送を検査 |

## 権限の見せ方

| 状態 | 表示 | メニューからの移動 |
|---|---|---|
| 現在のアプリ | 現在のアプリ | 同じ画面を重複して開かない |
| Account入口 | 共通の入口 | 登録・ログイン・権限確認へ進む |
| unknown（初期値） | 移動先で確認 | 入口へ進める。利用可とは表示しない |
| available | 確認済み | 入口へ進める。移動先は毎回最新認可を検査 |
| unavailable | 利用権限なし | hrefを付けず、無効な項目と理由を表示 |
| 未提供（path:null） | 準備中 | hrefを付けない。POSのURLを捏造しない |

アプリの存在は公開情報なので、権限なしの項目も見せて入口の位置を学べるようにしています。会社一覧・他人の所属・会社名は表示しません。ログイン前・通信失敗・未接続を「権限なし」に読み替えません。権限なし項目を手動で有効化しても業務権限は増えません。URLの直入力も含め、業務APIの本人・所属・サービス・grant検査が認可の境界です。

`available/unavailable` は、ホストの既存の署名検証済み読取で確認できた場合だけ渡します。`applicationAccess: NOT_VERIFIED`、所属あり、サービス有効、運営roleありだけならunknownのままです。勤怠EMPLOYEEというだけで在庫availableへ変換しません。hintのための追加APIは作りません。メニューを開くだけの通信は0回です。各ホストで他アプリまで確認できなければunknownで構いません。

hintはページメモリだけ。退場・非表示・BFCache復帰で消します。新しい読取失敗や本人切替時はホストから `setAccessHints({})` を呼びます。同じ画面を開いたままの失効表示更新はホストの読取に依存しますが、hintがサーバー認可を代替することはありません。共通ログインsession・権限cache・永続storageは追加しません。

## 統合手順（まだ実施しない）

1. このbranchから `shared/app-menu/` の部品を取り込み、アカウントのタブ担当Dotとheader内の挿入位置を合わせます。タブcontrollerや既存DOM idは変更しません。
2. 必要な各画面のheaderへ1つのslotを置きます。JS未対応でもAccount入口へ進めるfallbackを残します。

```html
<span id="tlh-apps"><a href="/account/" target="_blank" rel="noopener noreferrer">アカウント</a></span>
<link rel="stylesheet" href="/shared/app-menu/app-menu.css">
<script src="/shared/app-menu/catalog.js" defer></script>
<script src="/shared/app-menu/app-menu.js" defer></script>
<!-- この後に各ホストのdefer bootstrapを読み込む。inline scriptのdeferは使わない。 -->
```

3. ホストの初期化済み状態からmountします。以下の `hostState` は説明用で、実際の既存controllerへadapterを接続してください。新しい権限情報源を作る変数ではありません。

```js
const launcher = window.TlhAppMenu.mount(document.getElementById('tlh-apps'), {
  currentApp: 'inventory', // account / inventory / worktime
  beforeNavigate: () => !hostState.saving && !hostState.resultUnknown
});
// 既存の検証済みreadに基づく表示hint。根拠がなければ呼ばずunknownを維持。
launcher.setAccessHints({inventory: 'available'});
// 本人変更・検証失敗：
launcher.setAccessHints({});
// 画面全体を再構成する場合は先に破棄し、二重mountしない：
launcher.destroy();
```

4. Accountはタブ担当Dotが既存header/bootstrapへ統合し、`node scripts/sync-account-assets.mjs` でJSの版付きURLを同期します。この試作では既存accountファイルへパッチを作っていません。
5. 在庫は `tlh-inventory` の元 `web` / `scripts/build-employee-pwa.mjs` 側からheaderと読込タグを変更し、生成したPWAを公開repoへ反映します。配布済みapp.jsを手編集しません。GASや台帳は変更不要です。
6. 勤怠は編集元 `workforce/` から統合し、`python scripts/sync-worktime-url.py` と `--check` を実行。`software/worktime/` の生成HTMLだけを編集しません。各アプリが `/shared/` の同じ資産を参照します。
7. 共通メニューが表示・動作することを確認してから、従来のheader内アプリ横断リンクを取り除きます。help本文の説明用リンクまで機械削除しません。manifest、PWA id/scope、LIFF Endpointは変更しません。
8. それぞれの既存回帰、保存中/結果不明、未ログイン/停止、通常打刻/在庫、別画面からの復帰、端末別のPWA移動を検査してから統合PRをレビューします。本番公開は今回の範囲外です。

`beforeNavigate` は同期でtrueを返す場合のみ許可します。例外・false・Promiseは拒否します。非同期確認でクリックのuser activationを失わないためです。通常クリック・Enter・中クリックを検査し、保存結果不明を自動再送しません。別画面方式でもOSによる破棄やブラウザーの既存PWA再利用を完全には防げないため、保存結果不明時のguardを省略しないでください。

## UIと安全性の検証範囲

Edge Chromium 157、320/390/768/1280px、モバイル幅はtouch有効で全検査成功。Tab/Shift+Tab循環、Escape/閉じる/外側タップ、focus復帰、44px以上の主ボタン、200%文字拡大、24アプリ時の内部scroll、権限なし/準備中のhrefなし、hint失効時のfocus退避、pagehideのhint破棄を検査しました。動的な表示はtextContentで描きます。

別画面を許可する検査では移動先も架空ページに差し替え、`window.opener === null`、空のdocument.referrer、送信元のtoken/会社query/fragmentが移動先URLへ混ざらないこと、元の下書きを保つことを確認。メニュー開閉に追加リクエストはありません。実機の画面読み上げ・Safari/iOS・インストール済みPWA同士の捕捉・実LINE往復は未検証です。
