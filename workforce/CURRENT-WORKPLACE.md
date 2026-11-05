<!-- current-doc-status:start -->
> 2026-11-05資料整理：機能仕様と保守資料。現在の公開・設定・未達状況は[最新状態](CURRENT-STATUS.md)を優先してください。本文の過去の日付・版・検査件数は当時の記録です。恒久的な安全方針は引き続き適用します。
<!-- current-doc-status:end -->

# このタイムカードの店舗

今の公開先を1店舗用として使い、各業務画面に会社名・店舗名を表示します。LINEログイン前も表示され、追加API通信はありません。別会社/別店舗を選ぶ機能ではありません。

表示は`current-workplace.js`のconfig、配置は各HTMLの`data-current-workplace`、色/余白は`app.css`の`.current-workplace-mark`です。削除すると店舗名が消えます。表示名は変えられますが、不変のorganizationId/workplaceIdを名称の変更に合わせて書き換えません。

このhelperは既存のPOSTへ固定の会社/店舗IDを付けるだけで、token・操作ID・打刻時刻・訂正内容を変更しません。保存先/最新認可はGASで毎回検査します。URLに別店舗の指定があると警告し送信しません。GASの設定と二つの保存先の所属表が一致しなければ、他店舗へ保存せず拒否します。

一般化の鍵は「店舗名は目印、固定IDは対象、LINE/roleは操作の許可」です。魔改造でこの三つを混同しません。共通Accountや既存履歴を店舗名で作り直す処理はありません。

Node.js 22で`node --test tests/*.mjs`。backendの`docs/今の店舗の識別と運用開始.md`に設定・保存先列・戻し方と連結検査を記録します。sandbox/表示見本は対象外です。複数店舗の運用は別の会社分離版が必要です。
