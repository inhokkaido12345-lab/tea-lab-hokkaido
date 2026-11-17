# TLH Account 共通入口

最初に[TLH Platform全体設計の現行適用ガイド](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/TLH_PLATFORM_ARCHITECTURE.md)を読む。2026-11-17、タイムカードWorkのPR #88で共通Account・所属API・既存DTO・登録受付の現在地が明記された。次に[実装構成](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/ARCHITECTURE.md)、[STATUS](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/STATUS.md)、[API契約](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/API.md)を確認する。[提供原文v0.1](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/reference/TLH_PLATFORM_ARCHITECTURE-v0.1.md)は上位思想の版固定資料で、共通所属APIの完成仕様とはみなさない。このREADMEを全体設計の代わりにしない。

公開済みの共通入口は `/account/`。在庫・勤怠の両方から独立して、LINE本人確認、自己Account登録、共通所属招待の発行・受取、管理者による在庫業務権限の設定を操作します。打刻や在庫保存を初期化しません。一般登録のサーバー受付をこの画面から開放することはできません。

## 在庫を使う主手順

1. 本人が `/account/` で「LINEでログイン」→ 未登録なら「自分のTLHアカウントを作成」。一般登録の受付状態はサーバーが判断します。従業員登録は不要です。
2. 管理者が管理できる会社・店舗を選び、所属招待を確認・発行して本人へ個別に渡します。
3. 本人が所属招待コードを入力し、内容を確認して受け取ります。ここでは在庫権限も勤怠の雇用情報も作りません。
4. 管理者が対象店舗の所属者を選び、在庫の閲覧・入荷・発注・管理の必要な権限だけを選択。変更前後を確認して保存します。
5. 本人が在庫画面へ戻り、LINEログインします。所属・権限に加え、サービス契約と店舗接続が有効であることを業務APIが確認します。

新規Accountの氏名は取得・推測しません。「表示名なし」の対象は、本人の「管理者に伝えるアカウント情報をコピー」で共有されたIDと照合します。運営権限だけで全員の氏名を公開しません。共通所属はCommonAffiliationJournal、運営権限はOperationsJournalが正本で、画面独自の所属表は作りません。

### 別の互換ルート：既存の勤怠・従業員招待

「別手続き：従業員情報・勤怠の登録」は既存The TEA勤務先の手続きです。従業員招待の受取は共通ID作成に加えて従業員情報・勤怠の従業員権限も紐づけます。このルートでは先に一般登録する必要はありませんが、在庫だけを使う人の主手順にはしません。共通所属・在庫grantの代用にもなりません。ECや独自パスワードは追加していません。

## 初学者向けの再構築・変更箇所

この公開リポジトリを取得し、`account/` のHTML・CSS・JSと、参照する既存資産を同じサイトへ置きます。HTMLは画面の部品、CSSは見た目、JSはクリックと既存APIの組合せです。HTMLのidとiframe名は既存controllerとの接続名なので、変更時は両方を同期します。

| 資産・API | 役割 |
| --- | --- |
| `/software/inventory/employee-login.js` | 固定LINE認証窓口との往復のみを借りる。Inventoryの業務画面は起動しない |
| `/workforce/current-workplace.js` | 現在の勤務先と固定GASへのPOST。勤務先表示は権限の証明ではない |
| `/workforce/account-info.js` | 署名検証済み本人情報の読取。`data-bootstrap`を付けず、SDKを重複初期化しない |
| `/workforce/staff-enrollment.js` | 別手続きである既存勤怠招待の発行・取消・本人受取。管理者権限はサーバーが毎回判断 |
| `management-picker.js` | 署名付きで管理可能な会社・店舗・有効所属者だけを選択。表示名には別途閲覧権限が必要 |
| `common-affiliation.js` / `common-grants.js` | 共通所属招待と在庫業務権限を別々のPREVIEW→COMMITで変更 |
| `bridgeCreateAccount` | 既存の一般登録。現在の受付フラグを守り、UsersとIdentitiesだけを作る |

LINE SDKをこの画面で直接初期化せず、既存LIFF Endpoint内の認証窓口を使います。共有するのはアカウント・所属・本人確認で、アプリ利用の可否は各業務APIが判断します。将来認証部品を独立させる場合は、nonce・origin・opener/BroadcastChannel・受領確認の双方の契約を一緒に移します。

一般登録の結果は既存APIの固定origin・応答iframe系統・32桁nonce・固定コードで照合します。本人情報・招待は既存の署名検証も継続します。一般登録はtimeoutを失敗と断定せず、同じnonce・同じLINEで再確認し、その間は招待操作を止めます。退場時に情報を消し、履歴のキャッシュから戻った場合は再読込します。tokenや招待コードをURL・端末保存・ログへ出しません。

## 検証と公開

```sh
node --test tests/common-account.test.mjs tests/account-info.test.mjs tests/staff-enrollment.test.mjs
```

在庫の編集元は非公開 `tlh-inventory/scripts/build-employee-pwa.mjs` です。そこに共通入口へのリンクを追加し、PWA生成後にサイトへ反映します。古い手元の `Software/inventory` をそのまま配布しないでください。現行GitHub版には店舗作成・仕入品情報などの後続実装があります。

### 現在の検証範囲

