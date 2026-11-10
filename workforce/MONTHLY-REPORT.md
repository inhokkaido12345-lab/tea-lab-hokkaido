# 本社提出用・月次勤務記録

## 操作と出力

管理→出退勤の管理→月次記録・提出用出力→社員/月を選択→「印刷・PDF保存」またはCSV保存。アプリから本社へ自動送信しません。古いPDF自体は更新されないため、画面を再読み込みして出力し直します。

氏名・社員番号・対象月・店舗・取得日時と、日別の全勤務区間を出します。出勤/退勤、全休憩の開始/終了、休憩時間、実働、状態を省略しません。同日再出勤は別行、複数休憩はセル内改行、夜勤は実際の日付を保持。実働/休憩合計と退勤済み/未退勤の区間数も残します。合計は退勤済み区間のみで、未退勤は未確定。記録なしを休日や0時間にしません。給与/法定時間外の確定計算ではありません。

## 責務・認可・データ保持

既存GASの署名V3→attendance-journal.jsの型/対象/署名検査→monthly-report.jsの表示モデル→monthly-report.cssによる専用の画面/印刷指定。氏名と番号も同じ署名付き取得から読みます。承認済み訂正反映後の提出値であり、変更前の原打刻一覧とは別です。原簿・訂正・権限・受付・CSVの保存仕様を印刷CSSで変更しません。

印刷はA4横、見出し再掲、行途中の改ページ防止。提出専用CSSを削除すると共通のカード表示用ルールで表が消え、合計だけのPDFへ戻ります。hiddenの出力許可は解除しないでください。

## 再構築・検査・魔改造

通常は `node --test tests/monthly-report.test.mjs`。実ブラウザ印刷は開発用Playwrightを用意し `node qa/verify-monthly-report-print.mjs`。既存モジュールを使う場合はTLH_PLAYWRIGHT_MODULE、ChromeはTLH_CHROME_EXECUTABLEで指定できます。アプリ本体にPlaywrightを読み込みません。

このQAは実HTML/CSS/controllerに架空社員を渡し、file以外の通信を遮断。旧不具合を再現し、390px/1280px/印刷で明細表示、hidden時は非表示を確認します。生成先は.sandbox-work/monthly-report-print/。pypdfのあるPythonで `python qa/check-monthly-report-pdf.py` を実行すると、生成PDFの1〜30日・複数勤務/休憩・夜勤の全時刻・既存合計と2ページを照合します。文字抽出だけでなくページ画像も確認してください。

列を変える場合はHTML見出し・monthly-report.jsの行/CSV列・専用CSSの列幅・PDF検査を同時に確認。新しいデータ項目が必要な時だけGASの署名契約/連結検査を拡張します。未確定の実働を0で埋めず、給与丸めを表示側へ足しません。

公開版・検査結果は[現在地](CURRENT-STATUS.md)、旧不具合と公開経緯は[整理前の記録](history/20261110-before-maintenance-MONTHLY-REPORT.md)。
