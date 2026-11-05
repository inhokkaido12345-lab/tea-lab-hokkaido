# 打刻・起動の待ち時間

2026-11-05の公開前候補です。公開状態は[CURRENT-STATUS](CURRENT-STATUS.md)を優先します。

## 変更点

起動時の管理者確認と従業員の勤務状態を同時に送らず、auto-read.jsで管理者確認→勤務状態→本日記録→名簿・承認通知の順に開始します。管理者確認が拒否/タイムアウトしても従業員の読取りは進みます。保存・打刻・再送を自動実行しません。承認通知も残します。

admin-overview.jsのautoLoadは通常trueのまま。ホームだけfalseにして既存の読取りキューから開始します。変更時はindex.htmlの接続とlayout/admin-overview試験を一緒に確認します。キューを外すとGASの共通Lockを同時に待つ要求が増えます。

punch.jsのonTimingは任意の診断callbackです。ホームは既存のブラウザconsoleに`TLH_UI_TIMING_V1`としてphase（read/write）、outcome（response/timeout/send_error/cancelled）、elapsedMsだけを出します。本人情報、社員番号、打刻ID、token、入力、応答鍵を出しません。callbackが失敗しても保存判断は変えません。保存結果不明時の同じ固定IDによる再送を維持します。responseは業務成功という意味ではありません。

## 確認方法

GitとNode.js 22を用意し、このrepoで`node --test tests/*.mjs`を実行します。backend側の固定UI/hashを更新し連結検査も行います。GitHub main→Pagesが公開経路です。GAS手編集や新しい計測サービスは不要です。

公開前の実Googleでは、勤務状態の読取り1回でGAS内7.917秒を確認しました。打刻保存の秒数・通信往復・改善後の秒数は未確定です。架空台帳ではbackendの読取り16→12回ですが、秒数25%減を保証しません。

公開後はログイン済みの同じ画面で「勤務状態を更新」を1回ずつ実行し、consoleの参考時間とGASの匿名区間ログを比較します。本人の本来の打刻を観察し、試験用の本番打刻を作りません。保存応答とその後の状態更新は別の要求です。ネットワーク・端末時計・同時利用者で変動するため、1回だけで一般化しません。

原簿の追記、保存後の全行確認、固定ID再送、最新認可、共有Lockは残っています。オフライン保存・認可キャッシュ・新しいログイン方法は追加していません。仕組みを戻す場合もGitで逆差分を作り、検査後にmainから公開します。

全体の起動は[STARTUP](STARTUP.md)、再送と保存境界は[README](README.md)へ。区間の固定名や認可scopeを改造する場合はprivate backendの「打刻の時間計測と待機削減-20261105.md」も更新します。
