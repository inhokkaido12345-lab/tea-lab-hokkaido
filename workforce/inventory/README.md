# TLH Inventory：従業員向けオンラインPWA

入口：<https://tealabhokkaido.com/workforce/inventory/>

WorkTimeと同じLINEログインでTLHアカウントを確認し、現在有効な従業員だけが在庫を読取・更新できます。Google所有者のログインを従業員へ共有する必要はありません。

## スマートフォンで使う

1. SafariまたはChromeで上の入口を開く。
2. 必要なら「LINEでログイン」を押す。WorkTimeで使っている本人のLINEを使う。
3. iPhoneは共有→ホーム画面に追加。Androidはメニュー→ホーム画面に追加／アプリをインストール。
4. 次からホーム画面の「TLH Inventory」で起動する。オンライン接続が必要。

停止済み・未登録の場合は利用できません。LINEログイン成功だけでは従業員になりません。所属や権限はサーバーが毎操作確認します。

初期4品目・袋容量は試験用設定を引き継ぎます。運用前に確認し、棚卸の総在庫（開封中も含む）を登録してください。最初の入荷を基準にする場合は、それ以前の在庫を0と仮定します。在庫基準と完了した計測が揃うまで、推定残量を実数として表示しません。

## 日々の操作

数日に一度、測定する1袋だけ「消費速度の計測を開始」し、使い切ったら「計測を終了」します。終了で完結し、次の計測は自動で開始しません。普段の袋交換は記録不要です。測り損ねた標本は取り消します。

基準在庫＋その後の入荷−平均速度×経過日数で推定します。計測していない日も消費を推定し、終了時に袋の重量を別途引きません。平均は最大20標本、直近は3標本。残量には平均、発注警告には速い側を使います。棚卸を入れると推定誤差を補正します。

例：3kg袋を3日で使い切れば1kg/日。基準12kgから5日後は約7kg。入荷は別途登録します。「発注を記録」は発注済み共有で、仕入先へ注文を送る機能ではありません。

保存結果が不明なら、新しく同じ操作を作らず「同じ操作を確認」。同じ入力・操作IDで確認します。画面の再読込やログインのために保存を自動再送する機能はありません。

## 正本と再生成

このフォルダーの6ファイルは非公開`tlh-inventory`の`web`とビルドスクリプトから生成します。公開側のapp.jsだけを修正すると再生成で失われます。

```sh
cd tlh-inventory
npm run build
node scripts/build-employee-pwa.mjs https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

URLには在庫リポジトリの従業員用API配布結果を使います。`dist/employee-pwa`の6ファイルを、この公開サイトの`workforce/inventory`へ反映し、GitHub main→Pagesで公開します。固定API URLとLIFF IDは公開識別子で、tokenや台帳IDではありません。

| ファイル | 役割 |
| --- | --- |
| index.html | 入力画面・ログインとインストールの案内 |
| app.js | 品目・予測・入荷・発注共有・単発計測の操作 |
| employee-transport.js | LINEログインと署名付きPOST。退場時に通信を止める |
| config.js | 確認済みの従業員API URLと既存LIFF ID |
| manifest.webmanifest | 起動名・アイコン・範囲・standalone表示 |
| style.css | 配置と配色 |

`/workforce/`の下に置くのは、既存LIFF Endpointの下で初期化するためです。WorkTimeの既存manifest・API・打刻受付は変更しません。在庫は別のmanifest IDとscopeを持ちます。

## 保存・認証の境界

業務データはGAS/Sheetsに保存します。Service Worker、端末キャッシュ、オフライン送信キュー、Push通知はありません。token・応答鍵・在庫・従業員名簿を独自localStorage/sessionStorageへ保存しません。

postMessageは送信元frame、要求nonce、command、全文HMACを検査してから利用します。originがnullだったという理由だけでは信用しません。ブラウザー上のroleやボタン表示で許可を決めず、在庫サーバーが固定TLH Coreへ会社・店舗付きで本人照会します。

## 検査

公開リポジトリの`node --test tests/inventory-pwa.mjs`で配置・manifest・秘密を含まない構成を確認します。認可・保存・再送・署名のテストは在庫リポジトリ側です。模擬テストの成功を実端末のホーム追加・本人READ成功の代わりにしません。

実機ではログイン、読取、再ログイン、別の一般従業員、停止後の拒否、ホーム追加を確認してください。実打刻や架空の在庫更新を受入れのために代行しません。
