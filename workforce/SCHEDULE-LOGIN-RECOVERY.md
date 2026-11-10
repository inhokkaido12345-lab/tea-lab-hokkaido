# シフト読取の認証切れと再ログイン

## 確認した問題と今回の範囲

2026-11-10、公式LINEが認証を拒否しても、シフトBridgeが通常のSCHEDULE_UNAVAILABLEへ変換し、画面に再ログインボタンが出ないことを再現しました。新しいLINEログインでは管理月読取・入力シート読取の成功を確認しています。ただし、過去の取得失敗すべてが認証切れだったと断定するものではありません。

この修正候補は未公開です。先に配布したGAS v76の段階診断を維持し、未知の例外は取得エラーのまま安全なログで追跡します。実際のシフト保存・承認・打刻は調査のために実行しません。

## 変更する契約

- read/monthRead/batchRead/sheetReadで、**公式検証がLINE_ID_TOKEN_REJECTEDを返した時だけ**、空のdataとLINE_VERIFY_REJECTEDを従来どおり全体署名して返します。
- 画面は返信元・nonce・command・HMACを確認後に表示を消し、「LINEでログインし直す」を出します。偽の通知や別iframeでは出しません。
- ボタンを本人が押した時だけ既存LIFF SDKで再ログインします。外部ブラウザでは既存のSDKログイン状態を解除してから通常ログイン、LINE内では固定のMINI Appへ戻ります。query/hash/tokenは復帰URLへ複写しません。
- 通信障害・権限拒否を認証切れと決めつけません。自動ログアウト/自動遷移/自動再送はしません。
- **保存commandは従来のエラー・結果不明・固定ID再送を維持**します。未確認の保存がある間はログイン遷移を止め、入力や再送IDを端末に保存しません。

## 責務と魔改造MAP

| ファイル | 担当・削除時の影響 |
|---|---|
| backend BridgeSchedule.gs | 認証拒否のREADだけを分類。本人確認や認可をUIへ移さない |
| schedule.js createLoginRecovery | 単独/統合の明示ログイン、連打/離脱/保存結果不明のガード。削除すると復帰できない |
| schedule.js / schedule-bulk.js | 署名確認後の表示更新、認証待ち中の読取/保存停止 |
| schedule/admin-schedule/admin-schedule-bulk.html | 元のボタンと読込JS版。bootstrapとcontrollerで二重登録しない |
| scripts/sync-schedule-workspace.py | 元の単独HTMLから統合画面の本人/管理の別領域へ生成 |

別のログイン方法を追加する場合も、このボタンで独自の認可URLやパスワード保存を始めません。共通Accountと公式Verifierの設計変更として別途検証します。ボタンが見えることは権限付与ではなく、再ログイン後もGASが毎回認可します。

## 検査と限界

公式拒否・通信障害・保存commandを分離するbackend試験と、本人/管理/一括画面の署名・偽装・連打・離脱・復帰先・結果不明再送のUI試験を追加しています。ログインの自動実行や実データの変更を成功条件にしません。

```powershell
node --test tests/schedule-login-recovery.test.mjs
node --test tests/*.mjs
```

backendの固定UI参照と連結試験も同期します。新しいGAS/UI公開は承認後。公開前の試験成功を実機での修復完了と混同しません。
