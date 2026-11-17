# TLH共通アプリメニュー：PWA調査・試作・統合案

2026-11-17。既存アプリへの統合・main反映・公開は行っていません。独立branch：`prototype/shared-app-menu-20261117`。操作できる見本は [1ファイル試作](../prototypes/app-menu/preview.html)、開発・統合手順は [部品README](../shared/app-menu/README.md)。

## 1. 確認した版と全体設計

| repository | 調査開始時の最新main | 調査中の再照合 |
|---|---|---|
| inhokkaido12345-lab/tlh-platform | `3bce1ac38e5f088f349f7bbc9ca0a0c58a20db1b` | 同じcommit |
| inhokkaido12345-lab/tlh-inventory | `6e555a08f4b2b195847430b0b88086f4b8f6ce07` | `9e99d327b3ca3eea9b5f8b80f6096a0f4a75704f` |
| inhokkaido12345-lab/tea-lab-hokkaido | `e640f35e699b02e90f5a03d018410ff1906e1491` | `7944351d62ef0d0158e150023743ed9ea78fa53a` |

Platformの `docs/TLH_PLATFORM_ARCHITECTURE.md`、`docs/ARCHITECTURE.md`、STATUS、共通所属・店舗ID契約、各repoのREADME、Inventoryの `docs/independent-pwa.md`、公開側 `workforce/PWA.md` と `URL-MIGRATION.md`、PWA manifest/入口HTML/生成scriptを読みました。

上位設計はAccount/Identity、会社店舗所属、雇用、サービス有効化、業務grant、業務記録を分離する。ナビゲーションはアプリを探す責務だけで、認可を移しません。全サービスを同じPWA枠・GAS・ログインsessionへまとめる必要はありません。URLやアプリ名を見せること自体は、データ閲覧権の付与ではありません。

並行変更も差分を確認しました。公開PR #115は別Dotによる権限別タブと管理範囲gateで、Account既存ファイルへ広く変更が入っています。本試作は別の新規パスだけを使い、tabs.jsや既存controllerを所有しません。在庫PR #37〜#39はCore照会・会社利用開始案内・再ログイン等の変更で、PWA id/scopeは維持されています。試作branchの基準は開始時mainのままで、別Dotの変更を古い版へ戻すpatchは含めません。統合は新規部品だけを最新mainへ取り込み、その後に各担当がheaderを接続します。

## 2. 現在のPWA対応状況

2026-11-17に匿名HTTP GETで3入口・2manifest・2iconを確認。全て200で、manifestの設定は下表と一致し、共通iconはPNG 192×192 / 512×512でした。**ページのJSを実行しない静的読取で、LINEログイン、GAS、登録、台帳への操作はしていません。** 原結果は [HTTP観察JSON](../qa/app-menu-pwa-observations.json)。

| アプリ | manifestと設定 | インストールについて確認できる範囲 |
|---|---|---|
| TLH Account `/account/` | 現行入口HTMLにmanifestリンクなし。専用manifestも開始時treeにはなし。権限タブ追加後のHTML差分にも追加なし | **専用PWAとしてのid/start_url/scopeは未整備。** ブラウザーが「サイトをアプリとして追加」やホーム画面shortcutを許す場合はあるが、専用PWA対応済みとは扱わない |
| Inventory `/software/inventory/` | `/software/inventory/manifest.webmanifest`。id/start_url/scopeは全て `/software/inventory/`、display:standalone、192/512 icon | manifestの静的なインストール要件と配信を確認。Android/iPhoneの実インストール、prompt表示、起動・LINE往復は今回未実施 |
| Work Time `/software/worktime/` | manifestは旧場所 `/workforce/manifest.webmanifest`。idは **`/workforce/`** を維持、start_url/scopeは **`/software/worktime/`**、display:standalone、192/512 icon | 同じ静的要件と配信を確認。既存文書には旧URLでAndroid確認済み、新URLでは実機ホーム画面とiPhoneは残件と記録。今回も実端末インストールの代用にはしない |

根拠の固定版：

