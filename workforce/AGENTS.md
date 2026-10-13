# Workforceの恒常ルール

ここは現役LINE画面。ブランドサイト本体とは別のアプリです。
GitHub mainが唯一の正本。GASはprivate repoからActions/claspで配布するコピー。
GASへソース/一時関数を手入力しない。新しい外部サービスは追加しない。

READMEは初学者所有者の再構築・学習・引継ぎ資料。履歴と現行手順を分け、未検証を完成と書かない。
新規/改修する現役ソース冒頭に責務、呼出元/先、具体的な削除影響、一般概念、変更関数と連動ファイル、秘密の境界、検証の7項目を記す。
重要関数に目的/入力/結果/例外/理由/改造注意を残す。コメントは挙動と同期する。

削除前にscript読込/init/DOM/iframe/相手Bridgeの参照を検索。
daily-summary.jsのdurationは月次でも共有。GAS側の共有依存はprivate repoの構造ガイドを読む。
文言変更でaction/code/DOM id/HMACを変えない。契約変更はGAS/両repoテスト/説明を同期する。
token/招待秘密/氏名/指紋/集計をURL/console/localStorage/sessionStorageへ出さない。
同操作のretry draft/IDは固定、nonce/応答鍵は通信ごとに更新。連打/重複をUIとGAS両方で防ぐ。

本登録保留・実受付閉鎖を維持。実データ/管理者role/停止済み試験行を無断変更しない。
D17は検査部品で本番未接続。新環境の安全な初期管理者入口は未整備、手編集で迂回しない。
`node --test tests/*.mjs`→該当Actions→LINE読取を確認。模擬と実機を混同しない。
