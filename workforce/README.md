# TLH 勤怠管理フロントエンド — 初心者向けファイル説明

## D16：今月開始分の完了勤務（公開済み、LINE実機未確認）

本登録保留・実打刻受付閉鎖を維持。「自分の今月分を確認する」は全Sheet/Properties無書込の明示照会。
初回は「有効な従業員登録がありません。」が期待結果。招待受取り/受付開放/実打刻は試さない。
GASの日本時間の本日から暦月を決め、正常な完了勤務だけ計算。同日に2回なら勤務日数1日/回数2回。
月跨ぎは全て出勤月へ帰属。整数ミリ秒を保持、未終了は除外して注意表示。給与締め/給与額/MonthlySummary保存/確定は別の未実装機能。
関連修正/不正原簿を無視して正常集計にしない。過去月・任意月・他人指定を受け付けない。

monthly-work-summary.jsは独立controller。専用action=bridgeGetMonthlyWorkSummary、iframe=tlhMonthlyWorkFrame。
Api→BridgeMonthlyWorkSummary→MonthlyWorkSummaryService→共通認可/原簿/完了勤務fold。
時間表記だけ先に読み込むTlhDailySummary.durationを共有。daily-summary.js削除はD16にも影響する。
返信summaryは月/日数/回数/合計/現在状態だけ。人物ID/氏名/個別時刻/原簿/給与を返信しない。
summary全文をHMAC、型/暦月の日数/日数≤回数/合計整合性も検査。textContentで表示する。
旧集計は照会開始で消す。二重タップ/期限切れ応答/埋込を拒否。自動登録/打刻/再送やブラウザ保存はない。
削除時はHTMLのscript/init/section/iframeと共有duration/foldの呼出しを確認する。原簿は消さない。
backend183/frontend54（計237）テスト成功。模擬画面320/390/1280pxで日数/回数/端数/未終了注意/停止拒否/無書込を確認。
GAS公開版30の30ファイルが正本一致。画面正本59ca57f46e63e52edb4b9b5a9388a56aeab9932f。
[画面テストrun 38257600928](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38257600928)/[Pages公開run 38257600692](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38257600692)成功。
公開HTML/monthly-work-summary.js/共有daily-summary.jsはHTTP 200・正本全文一致。ソース手編集/再認可/受付開放/実登録なし。
LINE実機結果・現物Sheet全項目の直接照合は未確認。非公開repo docs/D16-今月開始分の完了勤務集計.mdが再構築/列/計算/制約の説明。

## D15：本日開始分の完了勤務（有効社員なし拒否はLINE実機確認済み）

本登録保留・実受付閉鎖を維持。「自分の本日分を確認する」は全Sheet/Propertiesへ無書込の明示照会。
初回の利用者は有効社員なしのため「有効な従業員登録がありません。」が期待結果。招待/打刻を試さない。
有効社員の正常生原簿ならGAS本日の出勤日で完了勤務を集計。全休憩を引き、整数ミリ秒の端数を保つ。
日跨ぎ分は出勤日へ帰属。未終了は合計へ足さず別表示。修正合成/過去日/月次/給与は未実装。
関連Correctionsがあれば拒否し、修正未反映の集計を正常表示しない。

