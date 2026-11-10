# 起動・待機表示・改造の入口

## 現在の起動順

新URLでは生成HTMLの本文DOM→LINE SDK→依存順のcontroller→末尾の起動処理→LINE初期化、の順です。`workforce/`は編集元兼共有資産の場所。旧HTMLのheadにだけ互換転送scriptがあり、新URLの生成HTMLでは除外します。現在の外部script本数を固定18本として案内しません。

起動READは管理権限・打刻準備・本日記録の3項目をhome-read.jsで1 POSTへまとめ、完了後に名簿/承認件数へ進みます。管理権限がなくても本人読取は別に判定します。「その他」の本人情報、「記録」の日次/月次、「シフト」の本人月暦、管理シフトのbatchReadは表示時に必要な分だけ取得します。[読取の地図](AUTO-READ.md)。

通信中は状態欄のaria-busyと軽量CSS表示を使い、完了/拒否/不明をcontrollerが判断します。時計の動きは通信成功の証明ではありません。

## 改造・削除時の影響

- controllerは依存元を先に、末尾の起動処理より前へ置きます。async/deferの一括追加で実行順を変えないでください。
- 起動処理を消すと本人確認と初期化が停止。controller削除はinit/DOM/iframe/試験を検索してから判断します。
- 自動化するのは固定READだけ。登録・打刻・申請・承認・停止・訂正preview・保存結果不明の再送は追加しません。
- 未送信入力・応答鍵・本人情報の永続キャッシュは作りません。bfcache復元時は再読込し、最新認可へ戻します。
- 統合HTMLの再生成後、公開URL用HTMLも再生成します。編集箇所は[README](README.md)、URL/PWAは[移行手順](URL-MIGRATION.md)。

## 検査と性能の読み方

`node --test tests/*.mjs`のstartup-loading/layout/home-read/auto-read等と、backend連結検査を使います。表示開始の待ちを減らす変更と、GAS/LINE/Sheetsの往復秒数は別です。[性能記録](PERFORMANCE.md)を参照し、昔の計測値を現行の実打刻時間として再利用しません。

[説明整理前の記録](history/20261110-before-guidance-audit-STARTUP.md)。

## 表示時の初期化（今回の未公開候補）

schedule-workspace.jsは本人/管理のcontrollerを最初の表示時だけ作る構成です。起動時は0個、本人だけ開けば1個、認可された管理画面も開けば各1個。未表示のフォーム準備とmessage/保存イベントの購読を起動時に走らせません。タブ往復では再生成せず、未送信入力/通信/結果不明を保持。保存成功の相互無効化と、入力破棄の明示確認は継続します。

これは初期化回数の削減で、GAS通信秒数の改善を示す実測ではありません。`node --test tests/schedule-workspace.test.mjs` で起動0回、1000回の往復でも各1回、未認可・管理先行・入力保持を確認します。

実DOMのオフライン確認は開発用Playwrightで `node qa/verify-schedule-lazy-init.mjs`。既存モジュール/Chromeの指定はTLH_PLAYWRIGHT_MODULE / TLH_CHROME_EXECUTABLE。実際のHTMLとcontrollerを使い、外部通信は遮断して管理先行/失権/1000回の再表示と入力が未認可で有効化されないことを検査します。
