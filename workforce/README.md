# TLH 勤怠管理フロントエンド — 初心者向けファイル説明

> このフォルダは、従業員がLINEから開く**画面**の正本です。
> こちらのGitHub PagesがHTMLを表示し、仕事の処理は別リポジトリのGoogle Apps Script（GAS）へ依頼します。
> 本文は2026-10-10のD7実装を基準に説明しています。

## どのファイルが何を司るか

| ファイル | 責務 | 消すとどうなるか | 魔改造 |
|---|---|---|---|
| [index.html](index.html) | **現役**LINE MINI Appの画面・LIFF初期化・GAS通信 | LINEで画面が開かなくなり、D4〜D7すべてのボタンを失う。既存のGoogle Sheetsデータは消えない | HTMLは表示、CSSは見た目、JavaScriptは動作 |
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

ID（識別名）はJavaScriptの`getElementById`で参照しているため、
**HTML側だけで名前を変更するとボタンが機能しなくなる**ことがあります。

### 3. 通信用の4つの隠しiframe

`tlhBridgeFrame`、`tlhAuthFrame`、`tlhAccountFrame`、`tlhSignupFrame`。

別のWebサイトで動くGASにHTMLフォームでPOSTするとき、
現在の画面を遷移させず、結果のHTMLを受け取る専用の枠です。
GASはHTML内部から`postMessage`でLINE画面へ結果を通知します。

**削除すると**：対応する送信先がなくなり、正常なGASの応答を受け取れない。
**重要**：この方式の現行セキュリティ評価は診断とD7一般登録までに限定される。
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

### 5. 4つのボタンの処理

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
- D7：本人によるTLH一般アカウント作成 — **コード・単体テスト・公開済み、実機登録はこれから**
- 管理者権限付与 — GASの非公開セットアップコードあり、**実機では未実施**

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