- [Account入口](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/blob/e640f35e699b02e90f5a03d018410ff1906e1491/account/index.html)
- [Inventory manifest](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/blob/e640f35e699b02e90f5a03d018410ff1906e1491/software/inventory/manifest.webmanifest)
- [Work Time manifest](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/blob/e640f35e699b02e90f5a03d018410ff1906e1491/workforce/manifest.webmanifest) / [新入口のmanifest参照](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/blob/e640f35e699b02e90f5a03d018410ff1906e1491/software/worktime/index.html)
- [Work Time PWAの確認実績と残件](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/blob/e640f35e699b02e90f5a03d018410ff1906e1491/workforce/PWA.md)
- [InventoryのPWA生成元](https://github.com/inhokkaido12345-lab/tlh-inventory/blob/6e555a08f4b2b195847430b0b88086f4b8f6ce07/scripts/build-employee-pwa.mjs) / [独立PWA設計](https://github.com/inhokkaido12345-lab/tlh-inventory/blob/6e555a08f4b2b195847430b0b88086f4b8f6ce07/docs/independent-pwa.md)

Chromeのinstall promotionはHTTPS・manifest項目に加え、既インストール状態や操作/閲覧の条件にも依存します。今回のGET確認だけではprompt発火は分かりません。Service Workerがないことだけを理由に「インストール不可」ともしません。現行Inventory/Work Timeはオンライン必須で、設計文書・生成元ではService Worker・オフライン送信queue・個人情報の永続保存を導入していません。manifestがあることはオフライン業務や共通sessionの完成を意味しません。

## 3. PWA間移動の意味

| 出発点 | 移動先 | scope上の関係 |
|---|---|---|
| Inventory | Account / Work Time | どちらもInventoryの範囲外 |
| Work Time | Account / Inventory | どちらもWork Timeの範囲外 |
| ブラウザー上のAccount | Inventory / Work Time | Account専用scopeがまだない。通常のWebリンクとして別の入口へ進む |
| Inventory | 既存LINE認証窓口 | `/software/worktime/inventory/auth/` はWork Timeのscope内。これは既存認証brokerの都合で、Inventoryの業務scopeや権限を移す意味ではない |

scopeはアプリらしい表示を適用するURL範囲です。**認証や会社データのアクセス境界には使えません。** 同じドメインでもscope外への移動はあり、ブラウザーUI付き画面・別タブ・インストール済みPWAへの捕捉等はOS/ブラウザー/利用者設定で異なります。Chrome 139以降の対応desktopでは対象URLのPWAへ捕捉され得ます。アプリ側だけで全端末のウィンドウ挙動や「既存PWAを必ず再利用する/必ず新規にする」を保証しません。

試作のリンクは `_blank` と `rel="noopener noreferrer"` を使用。元画面を同一タブ遷移で置き換えない方針です。送信元のtoken/会社店舗query/fragmentをコピーしません。移動先のログインはそのアプリの既存方式に任せます。共通メニューを付けても自動でログイン済みになるわけではありません。メモリだけの証明を別ページへ受け渡す仕組みも追加していません。

ただし元画面がバックグラウンドに残っても、OSによる破棄はあり得ます。保存中・保存結果不明は各ホストの同期guardで移動を止める統合が必要です。別画面を開いた事実を保存成功や保存取消として扱いません。メニュー経由以外の直URLは常に各業務APIが認可します。

**PWA設定の推奨**：在庫・勤怠のid/scopeはそのまま維持。Accountを将来PWA対応するなら `/account/` の独立したid/start_url/scopeを設計・端末確認する別変更にします。メニューのためにscopeを `/` へ広げたり、既存manifest idを一括変更したりしません。本試作はmanifest・SW・LINE設定を一切変更しません。

ブラウザー一般仕様の一次資料：

- [Google：インストール条件](https://web.dev/articles/install-criteria)
- [Google：PWAのウィンドウとscope外の移動](https://web.dev/learn/pwa/windows)
- [Chrome：インストール済みPWAへのnavigation management](https://developer.chrome.com/docs/capabilities/pwa-navigation-management)

## 4. 試作の判断と実装

「アプリを選ぶ」と「そのアプリ内で何ができるか」を分けました。共通ボタンはheader内に1個、業務タブは各アプリが管理します。登録手順へ戻るAccountを常設し、業務アプリは未確認/確認済み/利用権限なし、未提供POSは準備中と表示します。権限なしのカードは理由付きで残すので、利用者が別アプリの位置を覚えられ、問い合わせ時にも「どの入口が使えないか」を指せます。

利用者の手順は、ボタンで候補を見つける、目的のアプリを選ぶ、移動先で必要ならログインする、の順。広いリンク群を毎回読み分ける負荷を減らし、最新の権限検査は構造的に移動先へ残します。「移動先で確認」「利用権限なし」「準備中」の短い理由により、利用者が利用状態の違いを学べる表示にしました。

候補の会社や店舗は列挙せず、公開のアプリ名だけをregistryへ置きます。POS等の追加はcatalog.jsの1項目で、headerを増殖させません。実装の概念は部品の組合せとregistryであり、新しい認証サーバーや全アプリ共通の巨大controllerではありません。メニューを開いても本人情報や権限を取得する通信は0回です。

## 5. テスト

- Node.js v24.19.0：`node --test tests/app-menu.test.mjs`、6件成功。
- `node scripts/build-app-menu-preview.mjs --check` 成功、JS構文確認成功。
- Edge Chromium 157.0.4341.60：320/390/768/1280pxで全シナリオ成功。320/390はtouch入力も検査。全URLを代用品にし、実LINE/GASへ通信していません。
- Tab/Shift+Tabの循環、Escapeと閉じる/外側tap、focus復帰、表示hint更新で無効になったリンクからのfocus退避、200%文字、24アプリ時の内部scroll、下書き保持、別画面openerなし/参照元なし、元URLの秘密query非転送を確認。
- 権限なし・準備中のhrefなし、unknownの入口表示、pagehideでhint破棄、Promise guardの拒否、中クリックのguardも成功。
- 1ファイル版をfile URLで開いてdialog表示成功・pageerrorゼロを確認。
- 分割版の初期静的GETは6回（HTML1・CSS2・JS3）。メニュー開閉・hint表示の追加GETは0回。別画面の1回は架空移動先へのGETで、権限APIではありません。

原結果は [browser-results](../qa/app-menu-browser-results.json)。Shell sandbox内のEdge launchは失敗しましたが、利用可能なNodeホストの同じPlaywright/Edgeで同一試験関数を実行しました。起動失敗を試験成功として数えていません。

## 6. 新規ファイルと統合

変更は以下の**新規14ファイル**だけ。既存ファイルの変更・削除なし。

| 範囲 | 追加ファイル |
|---|---|
| shared/app-menu | catalog.js、app-menu.js、app-menu.css、README.md |
| prototypes/app-menu | index.html、demo.js、demo.css、preview.html |
| scripts | build-app-menu-preview.mjs |
| tests | app-menu.test.mjs |
| qa | app-menu-browser.cjs、app-menu-browser-results.json、app-menu-pwa-observations.json |
| docs | この報告書 |

統合は [READMEの手順](../shared/app-menu/README.md#統合手順まだ実施しない) に記載。Account担当Dotがheader/slot/bootstrapへ接続、Inventoryは生成元からPWAを作り直し、Work Timeは編集元から公開HTMLを同期します。各アプリのタブ・認可・既存保存controllerへ介入しません。生成物だけの手編集や本番GAS再公開は不要です。

## 7. 未検証・次の判断

- Android/iPhoneで実インストール済みPWA間を移動した時の実挙動、Safari、画面読み上げ、既存PWA名の更新、端末低メモリ時の復帰。
- アカウントの新タブCSSを含む実画面との合成、在庫/Work Timeの既存CSS・保存状態adapterとの接続、全repositoryの全回帰。
- 実ユーザーの最新hintを更新するadapter、停止直後の表示、実LINE往復。今回の表示例は全て架空。
- 別Dotが今後さらにmainや配信を更新した場合の再照合。HTTPで観察した公開資産と全mainソースの全件一致までは調べていない。

次はAccountタブ担当とheaderのslot・保存状態guardを合わせる統合です。その後、Inventory/Work Timeへ同じ部品を接続し、実端末のPWA間移動を確認します。統合前に三者のmainを再読し、既存ファイルの並行変更を上書きしません。
