未公開候補: 署名済みinputMode=SHEETで管理者の予定編集/イベント編集/CSV/旧保存を隠す。本人の希望休/変更申請は残す。sheetRead.authorityはGASが計算した差分だけ、sheetImportへdigest2個と理由を送りplanを送らない。結果不明は同じinput/操作IDで再確認。空欄=削除はモード有効後だけ。未設定の現役挙動は変えない。

2026-11-09両PR #31から承認後公開済み: schedule-sheet.jsはV1互換/V2勤務・公開・非公開の3行。空欄は保持、【空にする】だけ削除。備考の変更前後をtextContentで表示、編集表の勤務テキストへ混入させない。初回管理者batchReadの任意inputSheetUrlは署名/月/DTO/Google URL形式検査後だけ表示。公開sourceへ実ファイルIDや備考を記録しない。

2026-11-09直接接続は承認後に公開/接続/12月空タブ作成・直接READ確認済み：sheetRead/sheetCreateは明示ボタンだけ。署名/snapshot/月/Google Sheets URLの固定形式を検査し、直接READでも既存の全件previewを共用。作成結果不明は同じID/月で再確認し、原簿保存へ変換しない。公開順はGAS→固定入力接続設定→画面。CSV互換と既存月の入力保持を維持。

2026-11-09 CSV追加は承認後に両PR #27から公開済み：schedule-sheet.jsは純粋なCSV/差分だけ。CSVの公開識別子/対象月/日付/社員コードを全件照合し、プレビュー/明示反映だけでは通信しない。既存batchPlanの期待版/固定ID/認可/全行読戻しを維持。ファイルと名簿はStorage/URL/ログへ残さず退場で消去。SHEET-INPUT.mdと両repo検査/固定source参照を同期。

<!-- current-doc-status:start -->
> 2026-11-05資料整理：機能仕様と保守資料。現在の公開・設定・未達状況は[最新状態](CURRENT-STATUS.md)を優先してください。本文の過去の日付・版・検査件数は当時の記録です。恒久的な安全方針は引き続き適用します。
<!-- current-doc-status:end -->

運営追加：platform-operations.html/company-operations.html/operations.jsは専用運営roleと台帳の独立API。勤怠のCurrentWorkplace scopeを付けない。表示名はTLH運営管理者/会社管理者/店舗サービス管理者。READだけを自動、PREVIEW/COMMIT/再送は明示。会社分離案/既存UI変更はこの公開候補へ含めない。OPERATIONS.mdと専用/連結検査を同期。

現在店舗の追加：current-workplace.jsの表示名/固定IDと10業務HTMLのdata-current-workplaceを同期。全業務formはTlhCurrentWorkplace.submit経由、nonce/操作ID/token/入力を変えない。URLの他店舗/重複scopeや退場後の送信を拒否。サーバーの固定境界は別に必須。表示を認可にしない。新API通信/Storage/タイマーなし、sandbox/見本は対象外。CURRENT-WORKPLACE.md参照。

# Workforceの恒常ルール

外部ホーム/PWAの未ログインはhome-line-loginを本人が押してliff.loginへ進む。SDK初期化成功・外部・未ログインのときだけ表示。自動redirect/独自認可URL/無限再試行は足さない。redirectUriはorigin+pathnameだけ、query/hash/tokenはコピーしない。pagehide後の押下を拒否。帰還後は同じstart/最新GAS認可。layout.testの未ログイン/復帰/SDK失敗/連打/離脱とPWA.mdを同期。

このWorkの対象は従業員情報・出退勤・シフト管理Web。POS/顧客向けサイトは別プロジェクト。ホームはSTARTUP.mdの本文→18外部script→既存起動の順序を維持。PWA準備はmanifest/静的アイコンだけで、Service Worker/個人情報の端末保存/オフライン打刻は追加していない。PWA.mdとtests/pwa-preparation・startup-loadingで範囲を検査する。

シフトタブはカレンダー/本人申請を直接表示。前半1〜15日・後半16日〜月末で締切/公開/版を独立管理します。ホームはLIFFを再初期化せず、既存auto-readのscheduleキーで読取だけを初回開始。受付状態はフォーム外へ説明し、確定後は変更案/本人同意/承認で編集できます。詳しくは[SCHEDULE.md](SCHEDULE.md)。

