# TLH Account・在庫の独立性能調査（2026-11-17）

## 測定した事実

**アカウント画面はログイン後に4本の読取POSTを同時に開始する。各要求は同じCoreのScriptLockを使う。** また、新しい共通所属読取には旧本人情報で導入済みの要求内読取共有が適用されておらず、所属Account数に比例したUsers表の再読取がある。これは通信・API呼出回数の調査結果であり、本番の秒数改善を確認した報告ではない。

### 調査基準と設計

調査開始時のGitHub mainを固定し、既存作業checkoutとは別のスナップショットで実行した。

| Repository | 基準commit |
|---|---|
| tlh-platform | `3bce1ac38e5f088f349f7bbc9ca0a0c58a20db1b` |
| tlh-inventory | `6e555a08f4b2b195847430b0b88086f4b8f6ce07` |
| tea-lab-hokkaido | `13dd60a5716b3de48d18286a5d171da45582227c` |

全体設計 `tlh-platform/docs/TLH_PLATFORM_ARCHITECTURE.md`、実装構成 `docs/ARCHITECTURE.md`、STATUS、API索引、共通所属の正本とサービス店舗ID契約v1を確認した。Account/Identity、共通所属、会社別雇用、サービス契約、業務grantを分離する。所属があるだけで在庫操作を許可しない。勤怠を登録入口にする依存や、タイトルから複数店舗管理権限を推測する実装は提案しない。

調査中、公開サイトmainは `f2cfc82f62fe920c294f3c439d6ce2ba4265a7d7` に進んだ。PR #112/#113の差分10ファイルを確認。明示再認証・picker復帰・招待コピー・READMEの公開状態説明が更新された。`viewer.load(); access?.load();` と内部の3読取は残るため、今回の4本という構造上の指摘は残る。新main全体の回帰試験は今回の対象外。backend/inventoryのmainは再確認時に基準と一致した。版情報は [sources.json](sources.json)。

### 1. アカウント初回表示：4要求とロック競合

実際の `account/account.js` と読取controller4個を同じ架空DOMで動かし、form.submitを記録した。LINE brokerと従業員招待controllerは代用品。実HTTP・実LINE・画面描画性能の測定ではない。

| 起動順 | action | phase | 起動元 |
|---|---|---|---|
| 1 | bridgeCommonAffiliationV1 | READ_SELF | account-info.load内のcommon.load |
| 2 | bridgeCompanyEmploymentV1 | READ_COMPANIES | account-info.load内のcompany.load |
| 3 | bridgeGetAccountInfo | — | account-info.load本体 |
| 4 | bridgeAccountAccessOverviewV1 | READ_SELF | account/account.jsのaccess.load |

4本は応答を待たずに同じJavaScript処理内で送信される。各controllerのpendingは自分の二重送信を防ぐだけで、他のcontrollerとは共有されない。本人情報の手動更新でも1〜3の**3本**を送る。detailsを閉じてもロードは止まらない。会社を選ぶまで会社別社員原簿は読まない。管理pickerも初期化だけで自動送信しないため、これらを初回要求に加算していない。

根拠：公開 `account/account.js`、`workforce/account-info.js`、`workforce/common-affiliation-info.js`、`workforce/company-employment-info.js`、`account/access-overview.js`。再現出力は [flow-results.json](flow-results.json)。

Coreでは `AccountInfoService.gs:getAccountInfoForVerifiedLine_` と `CommonAffiliationService.gs:affWithLock_` が共に `LockService.getScriptLock().tryLock(10000)` を使用する。後者を共通所属・会社一覧・権限概要が利用する。LINE検証はロック取得前。ロック取得後の3つの共通読取は、共通所属とOperationsの全履歴検証をそれぞれ実行する。既存打刻も同じCore ScriptLockの利用者であり、この競合はアカウント画面だけの待ち時間に閉じない。

**実測していない点：本番で実際に何秒待ったか、どの要求が先にロックを取ったか。** 全ての要求が同時にロック取得へ到達し各保持時間4秒なら、先行3要求の開始は0/4/8秒、4番目の最短取得は12秒になり、10秒上限に達する可能性がある。これはFIFO・同一保持時間を仮定した説明用モデルで、測定値やGASの順序保証ではない。各画面の30秒応答期限とは別の制限である。

既存 `WorkforceTiming.gs` の対象は `bridgeGetPunchReadiness`、`bridgeRecordPunch`、`bridgeReadHomeV1`。`Api.gs` は新しい所属/会社/picker/概要を計測wrapperより前に返す。今回の4要求を既存の打刻ログだけで診断できない。過去の `docs/PERFORMANCE-20261114.md` 等の秒数はWorkTime旧版の観測なので、今回のアカウント実測には流用しない。

### 2. Users再読取：架空Sheetsでの実コード測定