daily-summary.jsは独立controller、iframeはtlhDailySummaryFrame、actionはbridgeGetDailySummary。
Api→BridgeDailySummary→DailySummaryService→D13/D14共通の認可/原簿/Script Lockを使う。
成功返信のsummaryは日付/回数/3時間合計/現在状態のみ。人物ID/氏名/個別時刻/原簿/給与は返信しない。
JSON文字列全体を一回用鍵でHMAC検証。型/範囲/暦日/合計整合性も検査し、textContentで表示する。
読取開始で旧集計を隠し、timeout/拒否/遅延返信で昔の個人集計を残さない。二重タップ/自動照会/自動再送なし。
URL/console/localStorage/sessionStorageへ集計/token/鍵を出さず、埋込ページからの照会を拒否する。
durationはD16でも使う。削除時はD16とHTMLのscript/init/section/iframeを確認する。原簿は残す。
backend171/frontend46（計217）テスト成功。模擬ブラウザ320/390/1280pxで集計/未終了注意/停止後拒否/無書込が成功。
GAS公開版29の28ファイル正本一致。画面正本0931b14705cfa66f8171ae5416f25206430939cf。
[画面テストrun 38254376754](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38254376754)/[Pages公開run 38254376447](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38254376447)成功。
公開HTML/daily-summary.jsがHTTP 200・正本と全文一致。GASソース手編集/再認可/受付開放/実社員登録は行っていない。
2026-10-12、利用者が「自分の本日分を確認する」で「有効な従業員登録がありません。」を確認した。
原簿/修正の読取前に終了する拒否経路のみの確認。正常集計・未終了の実機表示・現物Sheet全項目の直接照合は未確認。
本登録保留・実受付開放なしを継続。非公開repo docs/D15-本日開始分の完了勤務集計.mdが再構築/列/計算/制約の説明。

## D14：本人打刻の追記（受付停止表示はLINE実機確認済み）

本登録保留を維持。TLH_PUNCH_ENABLEDが未設定/falseなら閉鎖で、今回実環境の受付を開けていない。
「打刻前の状態を確認する」は読取だけ。閉鎖なら出勤等の保存ボタンを出さない。
開放後も毎回公式LINE/本人Account/社員/従業員roleを検査。adminだけ・DEMO・停止済みは打刻不可。
正常状態でOFFは出勤、WORKINGは休憩開始/退勤、BREAKは休憩終了だけ表示。保存には明示確認が必要。
保存はGAS時刻・元出勤のJST勤務日で原簿1行を追記。他表/給与は変更しない。
結果不明時は同じevent ID/種別/revisionの再送だけ許す。他操作はロックし、古い応答を採用しない。
IDはページメモリだけ。再読込後は状態を確認し直す。受付開放・実保存の確認はまだ行わない。

punch.jsは独立controller。D13の読取とは別。削除時はHTMLの読込/initも確認する。原簿は残る。
HMACはrevision/固定codeも含めて検証。氏名/人物ID/時刻/原簿/tokenを返信しない。
URL/console/localStorage/sessionStorageにID/token/鍵/指紋を保存しない。自動打刻/自動再送なし。
GASは原簿を削除補償せず、flush/読戻しで確認。不明な結果は共通印で止め、印だけ消す復旧は禁止。
backend156/frontend38（合計194）テストと模擬ブラウザ320/390/1280pxで4打刻・閉鎖読取・既存機能が成功。
GAS版28の26ファイル正本一致。[画面テスト](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38251003733)/[Pages公開](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38251003378)成功、公開HTML/punch.jsがHTTP 200を確認。
2026-10-12、利用者が「打刻前の状態を確認する」を押し、「打刻受付は停止中です。」の表示を確認した。
閉鎖の読取経路のみの確認。社員/role/原簿の実機照合と実保存は未確認。Propertyの具体値は直接確認していない。
本登録保留・実受付開放なしを継続。非公開repo docs/D14-本人打刻の追記と受付閉鎖.mdが設定/保存/復旧の説明。

## D13：本人の勤務状態読取（有効社員なし拒否はLINE実機成功）

2026-10-12。D12試験後の「次へ」で設計決定稿の状態取得/表示を追加。本登録保留は継続する。
主画面の「自分の勤務状態を確認する」だけで読取要求。ページを開いただけでは通信しない。
最新公式LINE→ACTIVE Account/社員→日付内EMPLOYEE/WORKFORCEをGASが確認する。
正常な原簿なら勤務外/勤務中/休憩中。adminだけ・DEMO・停止済みは有効社員なし等の拒否表示。
日跨ぎ未終了を勝手にOFFにしない。不正原簿・重複・未対応の修正は確認必要とする。
打刻の追記/出退勤ボタン、勤務時間/給与計算、修正合成はまだ実装しない。

