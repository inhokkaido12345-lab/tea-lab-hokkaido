# 履歴：説明整理前の時点記録

この本文は現行手順ではありません。現在は親フォルダの同名資料を参照してください。

## 統合シフトの起動

schedule-workspace.jsが既存LIFFとauto-readを共用。本人monthRead→管理者monthRead→シート用batchReadを順に1回ずつ開始。従業員へは管理者READを送らず、タブ往復でも重複しません。共通月の変更/保存成功後も同じキューでREADだけを更新します。

単独3ページを正本に `python scripts/sync-schedule-workspace.py` でindexの明示範囲を再生成。続いて `python scripts/build-workforce-design-preview.py` で操作無効の見本を更新します。schedule-admin- prefixとtlhScheduleAdminFrameはcontroller/生成器/検査で同期。生成物やGASを手編集しません。

<!-- current-doc-status:start -->
> 2026-11-05資料整理：機能仕様と保守資料。現在の公開・設定・未達状況は[最新状態](../CURRENT-STATUS.md)を優先してください。本文の過去の日付・版・検査件数は当時の記録です。恒久的な安全方針は引き続き適用します。
<!-- current-doc-status:end -->

# 起動処理・重さ・魔改造の入口

最新の公開済み変更：[PERFORMANCE](../PERFORMANCE.md)。管理者確認→勤務状態→本日記録→名簿を既存キューで開始し、同時Lock待ちを抑えます。管理者確認失敗でも従業員読取りへ進みます。保存操作の自動実行は追加しません。

このWorkの対象は従業員情報・出退勤・シフトのWebです。POS/顧客向けサイトは別プロジェクトです。

## 現在の起動順

本文DOM → LINE公式LIFF SDK → 各controller → index.html末尾の起動処理 → LINE初期化 → 表示対象の読取。

ホームの外部script18本をheadから本文の後へ移しました。HTMLの先頭でJS取得/実行待ちをせず、画面の骨組みとCSSを先に解析できます。相手GASの処理時間を短縮した、という変更ではありません。秒数の改善は未計測です。

## 自分で変更するとき

- scriptを追加する場所：index.html末尾の外部script群。依存元を先に置き、起動処理の前に読み込む。schedule-view/report→schedule、auto-read→layout等の順序を維持。
- asyncは順序を保証しません。deferだけを追加すると、末尾の即時起動がcontroller定義より先に実行されるため、そのまま付けないでください。
- 起動処理を削除するとLINE初期化・タブ・各フォームが動きません。controllerを削除するとその機能が未定義になります。DOM idやinitの参照も検索してから変更。
- 自動化してよいもの：auto-read.jsの固定した読取だけ。登録/打刻/申請/承認/停止/再送は追加しない。
- キャッシュしてよいもの：現時点では既存の静的配信の範囲のみ。token/応答鍵/従業員名簿/打刻/未送信draftをStorageへ追加しない。

検査は`node --test tests/*.mjs`。startup-loading.test.mjsが本文とscriptの順序を、layout等の試験が実際のcontrollerと起動処理を検査します。GAS側の固定UI参照/hashと連結試験も更新します。実LINE端末・描画速度・印刷の受入れは別です。

[API/通信の変更方法](../README.md)と[デザインの改造](../DESIGN.md)も併読してください。PWAの起動範囲・個人情報の扱いは[PWA準備](../PWA.md)へ。
