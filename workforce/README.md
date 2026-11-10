# TLH Work Time：利用・開発・保守

公開アプリは **https://tealabhokkaido.com/software/worktime/**。制作元は **TEA LABORATORY HOKKAIDO/SOFTWARE/xxx**（xxxは未定の部門ブランド名）です。[現在地](CURRENT-STATUS.md)、[従業員ヘルプ](employee-help.html)、[管理者ガイド](admin-guide.html)、[説明書索引](DOCUMENTS.md)から目的の資料へ進めます。

## 使える機能と担当する画面

| 利用者 | 入口 | 操作 |
|---|---|---|
| 従業員 | 打刻 | 出勤・休憩開始/終了・退勤。同日再出勤、日またぎ |
| 従業員 | 記録 | 今日・今月の集計、日別記録、本人の訂正申請 |
| 従業員 | シフト | 全員の確定月暦、本人の希望休・変更申請・同意、PDF/CSV出力 |
| 従業員 | その他 | 本人のアカウント情報を自動表示、初回招待受取り、ヘルプ |
| 管理者 | 管理→従業員の管理 | 事前登録・招待・氏名/入社日訂正・利用停止・社員番号変更 |
| 管理者 | 管理→出退勤の管理 | 月次提出、直接訂正、氏名付きの訂正承認待ち |
| 管理者 | 管理→シフトの管理 | 「シフト編集・公開」「希望休」の二分類 |

管理者本人の訂正申請も従業員側から行います。管理の入口は最新の権限確認まで無効。表示だけで認可せず、GASが操作ごとに本人・会社・店舗・権限を検査します。

LINEログインが現在の認証方法です。独自パスワード・メール/SMS認証、オフライン打刻、給与/法定割増の完全計算は未対応です。シフトが未設定でも、従業員登録と受付が有効なら打刻できます。運営Webは配布済みですが専用台帳/初期運営権は未設定、遠隔LINE復旧受付は閉鎖中です。新環境の初期勤怠管理者・完全復元は未実証です。

## シフト：編集はシート、アプリは確認・反映・公開

管理→シフトの管理→「シフト編集・公開」で月を選び、正本シートを編集します。「下書きを公開する」で月全体の差分を確認し、一度に公開。半分の日だけ記入しても残りは未設定です。希望休の締切とは独立し、既存勤務の変更は本人同意・管理者承認を維持します。希望休の開始日/終了日/締切日時は「希望休」内で設定します。

CSV入力・画面内セル編集・専用取込みボタン・下書き一覧はありません。**勤務・備考の空欄は削除の指定**です。公休は明記し、予定未設定を休日・0時間に読み替えません。確定後の勤務変更は理由・本人同意・管理者承認を維持します。[管理手順](SCHEDULE-MANAGEMENT.md)、[入力形式](SHEET-INPUT.md)。

「希望休」で受付締切と承認を扱います。全日の希望休承認直後、入力シートの非公開備考へ「希望休」を追記。競合する予定を残して「【希望休と競合】」を併記するので、管理者がシートで調整します。承認だけで勤務を消したり確定公開したりしません。他の申請は正本一致・本人同意等の条件を維持します。

`YYYY-MM従業員メモ`の「当月メモ（管理者用）」へ「火木不可」などを記入します。新規月作成時だけ直近の過去月から社員IDで継承し、なければ空欄。その後は各月独立です。参考情報であり勤務制約・全員公開・給与へ自動変換しません。旧共通メモは現行の入力先ではありません。

## 新しいPCで開発する

Git、Node.js 22、Python 3を用意します。画面試験・HTML再生成にnpm installや追加Pythonパッケージ、Google認証は不要です。

```powershell
git clone https://github.com/inhokkaido12345-lab/tea-lab-hokkaido.git tea-lab-hokkaido-work
Set-Location tea-lab-hokkaido-work
git status --short
python scripts/sync-schedule-workspace.py
python scripts/build-workforce-design-preview.py
python scripts/sync-worktime-url.py
python scripts/sync-worktime-url.py --check
node --test tests/*.mjs
```

既存フォルダや未コミット変更を上書きしません。試験は架空DOM/LINE/通信と実Web Cryptoで行い、HTMLをファイルとして開いて実打刻を試しません。GASの変更・連結試験は、隣にprivate `tlh-platform-work`を取得し、そちらのREADMEに従います。全14個の固定UI参照とworkflowを同じ検証版へ揃え、hash不一致を黙らせるためだけの更新はしません。

## ファイルの責務と魔改造MAP

| 変更対象 | 編集元 | 削除・改造の影響 |
|---|---|---|
| 色・余白・字体 | app.css / schedule.css | 共通画面と印刷へ波及。hidden/disabledを見た目で解除しない |
| 5タブ・管理内の分類 | index.html / layout.js | 表示だけを担当。保存中の入力や権限状態を変えない |
| 打刻・本日の記録 | punch.js / home-read.js | 最新認可・固定ID・保存確認を維持。shell.jsの時計は表示だけ |
| 日別・月次提出 | attendance-journal.js / monthly-report.js | 本人と管理者を分離。給与の確定値として扱わない |
| 訂正申請・直接訂正・承認 | day-change.jsと役割別HTML | SELF/DIRECT/REVIEWと原打刻を残す方式を維持 |
| 本人のシフト閲覧・希望 | schedule.js / schedule-view.js / schedule-report.js | 月全体の月暦・申請一覧・共有出力。保存区分と期待版は希望日から選択。管理操作を混ぜない |
| 管理シフト | schedule-management.js / schedule-management-contract.js | シート確認→明示反映→半月公開。digest/期待版/固定ID/同意を維持 |
| 統合シフト・公開HTML | scripts/sync-schedule-workspace.py / scripts/sync-worktime-url.py | 元ページから再生成。生成済みブロックやsoftware/worktimeを手編集しない |
| 旧CSV・旧一括編集 | schedule-sheet.js / schedule-bulk*.js | 互換検査用。現役管理ページでは読み込まない。削除前に参照を検索 |
| 本人情報・権限・通知 | account-info.js / admin-access.js / admin-overview.js | 本人情報自動表示、管理入口、名簿/件数。画面表示を保存認可に使わない |

削除前にscript読込/init/DOM id/iframe/試験を検索します。責務・呼出元/先・削除影響・一般概念・改造箇所・秘密の境界・検査のコメントを挙動と同期します。[シフト保守](SHIFT-MAINTENANCE.md)、[起動](STARTUP.md)、[読取](AUTO-READ.md)。

## 公開・障害時

コード正本はGitHub main、GASは既存Actions/claspの配布コピーです。シフト入力データの正本がシートであることとは別です。GASソースや生成物の手編集、新サービス追加はしません。

差分と既存変更を確認→試験/連結検査→確認用ブランチ/PRの検査→必要な公開確認→main/既存配布→公開一致/読取確認、の順です。GAS契約変更時はGAS→画面。設定・権限・受付・実データ変更は別に確認します。UI/説明のみの更新でGASを再公開しません。

不明な保存結果は同じ操作で再確認し、新規送信を重ねません。原打刻・履歴・内部IDを消して復旧しません。token/鍵/個人情報/招待秘密をURL・console・端末Storageへ保存しません。移行後のLINE/PWA・切戻しは[URL移行](URL-MIGRATION.md)、性能の実測と限界は[PERFORMANCE](PERFORMANCE.md)。

[説明整理前の記録](history/20261110-before-guidance-audit-README.md)。