work-state.jsは独立controller。削除するとD13だけ止まる。既存D9〜D12は保持。
氏名/ID/日時/原簿を返信せず、固定結果のHMAC/nonce/actionを検証。token/鍵をURL/ログ/保存領域へ出さない。
読取結果はクリック時点の状態。再確認中/失敗時には前の正常状態を残さず、古い応答で完了させない。
既存の本人・管理者・試験用データは変更しない。現在の利用者には「有効な従業員登録がありません。」が期待結果。
backend134/frontend30（合計164）テスト成功。模擬ブラウザ320/390/1280pxで3状態と停止後拒否、全照会の保存内容不変を確認。
GAS版27の24ファイル正本一致。[画面テスト](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38240111756)と[Pages公開](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38240111102)も成功。
公開HTML/work-state.jsのHTTP 200、D13表記と固定状態/HMAC検証を確認。
2026-10-12、利用者がLINEで読取ボタンを押し、「有効な従業員登録がありません。」が出たことを報告した。
これは有効社員なしの拒否表示の確認。正常3状態や原簿/修正の内容は実機未確認で、本登録保留を継続する。
全Sheet/Propertiesの前後内容を担当者が直接監査したわけではない。読取不変性はソース/模擬検査で確認。
詳細は非公開repoのdocs/D13-本人勤務状態の読取.md。実機の正常勤務状態を試すための無断本登録は禁止。

## D12：従業員の利用停止・属性訂正（事前登録の氏名訂正・停止はLINE実機成功）

2026-10-12、利用者はまだ本登録せず、解除・訂正機能を先に整えることを選択。
「従業員の利用停止・訂正」で社員番号・現在氏名・現在入社日を入力し、「対象を確認する」。読取専用。
最新LINE/管理者権限とD11来歴が一致した時だけ、氏名/入社日訂正と利用停止を選べる。
確認ダイアログで確定後に保存。未使用招待を取消し、停止は対象profileと対応D11従業員roleをINACTIVEへ。
アカウント・管理者権限・ID・CLAIMED招待・過去履歴は残す。退職日は変更しない。
社員番号変更、LINE再紐付け、再入社、給与/打刻訂正は未実装。停止済みを自動復活させない。
訂正後は新しい氏名/入社日で確認し直す。古い招待は使わずD11から再発行する。
初回は既存TEST-D11を読取照合し、架空氏名の訂正→再照会→事前登録停止→再照会を利用者が実施した。
現在は停止済みの履歴。再利用/手削除で復活させない。本登録やclaimは行っていない。