`AccountAccessOverview.gs:accountAccessOverview_` を既存のGAS試験harnessで実行した。比較対象は、**試験VM内だけで、読取専用要求のロック内を既存 `withSheetReadSnapshot_` で囲む実験**。GASソースは変更していない。Nは共通所属台帳内の異なるAccount数であり、閲覧者本人の所属店舗数ではない。

| N | 履歴revision数 | Users読取 現行→実験 | 全getValues等 現行→実験 | openById 現行→実験 |
|---:|---:|---:|---:|---:|
| 1 | 1 / 10 | 2 → 1 | 8 → 6 | 5 → 3 |
| 10 | 1 / 10 | 11 → 1 | 17 → 6 | 14 → 3 |
| 40 | 1 / 10 | 41 → 1 | 47 → 6 | 44 → 3 |

40人では全読取呼出47→6（約87%減）、Users41→1。これは代用品に対するAPIメソッド呼出の計数であり、GAS実ネットワーク通信や課金単位の計測ではない。実験側も要求ごとに最新表を読む。同じ架空fixtureと固定した応答日時で比較し、authorityRevisionを含む返却DTOの完全一致、読取中の表・設定変更ゼロ、次要求でgrant停止とAccount停止の反映を確認した。

根拠：`CommonAffiliationRepository.gs:affCatalogValidate_` が異なる各accountIdごとに `tlhAccountReadRepository_().findUser(...)`。要求内snapshotなしではUsers表をその都度読み直す。`affCurrentAccount_` のIdentity二重検索も同一要求内で共有できる。旧 `AccountInfoService.gs` にはsnapshotが既に適用済み。

全履歴の読取量も残る。40人・履歴1→10revisionで、現行のJSON換算読取量は73,759→145,004 UTF-8 bytes、実験側も13,974→85,219 bytes。これは架空getValues戻り値をJSON化して数えた量で、実通信の圧縮後バイト数ではない。共通所属は各revisionに状態全体を保存し、全行のhash/連鎖/形式を検証するため、表読取回数だけ一定でも履歴量に応じて重くなる。

ローカルの単発VM実行では、40人・1revisionで現行2.394ms／実験3.257ms、10revisionで4.131ms／4.896msだった。**高速化の秒数証拠にはならない。** メモリ内のAPIにはSheets往復待ちがなく、JIT・GC等の影響もある。一次結果と制約は [core-results.json](core-results.json)。

### 3. 在庫：店舗数に比例するCore往復を在庫ロック中に行う

既存employee-bridge fixtureと実生成GASを実行した。K店舗を架空catalogへ用意し、全てCOMMON bindingかつ利用可とした。`ACCOUNT {includeView:true,storeId:'demo-shop'}` を送信しUrlFetch呼出と在庫Lock保持を記録した。

| 対応するCOMMON店舗K | Core要求数 | 在庫Lock保持中のCore要求 | 在庫台帳read |
|---:|---:|---:|---:|
| 1 | 2 | 1 | 1 |
| 5 | 6 | 5 | 1 |
| 20 | 21 | 20 | 1 |

`inventoryEmployeeRun_` はwhoAmIを在庫Lock前に1回、その後 `inventoryOrganizationContext_` がcatalog内に存在するCOMMON bindingごとにcommonServiceAccessV1を直列送信する。**選択店舗を指定しても全店舗を走査する。** 各Core要求はCore側のLockも必要なので、Core混雑が在庫側の保持時間へ伝播する。CoreとInventoryのScriptLock自体は別物である。全設定店舗が存在しCOMMONである場合の式が1+Kであり、LEGACYやcatalogにないbindingは同じ回数にならない。

個人領域を選ぶ場合も `inventorySharedContext_` は組織contextの解決を先に試す。これはコード上の確認で、個人領域のK別通信数は別途未測定。

既にある削減を新規成果にしない：初回ACCOUNTにviewを同封する、保存応答に読戻し済みviewを同封する、同じACCOUNT内では選択店舗のgrantを再利用する実装は存在する。通常の選択店舗READ/COMMANDはwhoAmI＋共通権限確認で2回Coreへ照会する。業務権限は毎操作で確認し続ける。

## 改善候補

効果の根拠と安全性を合わせた着手順。全て未導入。段階ごとに本番Dotと版を合わせ、個別PRにする。

