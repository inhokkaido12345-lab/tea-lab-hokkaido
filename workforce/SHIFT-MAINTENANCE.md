# シフトを自分で改造するための地図

操作は[SCHEDULE](SCHEDULE.md)、管理は[SCHEDULE-MANAGEMENT](SCHEDULE-MANAGEMENT.md)、入力は[SHEET-INPUT](SHEET-INPUT.md)。公開URLと編集元を混同しないよう[URL移行](URL-MIGRATION.md)も参照します。

## 現行の責務

| 部品 | 担当 | 削除時の影響 |
|---|---|---|
| schedule.html / schedule.js | 本人の月暦・希望/変更申請・同意 | 本人シフトの操作/読取が停止 |
| admin-schedule.html / schedule-management.js | 二分類の管理、シート作成/READ/確認/反映/公開、希望受付/承認 | 管理シフトが停止。原打刻は別 |
| schedule-management-contract.js | シート/管理応答の構造・月・社員・digest検査 | 未検証データを表示しない境界が失われる |
| schedule-view.js / schedule-report.js | 取得済みデータの索引/JST表示、共有DTOからのPDF/CSV | 表示/出力が停止。通信/認可は担当しない |
| schedule-workspace.js | 本人/管理の別フォーム・月・状態を既存LIFFへ接続 | 統合画面の接続が停止 |
| scripts/sync-schedule-workspace.py | 単独の本人/管理ページからホームの2範囲を生成 | ホームへ修正が伝わらなくなる |
| scripts/sync-worktime-url.py | 編集元から新URL用HTMLを生成 | 新URLへ修正が伝わらなくなる |
| GAS ScheduleInputSheet / ScheduleSheetAuthority | 統合入力正本・月別メモ・下部明細・V2互換・差分/digest | シート確認/取込みが停止 |
| GAS ScheduleService / Store / BridgeSchedule | 最新認可・期限/版/同意・保存/読戻し・署名 | シフトの読取/保存が停止 |

schedule-bulk*.jsとschedule-sheet.jsは旧client/互換検査用です。通常の管理入口からは読みません。旧編集表を新UIへ戻したり、互換参照の確認なしに削除したりしません。

## データの流れと権限

本人はmonthRead→全員向け確定DTO/本人情報→本人申請。管理はbatchRead→シートREAD→差分の明示確認→必要な取込み→月全体公開です。取込み・公開はいずれも月全体。希望受付の範囲/締切とは独立します。公開前のsourceDigest再照合と期待版・固定ID・保存後読戻しを維持します。

画面内編集や日別planの直接送信は現行管理手順ではありません。勤務/備考/用事等はシートで編集し、確定後の勤務変更は本人同意/管理者承認を経ます。月型の表示、希望受付の日付範囲、実打刻、給与の判定は別の概念です。

一般従業員は本人申請と全員向け確定情報、管理者は固定認可済みの管理情報を扱います。管理HTMLが公開されていてもGASが毎回本人・最新role・店舗・対象を確認します。画面audienceやhidden解除を認可にしません。運営roleへ個別勤怠閲覧を暗黙継承させません。

## 魔改造時の連動箇所

- 色/字体/余白はapp.css・schedule.css。署名検査やdisabledを変更しない。
- 全員向けの列はServiceの共有DTO→UI検査/描画→reportの許可列を同期。非公開メモ・理由・用事の名称/場所は出力しない。
- 入力形式はGAS正本parser/Model/入力タブ作成/列辞典/拒否試験を同期。既存JSON/hashを推測変換しない。
- 月別メモは社員IDで初回継承。既存月や過去月の修正を他月へ伝播しない。勤務禁止の自動条件にはしない。
- 希望締切/公開条件はServiceとUIの案内を同期。通常希望と年休等の申出を混同しない。
- 固定ID再確認中は別の操作へ変えず、正本の版が変わったら止める。補償や停止印を消して再開しない。

```powershell
python scripts/sync-schedule-workspace.py
python scripts/build-workforce-design-preview.py
python scripts/sync-worktime-url.py
python scripts/sync-worktime-url.py --check
node --test tests/*.mjs
```

backendの固定UI/連結検査も更新します。確認目的の勤務・承認・シート初期化を本番で実行しません。

[説明整理前の記録](history/20261110-before-guidance-audit-SHIFT-MAINTENANCE.md)。

## 初期化を改造する時（今回の候補）

schedule-workspace.jsは本人/管理の初回表示にだけ各controllerを作ります。表示のたびinitすると購読や保存listenerが重複し、入力も消えるため禁止。生成済みUIを保持することと、最新認可をcacheすることは別です。[起動と検査](STARTUP.md)。