staff-maintenance.jsは独立controller。削除するとD12が止まり、D11や保存履歴は残る。
HMACでrevisionも検証し、保存直前の競合を拒否。結果不明時は固定operationIdの同じ操作だけを再送する。
画面初期化時の自動通信/書込なし。URL/ログ/ブラウザ保存に氏名/token/指紋を入れない。
監査には操作者/対象/変更列/操作指紋を残すが、旧氏名/入社日の復元履歴は保持しない。
模擬ブラウザ320/390/1280pxでINVITED/ACTIVEの訂正・停止と管理者維持を確認。
2026-10-12、LINE実機でINVITEDの氏名訂正・訂正後属性の照合・停止済み照合が成功（利用者報告）。
利用者はAdminAuditLogのEMPLOYEE_DETAILS_CORRECTED/EMPLOYEE_ACCESS_STOPPEDの両action行を尋ねられ「ある」と報告。
入社日の値変更・ACTIVE従業員role停止・PENDING同時取消し・不明結果の再送は模擬検査のみ。実Sheet/監査全項目の直接照合は未実施。
backend113/frontend23テストがローカル/CIで成功。GAS版26の22ファイルが正本一致。
[画面検査](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38235278537)と[Pages公開](https://github.com/inhokkaido12345-lab/tea-lab-hokkaido/actions/runs/38235278427)成功、公開HTML/JSもHTTP 200を確認。
非公開repoのdocs/D12-従業員利用停止と属性訂正.mdが操作・保存・復旧・検証の正本説明。

## D11：従業員の個別招待（発行・取消しはLINE実機成功）

2026-10-12。利用者は、本人へ個別に渡した招待コードで登録完了とする既存設計を選択。追加承認は入れない。
LINE画面はD11。「管理者用登録画面を開く」は権限・保存先の確認だけで行を作らない。
管理者が社員番号（大文字英数字等3〜32文字）・氏名・任意入社日を入力し、事前登録/発行の確認に同意すると保存する。
成功後の64文字コードを本人へ個別に渡す。期限24時間、一度限り。コピーは明示操作のみ。
秘密はページのメモリ/表示欄だけに置き、URL/ログ/localStorage/sessionStorageには出さない。
再読込すると失うので、同じ社員情報で再発行する。旧PENDINGは失効し、渡し間違えた未使用招待も取消せる。
「登録入力をやり直す」は画面をリセットするだけで、発行済み招待の取消しではない。

本人は同じMINI Appの招待コード欄へ入力し、受取り確認に同意する。
GASがLINE公式で本人確認し、招待・期限・使用状態・発行者の現在の権限を検査する。
未登録LINEは招待限定でTLH Accountを作り、既存Accountは再利用。一般登録スイッチはfalseのまま。
付与するのはEMPLOYEE/WORKFORCEだけ。管理者権限は自動付与しない。
停止済みD9履歴を残したまま新しい有効な登録と共存できる。有効社員の2件目は拒否する。
コード所持者が登録できる仕様なので、本人以外へ転送/共有しない。現実の本人への配布は管理者の責任。
使用済みの誤登録をSheet手編集で戻さない。属性訂正/利用停止はD12、本物の退職・再紐付け・従業員一覧は別設計が必要。

`staff-enrollment.js`がD11専用controller。削除するとD11だけが停止し、D9/D10や履歴は残る。
一回用鍵のHMACで固定codeのみ検証し、氏名/人物ID/招待秘密をGASの応答から受け取らない。
画面初期化だけでは通信/登録を実行しない。連打/再試行は同じ入力と秘密を保持する。
既存診断とダミー試験は「接続診断と試験用ダミー」に折りたたんで残した。
初期化中は主画面にLINE確認中を表示。初期化失敗時は主画面へ固定エラーを出し、接続診断も自動で開く。
backend全92件/frontend全15件と、模擬データの実ブラウザ320/390/1280pxで発行/受取り/取消し・既存診断が成功。
2026-10-12、利用者がLINE実機で管理者入力欄の表示、試験用社員の招待コード発行、未使用取消しの成功表示を確認した。
招待を受け取らない発行・取消し試験なので、従業員権限は付与していない。コードをチャットへ送らせていない。
取消し後も事前登録行はINVITEDの履歴として残す。利用者はAdminAuditLogのaction列にEMPLOYEE_INVITATION_REVOKEDの行があることも確認した。
これは利用者報告であり、担当者による実Sheet/監査全項目の直接照合と取消し後の再照会は未実施。
TEST-D11は後続D12の実機試験で氏名訂正後に停止済み照合まで成功。上記INVITEDはD11取消し時点の履歴。
**D11のLINE実機での本人受取りは未確認**。実社員を担当者が勝手に登録しない。
非公開repoのdocs/D11-従業員登録と個別招待.mdが入力・保存・失敗時復旧の詳細。

## D10：試験用ダミーの解除（LINE実機成功）

2026-10-12追加。LINE画面の版番号はD10。「試験用ダミーを解除する」を押して確認に同意すると実行する。
**配布や画面を開くだけではデータを変更しない**。元招待tokenも不要。
GASが毎回LINE本人確認と最新管理者権限を調べ、D9のclaim/role/監査が一致する本人のダミーだけ停止する。
EmployeeProfilesとEMPLOYEE/WORKFORCEをINACTIVEにし、roleの終了JST日と解除UTC日時を記録する。
TLH_ADMIN・Users・Identities・CLAIMED招待・過去の対応IDは残す。削除ではなく現在の利用を止める。
解除後は「登録状態を確認する」が「有効な従業員情報はありません」に変わり、管理者診断は有効のまま。2026-10-12、利用者がLINE実機で両方を確認した。
AdminAuditLogにはD10_DEMO_RELEASEDを追加。成功後の再試行は解除済み応答のみで履歴を増やさない。
本物の従業員・他人・曖昧な来歴は停止しない。不整合表示が出たら手で行や設定印を消さない。
解除済みダミーの再登録/再有効化は未対応。実際の退職管理とは別の機能。

既存controllerにボタン/確認/リトライを追加し、D9と同じHTTPS POST＋一回用鍵のHMACで固定codeを受け取る。
古いスクリプトとの混在を避けるためindex.htmlの読み込みURLにD10版番号を付けた。
サーバーの来歴照合・停止・補償は非公開repoのDemoEmployeeReleaseService.gs。
画面側全8テストとbackend全73テストがローカル成功。模擬通信の実ブラウザ320/390/1280pxも成功。
**LINEで実際に解除した結果は利用者確認済み**。「D10_DEMO_RELEASED」「停止しました」と報告があり、登録状態と管理者診断の再照会も成功。
担当側が最新Sheet全セルや解除監査の全列を直接監査したわけではない。異常系は自動テストで検証し、実機で全て試したという意味ではない。
手順詳細は非公開repoのdocs/D10-ダミー従業員解除.md。

## D9：ダミー従業員の招待試験

2026-10-12、LINE実機で招待発行・本人紐付け・登録状態の再照会が成功（利用者報告）。実社員用の登録機能ではない。
[LINE MINI App](https://miniapp.line.me/2011940133-JXUDzLnG)で版番号D9を確認し、
「ダミーを事前登録して招待を発行」→「自分のLINEで招待を受け取る」を順に押す。
対象は架空の`D9 ダミー従業員 / DEMO-D9`1人、受取りは発行管理者本人のみ。
受取り操作は既存TLHアカウントへ試験用の従業員属性とEMPLOYEE/WORKFORCE権限を追加する。
給与・銀行・打刻・初期管理者権限は変更しない。一般登録スイッチは開けない。

`demo-invitation.js`はD9専用の通信controller。消すとD9が使えないが既存データは残る。
招待秘密は暗号学的乱数32バイトで生成しメモリだけに保持。URL/ログ/保存領域へ出さない。
GASはハッシュ・30分期限・一回限り使用を検査し、POSTのLINE tokenとroleを毎回再確認する。
応答は固定codeのみ。Googleの入れ子iframeのnull originに対して一回用鍵のHMACも検査する。
HMACは応答偽装対策であり、暗号化や勤務許可ではない。給与/実社員情報の返却へ流用しない。
他サイトのiframe内ではD9送信を拒否する。同一originのXSS/SDK侵害まで防げるとは保証しない。

応答が来なければ同じボタンで再試行。tokenは同じなので二重登録しない。
再読込後の発行は前のPENDINGを失効させる。受取り済み招待は二度書き込まない。
「整合性確認が必要」と出たら操作を止めて知らせる。Sheet行の手削除/設定印の解除だけで復旧しない。
ダミーの解除はD10でLINE実機成功（利用者報告）。実際の勤怠/給与にダミーを含めない。

公開repoの`tests/workforce-invitation.test.mjs`は偽装・連打・応答喪失を実データなしに4件検査する。
既存デザイン・D4〜D8の診断を維持した。GAS側の記録仕様と補償は非公開repoの`docs/D9-ダミー従業員招待.md`を参照。

### 実機確認とSheetの変化

利用者が「招待は30分有効」「紐づけが完了」「紐づいています」を順に確認。
権限表の行が増えたとの報告も受け取った。担当側によるSheet全項目の直接監査は未実施。
さらに利用者がAdminAuditLogのaction列にD9_INVITATION_CLAIMEDの行があることを確認した。
この確認は受取り履歴の存在を示し、監査の全列・全レコードを直接照合したという意味ではない。
受取り時、EmployeeProfiles/Invitationsは発行時の既存行を更新するので行数は増えない。
RoleAssignmentsにはEMPLOYEE/WORKFORCE/ACTIVEを1行、AdminAuditLogにはD9_INVITATION_CLAIMEDを1行追加する設計。
監査が見つからない場合はタブ/フィルタ表示を確認し、手で行を追加・削除しない。

> このフォルダは、従業員がLINEから開く**画面**の正本です。
> こちらのGitHub PagesがHTMLを表示し、仕事の処理は別リポジトリのGoogle Apps Script（GAS）へ依頼します。
> 本文は診断版D8までの実装を説明しています。2026-10-12、GAS配布が復旧し、LINEで管理者権限が有効と判定されることを実機確認済みです。

## どのファイルが何を司るか

| ファイル | 責務 | 消すとどうなるか | 魔改造 |
|---|---|---|---|
| [index.html](index.html) | **現役**LINE MINI Appの画面・LIFF初期化・GAS通信 | LINEで画面が開かなくなり、D4〜D8すべてのボタンを失う。既存のGoogle Sheetsデータは消えない | HTMLは表示、CSSは見た目、JavaScriptは動作 |
| [bridge-test.html](bridge-test.html) | 非機密PING/PONGの独立試験 | 本体は壊れないが、通信だけを切り分ける診断が難しくなる | form POST / iframe / postMessageの教材 |

全体のデータ構造、GAS各ファイルの依存と削除時の影響は
[TLHコード構造と魔改造ガイド](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/コード構造と魔改造ガイド.md)
を参照してください。

## index.htmlの構造（上から読む順序）

### 1. `<head>`

- `meta viewport`：スマホ画面に合わせる指定
- LIFF SDKの`<script src="https://static.line-scdn.net/liff/edge/2/sdk.js">`：LINE SDK本体
- `<style>`：文字・余白・カード・ボタンなどのCSS

**変えるなら**：色や余白はCSSを修正。LINE SDKを削除すると`liff.init()`が使えなくなる。

### 2. `<body>`のカード

| HTMLのid | 担当 |
|---|---|
| `status-title`, `status-detail` | LIFF初期化・ログイン・ID tokenの存在を表示 |
| `bridge-section`, `bridge-button` | D4公開PING/PONG |
| `auth-section`, `auth-button` | D5 LINE公式による本人確認 |
| `account-section`, `account-button` | D6 TLH Accountと従業員登録の照会 |
| `signup-section`, `signup-button` | D7 一般TLH Accountを本人が作る |
| `admin-section`, `admin-button` | D8 TLH管理者権限の読み取り診断 |

ID（識別名）はJavaScriptの`getElementById`で参照しているため、
**HTML側だけで名前を変更するとボタンが機能しなくなる**ことがあります。

### 3. 通信用の5つの隠しiframe

`tlhBridgeFrame`、`tlhAuthFrame`、`tlhAccountFrame`、`tlhSignupFrame`、`tlhAdminFrame`。

別のWebサイトで動くGASにHTMLフォームでPOSTするとき、
現在の画面を遷移させず、結果のHTMLを受け取る専用の枠です。
GASはHTML内部から`postMessage`でLINE画面へ結果を通知します。

**削除すると**：対応する送信先がなくなり、正常なGASの応答を受け取れない。
**重要**：この方式の現行セキュリティ評価は固定コードの診断（D8を含む）とD7一般登録までに限定される。
従業員の氏名・給与・銀行情報をそのまま返すことは不可。

### 4. JavaScriptの設定と共通処理

- `LIFF_ID`：LINE MINI Appと画面を関連付ける公開識別子（秘密鍵ではない）
- `GAS_URL`：GAS Webアプリの公開URL
- `setStatus()`：診断画面を更新
- `initializeLiffWithTimeout()`：起動失敗時に待ち続けないための処理
- `createBridgeNonce()`：通信ごとのランダムな照合番号
- `start()`：画面を開いたらLIFFを初期化

**削除すると**：`setStatus()`の削除ではエラー表示すらできなくなった実際の事例がある。
一度の大きな文字列置換で「不要な関数」と一緒に共通関数まで消さない。

### 5. 5つのボタンの処理

`bridgeButton.addEventListener('click')`などで検索すると、押したときの処理へ移動できる。

```text
ボタンを押す
 ↓
LINEから必要なID tokenを取得（PINGでは不要）
 ↓
nonceを生成し、HTTP formのPOST bodyでGASへ送る
 ↓
GASでLINE本人確認・照会・登録など
 ↓
隠しiframeのHTMLからpostMessageで結果を受信
 ↓
対応する画面上のテキストだけを更新
```

POSTの`action`名を変えると、GAS側の`Api.gs`のルーティングも揃える必要がある。
`idToken`をURL/ログ/localStorageへ置かない。
画面の結果コードをサーバーの権限判定の代わりにしてはいけない。

## 現時点での機能状態

- D3：LINEログインとID token取得 — **LINE実機で成功**
- D4：LINE内PING/PONG — **実機成功**
- D5：GAS側LINE本人確認 — **実機成功**
- D6：TLH Account登録状態確認 — **実機成功（未登録と正しく判定）**
- D7：本人によるTLH一般アカウント作成 — **登録・再照会が実機成功、登録受付はfalseへ戻したと利用者確認済み**
- 初期管理者権限付与 — **2026-10-11に利用者がRoleAssignmentsへの追加と一時関数の削除を確認済み**
- D8：LINE本人確認後の管理者権限診断 — **2026-10-12に「管理者権限：有効です」を実機確認済み**

登録の初期状態は無効。GAS側Script Property `TLH_ACCOUNT_SIGNUP_ENABLED=true`に
一時的に設定した間だけ一般アカウントを作成できる。登録後は`false`へ戻す。

## 改造の前に

1. GitHubの`main`で現役ファイルかを確認する。
2. HTML ID・関数名・GAS側action名の使用箇所を検索する。
3. GitHub Pagesのデプロイ`success`を確認する。
4. LINE MINI Appの実機で動作を確かめる。
5. 今回学んだこと・エラー・設定を両READMEへ記録する。

このフォルダにソースがあるのは**画面**だけです。
従業員情報、アカウント情報、給与の処理は
`inhokkaido12345-lab/tlh-platform/gas/workforce/`へ置きます。


### 2026-10-11: D8 — LINE実機の初期管理者権限の読み取り診断

`workforce/index.html`をD8へ更新し、`自分の管理者権限を確認する`ボタンを追加。

処理はLINE ID tokenをHTTPS form POST bodyへ送信し、GASがLINE公式による本人確認と`RoleAssignments`内の`TLH_ADMIN/GLOBAL/ACTIVE`・有効期間を再検査する。返すのは`ACTIVE_TLH_ADMIN`など固定コードのみで、個人ID・給与情報・Sheetのレコード内容は返信しない。

D8は**診断用**であり、管理者表示を今後の書込APIの認可代わりに使ってはならない。

**当時の公開上の注意：** 2026-10-11はGAS配布が`invalid_rapt`で停止し、D8の実機成功は未確認だった。2026-10-12に限定権限のOAuthへ移行し、GitHub ActionsからGASへの配布・公開更新が成功。LINE実機でも管理者権限が有効と表示された。GAS編集画面での手動ソース編集は行っていない。

GitHubで画面を管理し、GASの正本は`tlh-platform`のmainに置く。[配布復旧の記録](https://github.com/inhokkaido12345-lab/tlh-platform/blob/main/docs/GAS-配布認証修復.md)には、認証更新を必須にした自動配布成功と、公開版14ファイルが正本と一致したことを記載した。既存Web AppのURLは維持。翌日以降の再配布は未検証。

削除すると：`workforce/index.html`内のD8カード・専用iframe・対応イベント処理を消すと管理者権限の診断のみ使えなくなる。既存の`RoleAssignments`は削除されない。