| 順 | 対象と具体策 | 期待する効果・受入れ条件 | 安全上の境界 |
|---:|---|---|---|
| 0 | Coreの新read入口へ匿名化したphase計測を追加 | line_verify、lock_wait、lock_held、account、ops_read、aff_read、replyを分離。画面はdispatch/応答受領/HMAC検証/描画を別計測。導入前後で要求数・p50/p95・BUSY率を比較 | 固定action/phase/経過msのみ。token・鍵・氏名・所属内容・台帳行をログに出さない。計測障害で業務を止めない |
| 1 | 共通所属・概要・会社一覧等の**読取専用入口**で、Lock取得後に要求内Sheet snapshotを利用 | 架空40人で47→6読取を確認。次要求の失効を維持したまま実Sheetsで保持時間を比較する | affWithLock_全体へ一律追加しない。このhelperはwriterも使う。writer・保存後照合・PREVIEW/COMMIT境界はuncachedを維持 |
| 2 | `/account/` の初期化と取得を分け、共通所属旧パネルと会社別雇用を開いた時だけ取得 | 初回4→2（本人情報＋概要）、さらに詳細を遅延すれば4→1が候補。後者は画面要件を決めてから。隠れたパネルの自動3通信を除く | WorkTimeで共有するaccount-infoの既定挙動を一括変更しない。明示optionか独立controllerを使い、保存結果不明や本人切替の状態を保持 |
| 3 | 在庫の本人向け店舗一覧・grantをCoreで一括検証する専用read契約 | K回の同じ共通正本読取/公式検証を1回に集約できる候補。whoAmI込みなら1+K→2を目標。K=1の削減はない | 自己Account・許可店舗・instance/local ID対応だけを返す。他人や任意の店舗ID全件を返さない。COMMON拒否をLEGACYへfallbackしない |
| 4 | `affRead_` 内のjournal構築でprefix全体のconcatを繰り返さない | 現状はR回のconcatで配列要素コピーがO(R²)。専用配列へのpushならO(R)。CPU効果は追加benchmarkで判定 | 全行hash/連鎖/重複検査・2,000履歴上限を維持。最後の1行だけを信用する最適化は不可。別名参照の影響を検査 |
| 5 | read通信の共通実行器と、機能別DTO/HMAC検証を分ける | nonce・pending・timeout・取消・計測の重複を減らし、要求数回帰を統合試験で検出 | 返信形式は契約ごとに違う。共通化のために署名項目やorigin検査を削らない。登録APIを署名付き業務APIと同一視しない |

read queueは補助候補。1タブ内の同時読取を抑えるが、4要求の総仕事量は減らさず、他タブ・他人・打刻の競合は解消しない。dispatch時に現行証明/nonce/期限を採番し、待機中の画面破棄を扱う必要がある。保存要求や結果不明COMMITを自動queue/retryしない。先に不要な読取をなくす方が効果が明確。

**在庫の外部通信をLock外へ動かす変更は独立した設計課題。** 単に前へ移すと、照会後の失効・台帳更新との競合条件を変える。保存直前の最新認可とrevision整合を満たす検証方式が必要であり、今回の安全な小変更候補には含めない。要求間の権限TTLキャッシュは採用しない。

### README・コメント・コード整理の具体的な補強箇所

| 場所 | 補強する内容 |
|---|---|
| 公開 `account/README.md` | 実ファイルを組み合わせた4要求の起動表、どのボタンが何件送るか、初回/手動/保存後の更新方針を追加。最新mainでは旧「未接続」説明や在庫主手順が別Dotにより修正済みなので、その修正を再提案しない |
| 公開 `workforce/account-info.js` のloadと `account/account.js` | loadは本人DTOだけでなく子パネル2個も取得することをコメントに明記。初期化/取得/破棄を分ける際、どちらの画面が子を所有するかを明示する |
| 公開 `tests/common-account.test.mjs` | 現在の「read once」はstubのload回数を数えており内部の3通信を検出しない。実controllerを合成し送信action集合/件数を数える試験を追加。今回のmeasure-flowsがその再現例 |
| Platform `docs/読取高速化と計測.md`、`API.md` | 旧snapshot適用済み一覧と新common read未適用一覧を区別。Lockの範囲、10秒取得期限と30秒画面期限、計測対象外routeを追記。本文へ再現コマンド・固定commit・戻し方を残す |
| Platform `CommonAffiliationRepository.gs` | findUserが全Users走査になること、履歴が状態全体のsnapshotで全行検証されること、N（Account数）とR（revision数）の増加影響を説明。高速化後も消してはいけない整合検査を明記 |
| Inventory `docs/design-and-speed.md`、`docs/performance.md`、`gas/employee-bridge.gs.txt` | LEGACY/COMMON別のACCOUNT/READ/COMMAND通信表、1+Kの条件、CoreとInventoryのLock境界を追加。「認証1回」を1 HTTPと誤読させない |
| Inventory generated GASと公開PWA | Runtime/Domainや配布済みPWAを直編集せず、元のbridge/src/webと生成scriptから再構築する手順を索引にまとめる。測定時の生成元/生成物一致も確認項目にする |

