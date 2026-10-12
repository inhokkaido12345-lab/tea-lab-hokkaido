# TLH 勤怠管理フロントエンド — 初心者向けファイル説明

## D9：ダミー従業員の招待試験

2026-10-12追加。LINE実機のD9は未確認。実社員用の登録機能ではない。
[LINE MINI App](https://miniapp.line.me/2011940133-JXUDzLnG)で版番号D9を確認し、
「ダミーを事前登録して招待を発行」→「自分のLINEで招待を受け取る」を順に押す。
対象は架空の`D9 ダミー従業員 / DEMO-D9`1人、受取りは発行管理者本人のみ。
受取り操作は既存TLHアカウントへ試験用の従業員属性とEMPLOYEE/WORKFORCE権限を追加する。
給与・銀行・打刻・初期管理者権限は変更しない。一般登録スイッチは開けない。

`demo-invitation.js`はD9専用の通信controller。消すとD9が使えないが既存データは残る。
招待秘密は暗号学的乱数32バイトで生成しメモリだけに保持。URL/ログ/保存領域へ出さない。
GASはハッシュ・30分期限・一回限り使用を検査し、POSTのLINE tokenとroleを毎回再確認する。
応答は固定codeのみ。Googleの入れ子iframeのnull originに対して一回用鍵のHMACも検査する。
HMACは応答偽装対策であり、暗号化や勤務許可ではない。給与/実社員情報の返却へ流用しない。
他サイトのiframe内ではD9送信を拒否する。同一originのXSS/SDK侵害まで防げるとは保証しない。

応答が来なければ同じボタンで再試行。tokenは同じなので二重登録しない。
再読込後の発行は前のPENDINGを失効させる。受取り済み招待は二度書き込まない。
「整合性確認が必要」と出たら操作を止めて知らせる。Sheet行の手削除/設定印の解除だけで復旧しない。
ダミーの解除は次工程。実際の勤怠/給与にダミーを含めない。

公開repoの`tests/workforce-invitation.test.mjs`は偽装・連打・応答喪失を実データなしに4件検査する。
既存デザイン・D4〜D8の診断を維持した。GAS側の記録仕様と補償は非公開repoの`docs/D9-ダミー従業員招待.md`を参照。

> このフォルダは、従業員がLINEから開く**画面**の正本です。
> こちらのGitHub PagesがHTMLを表示し、仕事の処理は別リポジトリのGoogle Apps Script（GAS）へ依頼します。
> 本文は診断版D8までの実装を説明しています。2026-10-12、GAS配布が復旧し、LINEで管理者権限が有効と判定されることを実機確認済みです。

## どのファイルが何を司るか

| ファイル | 責務 | 消すとどうなるか | 魔改造 |
|---|---|---|---|
| [index.html](index.html) | **現役**LINE MINI Appの画面・LIFF初期化・GAS通信 | LINEで画面が開かなくなり、D4〜D8すべてのボタンを失う。既存のGoogle Sheetsデータは消えない | HTMLは表示、CSSは見た目、JavaScriptは動作 |
| [bridge-test.html](bridge-test.html) | 非機密PING/PONGの独立試験 | 本体は壊れないが、通信だけを切り分ける診断が難しくなる | form POST / iframe / postMessageの教材 |

全体のデータ構造、GAS各ファイルの依存と削除時の影響は
[TLHコード構造と魔改造ガイド](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/コード構造と魔改造ガイド.md)
を参照してください。

## index.htmlの構造（上から読む順序）

### 1. `<head>`

- `meta viewport`：スマホ画面に合わせる指定
- LIFF SDKの`<script src="https://static.line-scdn.net/liff/edge/2/sdk.js">`：LINE SDK本体
- `<style>`：文字・余白・カード・ボタンなどのCSS

**変えるなら**：色や余白はCSSを修正。LINE SDKを削除すると`liff.init()`が使えなくなる。

### 2. `<body>`のカード

| HTMLのid | 担当 |
|---|---|
| `status-title`, `status-detail` | LIFF初期化・ログイン・ID tokenの存在を表示 |
| `bridge-section`, `bridge-button` | D4公開PING/PONG |
| `auth-section`, `auth-button` | D5 LINE公式による本人確認 |
| `account-section`, `account-button` | D6 TLH Accountと従業員登録の照会 |
| `signup-section`, `signup-button` | D7 一般TLH Accountを本人が作る |
| `admin-section`, `admin-button` | D8 TLH管理者権限の読み取り診断 |

ID（識別名）はJavaScriptの`getElementById`で参照しているため、
**HTML側だけで名前を変更するとボタンが機能しなくなる**ことがあります。

### 3. 通信用の5つの隠しiframe

`tlhBridgeFrame`、`tlhAuthFrame`、`tlhAccountFrame`、`tlhSignupFrame`、`tlhAdminFrame`。

別のWebサイトで動くGASにHTMLフォームでPOSTするとき、
現在の画面を遷移させず、結果のHTMLを受け取る専用の枠です。
GASはHTML内部から`postMessage`でLINE画面へ結果を通知します。

**削除すると**：対応する送信先がなくなり、正常なGASの応答を受け取れない。
**重要**：この方式の現行セキュリティ評価は固定コードの診断（D8を含む）とD7一般登録までに限定される。
従業員の氏名・給与・銀行情報をそのまま返すことは不可。

### 4. JavaScriptの設定と共通処理

- `LIFF_ID`：LINE MINI Appと画面を関連付ける公開識別子（秘密鍵ではない）
- `GAS_URL`：GAS Webアプリの公開URL
- `setStatus()`：診断画面を更新
- `initializeLiffWithTimeout()`：起動失敗時に待ち続けないための処理
- `createBridgeNonce()`：通信ごとのランダムな照合番号
- `start()`：画面を開いたらLIFFを初期化

**削除すると**：`setStatus()`の削除ではエラー表示すらできなくなった実際の事例がある。
一度の大きな文字列置換で「不要な関数」と一緒に共通関数まで消さない。

### 5. 5つのボタンの処理

`bridgeButton.addEventListener('click')`などで検索すると、押したときの処理へ移動できる。

```text
ボタンを押す
 ↓
LINEから必要なID tokenを取得（PINGでは不要）
 ↓
nonceを生成し、HTTP formのPOST bodyでGASへ送る
 ↓
GASでLINE本人確認・照会・登録など
 ↓
隠しiframeのHTMLからpostMessageで結果を受信
 ↓
対応する画面上のテキストだけを更新
```

POSTの`action`名を変えると、GAS側の`Api.gs`のルーティングも揃える必要がある。
`idToken`をURL/ログ/localStorageへ置かない。
画面の結果コードをサーバーの権限判定の代わりにしてはいけない。

## 現時点での機能状態

- D3：LINEログインとID token取得 — **LINE実機で成功**
- D4：LINE内PING/PONG — **実機成功**
- D5：GAS側LINE本人確認 — **実機成功**
- D6：TLH Account登録状態確認 — **実機成功（未登録と正しく判定）**
- D7：本人によるTLH一般アカウント作成 — **登録・再照会が実機成功、登録受付はfalseへ戻したと利用者確認済み**
- 初期管理者権限付与 — **2026-10-11に利用者がRoleAssignmentsへの追加と一時関数の削除を確認済み**
- D8：LINE本人確認後の管理者権限診断 — **2026-10-12に「管理者権限：有効です」を実機確認済み**

登録の初期状態は無効。GAS側Script Property `TLH_ACCOUNT_SIGNUP_ENABLED=true`に
一時的に設定した間だけ一般アカウントを作成できる。登録後は`false`へ戻す。

## 改造の前に

1. GitHubの`main`で現役ファイルかを確認する。
2. HTML ID・関数名・GAS側action名の使用箇所を検索する。
3. GitHub Pagesのデプロイ`success`を確認する。
4. LINE MINI Appの実機で動作を確かめる。
5. 今回学んだこと・エラー・設定を両READMEへ記録する。

このフォルダにソースがあるのは**画面**だけです。
従業員情報、アカウント情報、給与の処理は
`inhokkaido12345-lab/tlh-platform/gas/workforce/`へ置きます。


### 2026-10-11: D8 — LINE実機の初期管理者権限の読み取り診断

`workforce/index.html`をD8へ更新し、`自分の管理者権限を確認する`ボタンを追加。

処理はLINE ID tokenをHTTPS form POST bodyへ送信し、GASがLINE公式による本人確認と`RoleAssignments`内の`TLH_ADMIN/GLOBAL/ACTIVE`・有効期間を再検査する。返すのは`ACTIVE_TLH_ADMIN`など固定コードのみで、個人ID・給与情報・Sheetのレコード内容は返信しない。

D8は**診断用**であり、管理者表示を今後の書込APIの認可代わりに使ってはならない。

**当時の公開上の注意：** 2026-10-11はGAS配布が`invalid_rapt`で停止し、D8の実機成功は未確認だった。2026-10-12に限定権限のOAuthへ移行し、GitHub ActionsからGASへの配布・公開更新が成功。LINE実機でも管理者権限が有効と表示された。GAS編集画面での手動ソース編集は行っていない。

GitHubで画面を管理し、GASの正本は`tlh-platform`のmainに置く。[配布復旧の記録](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/GAS-配布認証修復.md)には、認証更新を必須にした自動配布成功と、公開版14ファイルが正本と一致したことを記載した。既存Web AppのURLは維持。翌日以降の再配布は未検証。

削除すると：`workforce/index.html`内のD8カード・専用iframe・対応イベント処理を消すと管理者権限の診断のみ使えなくなる。既存の`RoleAssignments`は削除されない。
