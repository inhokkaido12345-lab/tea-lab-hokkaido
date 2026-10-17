# LINE試験登録の分離画面

所有者は2026-10-17に、分離した試験GASと空の試験Sheetへ、本人の権限なしAccountを1件作る工程を了承。
ここはそのLINE画面だけです。通常の`workforce/index.html`や各controller/本登録保留/打刻受付は変更しません。

`index.html`は配置と固定接続先、`account.js`はLIFF準備/明示POST/署名応答/秘密消去を担当します。
消すと試験登録だけが使えなくなります。正本はGitHub main、GASはprivate repoの専用workflowから配布。
private repoの`docs/試験用-LINEアカウント登録.md`が現行の準備/許可/列/再開手順です。

## 起動と操作

既存LIFFのEndpoint以下`/workforce/sandbox/`を使います。既存MINI Appの追加パス`/sandbox/`で二次redirectする設計です。
2026-10-17、試験専用GASの公開版1を5ファイル全文/固定先/公開範囲まで実API照合し、固定`gasUrl`を設定しました。URLのqueryから接続先を選びません。
LINE Developersの現設定は未ログインのため読めておらず、追加パスの実スマホ到達は未確認です。
最初はコード未発行のまま試験画面が開くことだけを本人に確認します。既存Endpointを変更して迂回しません。
LINE SDKのURL/queryは初期化前に加工せず、ページを開いただけでGASへtokenを送らない設計です。

所有者がGoogle側で発行したコードを、本人がLINEで入力・確認して登録します。
保存後は「自分の登録状態を確認」。成功しても従業員・管理者・初期管理者本人照合の完了ではありません。
通信結果が不明なら登録は自動再送せず、読取照会へ移ります。サーバーも同じ記録を二重保存しません。

## 検証と改造

`node --test tests/workforce-sandbox-account.test.mjs`は実HTMLとcontrollerを代用品で検査します。
署名/nonce/action/許可codeの変更はprivate側Api/Repository/両repoテストを同時更新してください。
code/token/応答鍵はページメモリとPOST本文だけ。console/URL/localStorage/sessionStorageへ残しません。
実LINE登録/Google保存/端末表示の成功はテストとは別に記録します。接続準備中の画面を登録完成と説明しません。
