# TLH Account 共通入口

設計基準は既存の[TLH Platform全体設計思想 v0.1](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/reference/TLH_PLATFORM_ARCHITECTURE-v0.1.md)。特に§1（各アプリは共通基盤のクライアント）、§3（外部認証と内部Accountを分離）、§4（共通Account Management）、§13–14（権限・従業員情報の境界）、§22（正本と責務を決めてから画面を実装）に従う。会社・店舗の管理階層は既存の[運営管理設計](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/運営管理Web-保存と再構築.md)、実装済みの範囲は[STATUS](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/STATUS.md)で確認する。このREADMEを全体設計の代わりにしない。

公開候補の入口は `/account/`。在庫・勤怠の両方から独立して、LINE本人確認、自分の登録情報、従業員招待の発行・受取を操作します。打刻や在庫保存を初期化しません。一般登録のサーバー受付をこの画面から開放することはできません。

## 利用する順序

1. 「LINEでログイン」を押します。既存のLINE認証窓口を別窓で開きます。
2. 登録済みなら本人情報を表示します。未登録で勤務先の招待がある場合は、招待コードを受け取ります。招待処理が共通IDの作成と従業員の紐づけを担うので、先に一般登録する必要はありません。
3. 管理者は勤務先を確認し、「この勤務先の管理者の方」から招待権限を確認して発行します。
4. 在庫画面へ戻り、LINEログインします。在庫を使うために勤怠アプリを開く操作はありません。

目的は、在庫・勤怠のどちらか一方しか使わない人にも、共通アカウントの登録入口を提供することです。所属はアプリ共通であり、この画面で配属・店舗の作成や独自の所属・招待制度を増やしません。既存の従業員登録APIは現在のThe TEA専用です。アカウントを作っただけでは管理者・従業員にはなりません。将来のECにも共通IDを使う前提ですが、この変更でECや独自パスワードは追加していません。

## 初学者向けの再構築・変更箇所

この公開リポジトリを取得し、`account/` のHTML・CSS・JSと、参照する既存資産を同じサイトへ置きます。HTMLは画面の部品、CSSは見た目、JSはクリックと既存APIの組合せです。HTMLのidとiframe名は既存controllerとの接続名なので、変更時は両方を同期します。

| 資産・API | 役割 |
| --- | --- |
| `/software/inventory/employee-login.js` | 固定LINE認証窓口との往復のみを借りる。Inventoryの業務画面は起動しない |
| `/workforce/current-workplace.js` | 現在の勤務先と固定GASへのPOST。勤務先表示は権限の証明ではない |
| `/workforce/account-info.js` | 署名検証済み本人情報の読取。`data-bootstrap`を付けず、SDKを重複初期化しない |
| `/workforce/staff-enrollment.js` | 既存の招待発行・取消・本人受取。管理者権限はサーバーが毎回判断 |
| `bridgeCreateAccount` | 既存の一般登録。現在の受付フラグを守り、UsersとIdentitiesだけを作る |

LINE SDKをこの画面で直接初期化せず、既存LIFF Endpoint内の認証窓口を使います。共有するのはアカウント・所属・本人確認で、アプリ利用の可否は各業務APIが判断します。将来認証部品を独立させる場合は、nonce・origin・opener/BroadcastChannel・受領確認の双方の契約を一緒に移します。

一般登録の結果は既存APIの固定origin・応答iframe系統・32桁nonce・固定コードで照合します。本人情報・招待は既存の署名検証も継続します。一般登録はtimeoutを失敗と断定せず、同じnonce・同じLINEで再確認し、その間は招待操作を止めます。退場時に情報を消し、履歴のキャッシュから戻った場合は再読込します。tokenや招待コードをURL・端末保存・ログへ出しません。

## 検証と公開

```sh
node --test tests/common-account.test.mjs tests/account-info.test.mjs tests/staff-enrollment.test.mjs
```

在庫の編集元は非公開 `tlh-inventory/scripts/build-employee-pwa.mjs` です。そこに共通入口へのリンクを追加し、PWA生成後にサイトへ反映します。古い手元の `Software/inventory` をそのまま配布しないでください。現行GitHub版には店舗作成・仕入品情報などの後続実装があります。

サイトへの反映と、一般登録の受付開始は別の判断です。GASや保存先・受付設定は今回変更していません。実端末のLINE往復・本人読取・招待登録、未登録の客による一般登録は未確認です。実社員を模擬試験に使わないでください。

2026-11-17の検証では、公開UIの338件が成功しました。`qa/common-account-browser.cjs` で320/390/1280pxの画面を操作し、既存のログインbrokerと認証窓口の実コードを使ったpopup往復、招待発行・受取、登録情報の更新が成功しました。LINE SDKとGAS応答は模擬です。本人情報・招待応答のHMACも模擬鍵で検査し、画面エラー・横はみ出しはありませんでした。一般受付の閉鎖表示と、初回表示だけでは登録しないことも確認しました。

ブラウザー検査は、Playwrightを導入後に `node qa/common-account-browser.cjs` で実行できます。既存依存を利用する場合は `PLAYWRIGHT_MODULE`、ブラウザーを指定する場合は `BROWSER_EXECUTABLE` に絶対パスを指定します。画像は一時フォルダーへ保存します。実LINEのログイン成功や実登録の成功を証明する検査ではありません。