コードを整理するなら「transport／機能別契約／画面の組立／業務判断」の責務を分ける。一度に全bridgeを書き換えるより、read1系統ずつ既存拒否コード・署名・退場処理の回帰を固定して移す。既存のコメントは守るべきセキュリティ境界を相当説明しており、逐語コメントの大量追加より、呼出関係と計測方法の不足を埋める方が有効。

一般登録のCREATED/ALREADY_REGISTERED後は `viewer.load()` のみで、概要accessは更新されない。初回の未登録表示が概要に残る可能性があるため、全画面reloadではなく、登録・所属・grantごとに影響するread modelを一度だけ再取得する設計を決める。これはコード上の可能性で、今回の合成試験では登録成功後の概要表示まで再現していない。保存成功のUI表示と業務APIの最新認可は別責任。

## 変更したファイルとブランチ

Repository：`inhokkaido12345-lab/tea-lab-hokkaido`、branch：`audit/account-inventory-performance-20261117`。

追加はこの `qa/performance-audit-20261117/` 以下の6ファイルのみ：README.md、measure.mjs、measure-flows.mjs、core-results.json、flow-results.json、sources.json。

アプリ本体の変更なし。main、GAS、設定、実台帳への変更なし。merge・本番導入・実ユーザーを使った登録/権限変更もしていない。候補のsnapshotは試験VM内だけで有効化した。

## 実施したテスト

| 対象 | 内容 | 結果 |
|---|---|---|
| Platform | account-access-overview / common-management-picker / common-affiliation-api | 29件成功 |
| Public site（基準commit） | common-account / account-access-overview / management-picker | 22件成功 |
| Inventory | employee-bridge / employee-transport / catalog-sync | 43件成功 |
| measure.mjs | N=1/10/40 × revision=1/10、現行/要求内snapshot比較、DTO一致、読取無書込、次要求のgrant/Account停止反映 | 6組全成功 |
| measure-flows.mjs | 実read controller合成の初回4件・手動3件、実在庫bridgeのK=1/5/20とLock内Core要求数 | 全assert成功 |

既存試験合計94件。全て架空サービス/データによる検査で、本番運用の成功を証明しない。

再現するには、Node.js（今回v24.19.0）と3repoの読取checkoutを用意し、上記commitへ固定する。checkoutは同じ親ディレクトリ内の `tlh-platform`、`tlh-inventory`、`tea-lab-hokkaido` とする。公開repoは基準commitへ固定した上で、この調査ディレクトリだけを追加して使う。mainへmergeする必要はない。実設定や秘密ファイルは不要。

```sh
# tea-lab-hokkaido checkout内から。.. が3repoを置いた親ディレクトリ。
node qa/performance-audit-20261117/measure.mjs ..
node qa/performance-audit-20261117/measure-flows.mjs ..
node --test tests/common-account.test.mjs tests/account-access-overview.test.mjs tests/management-picker.test.mjs

# tlh-platform checkout内
node --test tests/account-access-overview.test.mjs tests/common-management-picker.test.mjs tests/common-affiliation-api.test.mjs

# tlh-inventory checkout内
node --test tests/employee-bridge.test.mjs tests/employee-transport.test.mjs tests/catalog-sync.test.mjs
```

measure.mjsは既存harnessをimportし、measure-flows.mjsは既存fixture定義部だけを読み出す。後者はtestファイル内の最初の `test(` より前を使うため、将来fixture構造を変更したらその抽出も更新する。模擬サービスを黙って実APIへfallbackさせない。JSON出力の日時由来hash・単発msは再実行で変わり得るが、固定データ規模の読取件数は一致するべきである。

## 未検証

- 実端末・実LINE・実GASの現在の処理秒数、cold/warm差、Sheets往復時間、正確なLock待機/保持、同時人数とp95、認証popup往復時間。実ネットワークや本番台帳に負荷をかける測定は行っていない。
- 実環境の会社別人数・COMMON店舗数・履歴長・原簿サイズ。K=20は架空条件で、現店舗数を示さない。
- snapshot候補をread全入口へ適用した全回帰、実GAS V8上の同等性、途中例外の後にsnapshotが確実に破棄されることの追加fault試験、並行writerとの実環境試験。
- 一括Core API、読取遅延、read queue、journal配列変更の実装・運用効果。変更後の全在庫・打刻回帰、本番導入は未実施。
- ブラウザーの視覚・DOM描画性能、全repo全テスト、調査中に進んだ公開サイトmain全体の再試験、配信資産とmainの一致。

次の検証単位は、匿名phase計測＋読取専用snapshotの1PR。その後で初回要求数を削減する別PRを作る。導入前後は同じデータ規模・同じ画面操作で比較し、要求数だけでなくLock保持時間、BUSY率、打刻の待ち時間が悪化していないことを判定する。
