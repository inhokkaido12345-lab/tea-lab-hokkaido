# Workforce画面の模擬テスト

このフォルダは架空DOM/LIFFと実際の暗号計算でcontrollerを検査します。
実LINEへログインせず、実GASへHTTP送信も実社員登録も行いません。
現役画面の地図は[workforce/README](../workforce/README.md)。GAS側テストは別のprivate repoです。

## 実行場所と順番

PCのターミナルでこのrepoの作業コピーへ移動し、`Get-Location`で確認します。

```powershell
node --test tests/daily-summary.test.mjs
node --test tests/monthly-work-summary.test.mjs
node --test tests/*.mjs
```

最初は変更対象、共有表示関数なら両集計、公開前は全件です。
2026-10-13時点は全54件。将来数は増減するので`fail 0`、中断/想定外スキップなし、対象repoを確認します。
配布用Google再認可は不要です。GASソースが変わる場合はbackendの全テストも必要。

## テストの読み方

各ファイルの`harness()`が新しい架空環境を作ります。`h`という名前はその環境の変数です。
使うhelper名はテストごとに異なるので、同名のharnessが全て同じAPIだと思わないでください。
`click`は架空ボタンのイベントを呼び、`sent`は実送信ではなく送信予定フィールドを記録します。
`reply`は架空のGAS返信を作り、実HMACを計算してmessage listenerへ渡します。
`node(...).textContent`/`hidden`/`disabled`等が期待値かを`assert`で確認します。

| 変更内容 | 対応テスト | 残すべき拒否/再試行条件 |
|---|---|---|
| ダミー操作 | workforce-invitation | HMAC、二重タップ、同招待の再送、解除 |
| 個別招待 | staff-enrollment | 管理者UI表示、同じdraft、取消し、秘密の表示/消去 |
| 訂正/停止 | staff-maintenance | 対象確認、明示同意、指紋、同操作ID、不明結果 |
| 勤務状態 | work-state | 本人証明、固定状態、遅延/偽装/停止印 |
| 打刻 | punch | 状態別候補、閉鎖、同eventId再送、競合/不明結果 |
| 集計表示 | daily-summary、monthly-work-summary | 型/暦日/整数時間、summary全体署名、古い集計消去 |

`expected`は期待値、`actual`は実際です。仕様変更なら期待値を同期しますが、
なぜ新しい値でよいか説明できることが条件です。拒否テストや署名検査を削って通さないでください。
表示用durationは日次/月次で共有。`daily-summary.js`を消すと月次にも影響します。

## これだけでは証明できないこと

架空DOMは実ブラウザのレイアウト、Google iframeの挙動、LIFF SDKの実認証を完全再現しません。
全テスト合格とPages公開成功、GAS公開成功、LINE実機成功を分けて確認します。
文言/配置変更なら実画面の収まりも確認。確認のために本登録/実受付を開けません。
