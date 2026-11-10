# 説明書索引

## 現在の操作・保守

| 知りたいこと | 資料 |
|---|---|
| 利用・開発・再構築の入口 | [README](README.md) |
| 稼働状態と未完了 | [CURRENT-STATUS](CURRENT-STATUS.md) |
| 従業員の操作 | [従業員ヘルプ](employee-help.html) |
| 管理者の操作 | [管理者ガイド](admin-guide.html) |
| シフト運用/二分類/入力 | [SCHEDULE](SCHEDULE.md) / [SCHEDULE-MANAGEMENT](SCHEDULE-MANAGEMENT.md) / [SHEET-INPUT](SHEET-INPUT.md) |
| シフトの責務・魔改造 | [SHIFT-MAINTENANCE](SHIFT-MAINTENANCE.md) |
| 公開URL・LINE・PWA | [URL-MIGRATION](URL-MIGRATION.md) / [PWA](PWA.md) |
| 起動・読取・性能 | [STARTUP](STARTUP.md) / [AUTO-READ](AUTO-READ.md) / [PERFORMANCE](PERFORMANCE.md) |
| 作業規則・今回の説明監査 | [AGENTS](AGENTS.md) / [GUIDANCE-AUDIT](GUIDANCE-AUDIT.md) |

## 機能ごとの契約・保守

以下は個別機能の仕様です。古い計測日/検査件数と現在の稼働状態を混同せず、操作は上の現行ガイドを優先します。

- [ACCOUNT-INFO.md](ACCOUNT-INFO.md)
- [ADMIN-OVERVIEW.md](ADMIN-OVERVIEW.md)
- [CURRENT-WORKPLACE.md](CURRENT-WORKPLACE.md)
- [DESIGN.md](DESIGN.md)
- [LABOR-POLICY.md](LABOR-POLICY.md)
- [LOADING.md](LOADING.md)
- [LOGIN-RECOVERY.md](LOGIN-RECOVERY.md)
- [MONTHLY-REPORT.md](MONTHLY-REPORT.md)
- [OPERATIONS.md](OPERATIONS.md)
- [ROLE-PAGES.md](ROLE-PAGES.md)
- [SCHEDULE-LOGIN-RECOVERY.md](SCHEDULE-LOGIN-RECOVERY.md)
- [STAFF-CODE-CHANGE.md](STAFF-CODE-CHANGE.md)

## 旧項目の扱いと点検

`node scripts/audit-worktime-assets.mjs` は実際のHTMLが読むローカル資産を照合し、旧CSV関連が現行入口に戻っていないか確認します。旧コードを削除した数ではなく、参照/互換性と不要な初期化を検査します。今回の整理前原文は[整理前の記録一覧](history/20261110-maintenance-index.md)へ保存し、現行資料の重複公開ログだけを除きました。

## 過去の改修・公開記録

ここにある旧CSV/全月共通メモ/受付OFF/未公開/旧URLは当時の記録で、現行手順ではありません。

- [CLEANUP-20261109.md](CLEANUP-20261109.md)
- [REVIEW-20261109.md](REVIEW-20261109.md)
- [20261109-before-import-review-CURRENT-STATUS.md](history/20261109-before-import-review-CURRENT-STATUS.md)
- [20261109-CURRENT-STATUS.md](history/20261109-CURRENT-STATUS.md)
- [20261109-README.md](history/20261109-README.md)
- [20261109-SCHEDULE.md](history/20261109-SCHEDULE.md)
- [20261109-SHEET-INPUT.md](history/20261109-SHEET-INPUT.md)
- [20261110-before-guidance-audit-AGENTS.md](history/20261110-before-guidance-audit-AGENTS.md)
- [20261110-before-guidance-audit-AUTO-READ.md](history/20261110-before-guidance-audit-AUTO-READ.md)
- [20261110-before-guidance-audit-CURRENT-STATUS.md](history/20261110-before-guidance-audit-CURRENT-STATUS.md)
- [20261110-before-guidance-audit-PERFORMANCE.md](history/20261110-before-guidance-audit-PERFORMANCE.md)
- [20261110-before-guidance-audit-PWA.md](history/20261110-before-guidance-audit-PWA.md)
- [20261110-before-guidance-audit-README.md](history/20261110-before-guidance-audit-README.md)
- [20261110-before-guidance-audit-SHIFT-MAINTENANCE.md](history/20261110-before-guidance-audit-SHIFT-MAINTENANCE.md)
- [20261110-before-guidance-audit-STARTUP.md](history/20261110-before-guidance-audit-STARTUP.md)
- [AGENTS-20261103.md](history/AGENTS-20261103.md)
- [README-20261103.md](history/README-20261103.md)