シフト表示の索引/JST表記はschedule-view.js、画面のカレンダー/申請はschedule.jsの別関数、共有出力はschedule-report.js。表示専用の共通計算にDOM/認可/通信を混ぜない。詳しくは[保守ガイド](SHIFT-MAINTENANCE.md)のコード整理節へ。

管理タブは「従業員の管理」「出退勤の管理」「シフトの管理」の切替式です。最初は出退勤を表示し、選択はページを開いている間だけ保持します。従業員登録/訂正/停止は従業員側、提出/打刻訂正と承認は出退勤側、予定作成/希望確認/公開はシフト管理側です。シフトタブは全員の確定閲覧と本人の希望/変更申請用です。労務設定の要対応事項は管理の一番下に置き、分類の切替で警告を解消した扱いにはしません。

切替担当はlayout.jsのcategories/groupsとindex.htmlのmanager-sectionsです。保存/認可/入力/再送情報を変更せず、対象のwrapperだけを表示します。選択ボタンは初期無効、既存の署名付き管理者確認後だけ有効。分類を追加するときは選択名・対象ID・aria-controls・配置テスト・説明を同期してください。登録の共通結果欄はstaff-status-hostで表示だけを切り替え、元のstatus/フォームのidは維持します。


シフトの保守・一般化説明はSHIFT-MAINTENANCE.md。管理者を氏名/社員番号で固定しない。起動時の入口表示と保存ごとの最新認可を区別し、一般従業員・失権・scope違い・退場後の拒否を検査する。公開repoへ実権限表のID/個人情報を記録しない。

確定シフトに最終更新日時（公開版のサーバー時刻/JST）を表示。印刷・PDF保存/CSVは全員向け確定DTOの許可列だけから別表を作る。下書き/本人メモ/申請理由は出力しない。LINE/メールへは保存ファイルを利用者が添付する。schedule-report.jsと両HTML/print CSS/テストを同期。読取中/拒否/離脱では出力を無効化・消去。未設定日と0時間、予定と打刻原簿を混同しない。詳しくはシフトの使い方を参照。


## シフト（2026-11-04）

シフト→schedule.htmlは本人の希望/変更申請/同意と全員の確定閲覧、管理→「シフトの管理」→admin-schedule.htmlは月締切/下書き/共有イベント/確定公開/判断。schedule.js/CSSはパレットを共有し、最新権限/締切/本人同意/版/公開完了はGASへ委ねる。publicNoteだけを確定後に全員へ共有。既存note/本人理由/用事詳細は非公開のまま。空のpublicNoteは正規JSONから省略し旧hashを維持する。月未設定の初回plan/eventはDRAFT月と一括保存し、締切/希望の存在を下書きの前提にしない。公開は従来どおり受付締切後。結果不明は同じ操作ID/入力だけで再確認し、保存を自動再送しない。SCHEDULE.mdが現行。旧ShiftPlanの日別比較や給与へ単一区間に潰して接続しない。

## 現行デザイン（2026-11-03）

所有者の指定パレット: 8E3F35/2F5452/7C908E/F3EFE7/252829/495C63。IBM Plex Sans JPを同一サイトfonts/配布、本文400・見出し/操作600、swap。Google Fonts/CDNへ実行時接続しない。app.cssの:rootと18節が現行。管理は番号/区切り線/短い説明/操作、その他はアカウント→招待→診断。長い補足はtool-helpのdetails、保存前の確認はcontrollerに残す。表示見本design/は操作無効・実データなし、scripts/build-workforce-design-preview.pyで再生成。見本のhidden解除を本番へコピーしない。DESIGN.md/fonts/README.mdとコメントを同期。

## 本人アカウント情報（2026-11-03）

所有者の指示でその他→account-info.htmlを追加。ログイン中本人だけの読取。確認ボタンのみPOST、対象IDを受け取らず公式LINEから決定。AccountInfoService/BridgeAccountInfoとのDTO/HMACを同期し、provider_subject・秘密・行全体を返さない。管理タブに本人機能を混ぜず、登録なし/停止/不整合を区別。ACCOUNT-INFO.mdが現行。

## 現行の作業基準（2026-11-03）

