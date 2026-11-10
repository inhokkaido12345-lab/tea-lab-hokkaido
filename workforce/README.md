# TLH Work Time：利用・開発・保守

公開入口は https://tealabhokkaido.com/software/worktime/ 。制作元は **TEA LABORATORY HOKKAIDO/SOFTWARE/xxx**（部門名未定のためxxx）。コード正本はGitHub main、シフト編集データの正本は専用Sheet。GAS編集画面や生成HTMLを手で直しません。

## まず読む場所

| 目的 | 資料 |
|---|---|
| 現在の公開版・未完了 | [現在地](CURRENT-STATUS.md) |
| 従業員の登録・打刻・訂正・PWA | [従業員ヘルプ](employee-help.html) |
| 従業員管理・承認・月次提出・シフト作成 | [管理者ガイド](admin-guide.html) |
| シフトの入力と公開 | [シフト](SCHEDULE.md) / [管理操作](SCHEDULE-MANAGEMENT.md) / [入力形式](SHEET-INPUT.md) |
| ファイルごとの詳説 | [説明書索引](DOCUMENTS.md) |

## 利用できる範囲

LINEログイン、招待による従業員登録、出勤・休憩開始/終了・退勤、同日複数勤務、日別/月次記録、本人の訂正申請、管理者の直接訂正/承認を扱います。本社提出PDFは全勤務・全休憩の打刻明細と実働/休憩合計、CSVも出力できます。未退勤は未確定、記録なしを休日や0時間とみなしません。

従業員の「シフト」は全員の確定月暦と本人申請/同意。管理は「従業員の管理」「出退勤の管理」「シフトの管理」に分かれ、管理者本人の申請も従業員側から行います。「その他」には本人情報を自動表示します。

シフトはSheetで勤務/公開備考/非公開備考/用事/休暇/共有イベントを編集し、アプリで差分を確認して**月全体を公開**。希望休は任意の日付範囲と締切を設定し、設定のない日は申請可。確定勤務の変更は同意・承認を維持します。空欄は削除指定、未設定と公休は別。月別従業員メモは初回だけ直近過去月から継承し、その後は月ごとに独立します。

独自パスワード/メール/SMS、オフライン打刻、給与/法定割増の完全計算、複数会社の実切替、新環境の完全復元は未達。遠隔復旧と運営専用機能は、配布と受付/初期権限の有効化を区別してください。

## ゼロから開発環境を作る

Git、Node.js 22、Python 3を用意します。通常の画面検査・再生成にGoogle認証やnpm installは不要です。既存フォルダがある場合は先にgit statusを確認し、resetしません。

```powershell
git clone https://github.com/inhokkaido12345-lab/tea-lab-hokkaido.git tea-lab-hokkaido-work
Set-Location tea-lab-hokkaido-work
git status --short
python scripts/sync-schedule-workspace.py
python scripts/build-workforce-design-preview.py
python scripts/sync-worktime-url.py
python scripts/sync-worktime-url.py --check
node scripts/audit-worktime-assets.mjs
node --test tests/*.mjs
```

ファイルを開くだけの見本はdesign/以下の操作不能プレビュー。実LINE/GASは公開HTTPSが必要で、見本を開いたことを実保存の成功と扱いません。backendは隣にtlh-platform-workを取得し、そのREADMEの固定UI clone/WORKFORCE_UI_SOURCE_DIR手順で連結検査します。hash不一致を消すだけの上書きはしません。

## 責務と魔改造MAP

| 変更するもの | 編集元 | 連動・削除の影響 |
|---|---|---|
| 5タブと管理の分類 | index.html / layout.js | 表示通知だけ。hidden/disabledを認可の代わりにしない |
| 打刻と起動READ | punch.js / home-read.js / auto-read.js | 保存確認/固定ID/署名を維持。背景概要より表示タブを優先 |
| シフト画面の接続 | schedule-workspace.js | 初めて表示する役割だけ初期化。1役割1controllerを保持し、入力/通信を作り直さない |
| 本人シフト | schedule.js / schedule-view.js / schedule-report.js | 月暦/本人希望と共有印刷。私的情報を共有へ混ぜない |
| 管理シフト | schedule-management.js / contract | Sheet確認→明示反映→月全体公開。希望受付は別の設定 |
| 記録・本社提出 | attendance-journal.js / monthly-report.js / monthly-report.css | 全打刻と合計。専用CSSを外すとPDFの明細が欠落する |
| 訂正と承認 | day-change.js / 役割別HTML | 原打刻を残しSELF/DIRECT/REVIEWを分離 |
| 配色・タイポグラフィ | app.css / schedule.css | 共通画面と印刷へ波及。提出PDFの専用指定と回帰確認 |
| 公開HTML生成 | scripts/sync-schedule-workspace.py / sync-worktime-url.py | 単独シフトHTML→indexの生成ブロック→software/worktime。生成物を手編集しない |
| 旧CSV/一括編集 | schedule-sheet.js / schedule-bulk*.js | 通常HTMLからは読まない。互換試験の参照を確認せず削除しない |

コメントは責務・呼出先・削除影響・一般概念・改造箇所・秘密の境界・検査を記します。名称/文言の整理でaction/DOM id/iframe/HMACを変えません。削除前はscript/init/DOM/試験の参照を検索します。

## 印刷の検査

通常のnode検査に加え、開発用Playwrightがある環境で `node qa/verify-monthly-report-print.mjs`、pypdfがあるPythonで `python qa/check-monthly-report-pdf.py`。既存モジュール/Chromeを使う場合はTLH_PLAYWRIGHT_MODULE / TLH_CHROME_EXECUTABLEを指定できます。アプリ本体の実行依存は増えません。[提出PDFの仕様と再現](MONTHLY-REPORT.md)。架空データだけで、明細・合計・改ページと、未認可時にhiddenが維持されることを確認します。

## 公開と障害対応

差分確認→対象/全体/固定UI連結検査→必要な公開承認→main/既存配布→配信一致/実READ確認。UIだけなら不要なGAS再配布やSecret再認証はしません。今回の整理候補と既存公開版は[現在地](CURRENT-STATUS.md)で分けています。

結果不明の保存は同じ操作ID/入力で再確認し、新規送信を重ねません。原打刻・内部ID・履歴を消して復旧せず、token/鍵/個人情報をURL/console/Storageへ出しません。遅いからといって最新認可や保存後の全行読戻しを省略しません。[性能](PERFORMANCE.md)、[起動](STARTUP.md)、[自動読取](AUTO-READ.md)、[URL移行](URL-MIGRATION.md)。

公開の経緯と旧説明は[今回の整理前README](history/20261110-before-maintenance-README.md)に保存しました。履歴に残る半月公開/CSV入力/未公開という記述を現行指示へ戻さないでください。