- 共通所属・在庫grant・管理pickerは本番接続済み。既存本人による実機LINEログイン、本人読取、同じ値の保存、権限内4名の氏名picker表示を確認済みです。
- **未確認**：新規本人が実機で自己登録→所属招待受取→在庫利用まで進む一連の受入れ。合成試験の成功をこの実機確認と混同しません。実社員を模擬試験に使いません。
- サイト公開、GAS公開、一般登録受付、台帳接続・権限付与はそれぞれ別です。UIの表示だけで設定完了や全アプリ利用可能とは判断しません。
- picker競合修正・招待コピー・BFCache回帰の関連96件が合成環境で成功。公開済み版に追加修正が反映されたかは対象commitと配信を照合します。
- ローカル全site試験は不足資産による失敗があり、全件成功とは扱いません。正本treeのCIで最終確認します。

`qa/common-account-browser.cjs` はLINE SDK・GASを模擬した旧入口の検査です。管理pickerは `qa/management-picker-browser.cjs`。このexecutorではChromium起動が `socket() failed: Operation not permitted` のため後者は未実施です。既存依存は `PLAYWRIGHT_MODULE`、ブラウザーは `BROWSER_EXECUTABLE` で指定できます。合成ブラウザー試験は実LINE・新規本人の実登録を証明しません。

## 共通所属専用の入口

- 自己登録は既存 `bridgeCreateAccount`。`SIGNUP_CLOSED` は維持します。
- `common-affiliation.js` は管理者の所属専用招待と本人受取だけ。社員情報・勤怠登録・業務grantを作りません。会社・店舗は管理者の権限内の一覧から選び、サーバー確認後のPREVIEWを見て明示COMMITします。発行秘密はブラウザ生成、ISSUEではSHA-256だけを送信し、CLAIMではPOST bodyで送ります。秘密をURL・保存領域・ログへ出しません。
- 結果不明のCOMMITは同じ操作ID・入力・revisionだけで再確認します。再確認中に認証/権限が失われても未確定操作を別操作へ置き換えません。画面を閉じることは保存取消ではありません。
- `workforce/common-affiliation-info.js` は `bridgeCommonAffiliationV1` の本人限定読取。共通ページとWorkTime本人情報画面で共用します。従業員情報・勤怠roleの既存DTOへ項目を混ぜません。共通所属が未設定でも既存勤怠を止めません。共通所属なし、未登録、未設定、通信障害は別表示です。
- 実在する会社・社員の所属や権限の変更は、対象・範囲を明示した管理者操作として行います。自己登録や招待受取だけで業務権限を自動追加しません。

検証: `node --test tests/common-account.test.mjs tests/account-info.test.mjs tests/staff-enrollment.test.mjs tests/common-affiliation-ui.test.mjs tests/common-affiliation-info.test.mjs`。架空データで実GASとの別途連結試験も実施。実機で確認した範囲と未確認範囲は上記に分けて記載しています。

### 会社ごとの雇用情報：読取実装と未接続部分

`company-employment-info.js` は共通所属から本人の会社一覧を読み、会社を明示選択した後だけ、その会社の雇用原簿を読みます。店舗所属がない会社も一覧対象です。未接続・所属なし/権限不足・正常な雇用登録なしを分けます。会社の切替や再読込で前の社員情報を直ちに消し、遅延応答の会社・nonce・本人の不一致を拒否します。会社Aの社員番号や情報を会社Bへ流用しません。会社の選択は表示だけで、既存WorkTimeの打刻先や権限を変更しません。

会社別雇用の読取コードはありますが、本番の会社別雇用binding・writerは未達です。共通所属があるだけで雇用原簿の接続・移行完了とは扱いません。

追加試験: `node --test tests/company-employment-ui.test.mjs`。別途、正式GASの会社別manifest/binding・会社所属だけの一覧・社員情報あり/なし・原簿未接続を架空データで連結検証しています。


### 在庫業務権限の明示設定・停止

`common-grants.js` は所属招待と別の管理者操作です。会社・店舗・対象所属者を選び、権限集合を指定し、サーバーのPREVIEWで変更前後を確認してからCOMMITします。何も選ばなければ在庫権限を全停止します。自分自身への追加は禁止、既存権限の削減・停止だけが許可されます。雇用情報・運営権限・サービス契約/接続は変更しません。結果不明時は同じ操作ID・入力・revisionだけを再確認します。

`tests/common-grants-ui.test.mjs` と正式GAS連結で設定・停止・結果不明再送・偽応答を検証します。WorkTimeの生成HTMLは `python scripts/sync-worktime-url.py` から再生成し、`--check` で20ページの同期を確認しました。ローカル全件は不足資産の復元制限があるため、正本treeに差分を載せた候補ブランチのCIで最終確認が必要です。

### 招待の受渡し

保存後の「招待コードをコピー」「受取りページをコピー」で本人へ個別共有します。受取りURLには招待コードを含めません。「コード表示を閉じる」は表示の消去で、発行済み招待の取消ではありません。

### 明示ログインの再認証

`/account/`の「LINEで本人確認」は、初回を含め、本人が押した時だけ認証brokerの
`clearToken()` → `login()`で既存の`reauth=1`経路を使います。ブラウザー内に残った
LINE証明をそのまま再利用せず、OAuthログインが再実行される場合があります。
画面初期化・読取拒否・保存再送では自動ログインしません。結果不明の保存も自動再送しません。
WorkTimeの画面・打刻・記録は変更しません。popupから証明を受領したことと、Coreが
その証明を受理したことは区別し、画面も「本人確認情報を受け取りました」と表示します。