所有者は不在中も継続して、本人申請入口・氏名/社員番号付き承認待ち一覧・中抜けを指示。通常打刻は同日再出勤、日別V2は各勤務を表示、訂正V2は10区間/各休憩0または1組。一日置換で残す区間も全入力する。旧API/旧監査を維持し、未知V2 actionを旧ルートで保存しない。pending-approvals.jsは最新管理者だけの読取、カード選択は既存previewへ渡すだけ。

所有者が一般従業員による管理項目の連打を懸念し、起動時確認と操作不可を要求。管理タブと管理者用optionは初期disabled。admin-access.jsはLIFF準備後に既存D11署名付き読取を1回だけ送り、検証済みSTAFF_ADMIN_READYだけで有効化。失敗/未確認/退場は拒否、再送/周期送信なし。layoutがdisabledを変更できるのは管理ナビだけで、保存側の最新認可は維持する。起動時無通信という旧説明はこの明示要求で更新。

UI2の見本を所有者が確認し、実画面反映と公開を了承。画面は打刻/記録/シフト/管理/その他。layoutは5画面のwrapperだけを切替、app.cssをホーム/日別/訂正で共有。時計shell.jsは表示のみ。ホーム本日・日別カードは明示読取の既存署名/DTO検査後だけ表示し、対象変更/退場で消去。見本の架空値を稼働画面へ置かない。

LINEログインの最小タイムカードを優先。通常4打刻/日別一覧/SELF申請/DIRECT直接訂正/REVIEW承認は公開済み。架空社員で両訂正経路を実保存確認済み。
管理者本人の訂正も従業員側からSELF申請する。管理はadmin-day-change.html（DIRECT/REVIEWのみ）とadmin-timecard-records.html（adminのみ）。本人ページはSELF/selfのみで管理gate/一覧を起動しない。現行は10勤務区間と氏名付き一覧に対応。却下/取消/異常修復は未実装。詳細ROLE-PAGES.md。
打刻受付は最後の確認でOFF、復旧/一般登録もOFF。実社員の個人情報や過去時刻を推測して試験しない。
現在の画面入口と改造方法はREADME.md。以前の状況はhistory配下へ退避し、未公開/未接続を現在の指示と解釈しない。
通常の調査/整理/検査はまとめて進める。実データ/権限/受付/新しい公開は承認範囲を確認する。回答末尾は「次は○○です。」。

ここは現役LINE画面。ブランドサイト本体とは別のアプリです。
GitHub mainが唯一の正本。GASはprivate repoからActions/claspで配布するコピー。
GASへソース/一時関数を手入力しない。新しい外部サービスは追加しない。

READMEは初学者所有者の再構築・学習・引継ぎ資料。履歴と現行手順を分け、未検証を完成と書かない。
デザイン調整時はDESIGN.mdとapp.cssの番号付きコメントを同期する。設計思想/一般化/具体的なselector/共有先/削除影響/確認方法を残す。CSSは読める改行を保ち、整形だけの変更でも宣言値・順序・文字列を照合する。見本用selectorと現役の後方上書きを区別し、hidden/disabledをデザインで解除しない。
新規/改修する現役ソース冒頭に責務、呼出元/先、具体的な削除影響、一般概念、変更関数と連動ファイル、秘密の境界、検証の7項目を記す。
重要関数に目的/入力/結果/例外/理由/改造注意を残す。コメントは挙動と同期する。

削除前にscript読込/init/DOM/iframe/相手Bridgeの参照を検索。
daily-summary.jsのdurationは月次でも共有。GAS側の共有依存はprivate repoの構造ガイドを読む。
文言変更でaction/code/DOM id/HMACを変えない。契約変更はGAS/両repoテスト/説明を同期する。
token/招待秘密/氏名/指紋/集計をURL/console/localStorage/sessionStorageへ出さない。
同操作のretry draft/IDは固定、nonce/応答鍵は通信ごとに更新。連打/重複をUIとGAS両方で防ぐ。

実社員の開始は別確認。実受付閉鎖を維持。実データ/管理者role/停止済み試験行を無断変更しない。
D17は来歴検査後の正式投影へ接続済み。新環境の安全な初期管理者入口は未整備、手編集で迂回しない。
`node --test tests/*.mjs`→該当Actions→LINE読取を確認。模擬と実機を混同しない。
