# Workforceの恒常ルール

## 分離した試験LINE Account登録（2026-10-17）

所有者は別試験GASと空試験Sheetへの本人Account1件（権限なし）を明示了承。
workforce/sandboxの独立HTML/controllerだけを追加。通常index/LIFF設定/各controller/本登録保留/受付閉鎖は維持。
試験GASの5ソース/公開先検証後のみ固定gasUrlを設定。query/保存値からの接続先指定や本番URL流用は禁止。
GASへのtoken送信は明示登録/読取のPOSTだけ。コード/Web Crypto nonce/HMAC鍵はメモリ/POST限定。
登録不明結果の自動再送なし。画面の登録済みを従業員/管理者/Google-LINE照合の完了と説明しない。
公開/LINE実登録/再照会はprivate repoのdocs/試験用-LINEアカウント登録.mdへ別々に記録する。

## UI1の簡易整理（2026-10-15）

所有者は簡易見本を了承し、テスト成功後に同じLINEアプリへ公開することも明示了承。
デザインの磨込みは後回し。配置/見出し/従業員・管理者tabだけを変更し、既存Service/通信契約は保つ。
layout.jsは新設pane wrapperだけを切り替える。既存controllerのhidden/disabled/draft/結果を上書きしない。
タブ選択は認可ではない。招待受取りとadmin操作の共通staff-statusは消去/再送せずそのまま保持する。
D14準備結果を通常の勤務状態・打刻に使い、D13単独照会は診断へ保持。受付閉鎖中に勤務状態も取得できたと書かない。
layout.test.mjsは実HTMLのIDで全controllerを模擬起動。描画/LINE実機とは区別し、本登録保留/受付閉鎖を維持。

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
