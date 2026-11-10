# 独立PWAと納期の自動学習（現行仕様）

入口は https://tealabhokkaido.com/software/inventory/ 。WorkTimeは /workforce/ 、在庫は /software/inventory/ のid/start_url/scopeを持ち、範囲を入れ子にしません。旧 /workforce/inventory/ は新入口へ転送します。WorkTimeのインストール・manifest・業務処理は変更しません。

## LINE本人確認

2026-11-10修正：LINE遷移後にopenerが切れる端末を考慮し、同一originの要求固有BroadcastChannelも使用します。要求nonceを認証窓口と固定redirectUriへ引き継ぎ、元画面が要求した結果だけを受け取ります。URLにtokenや個人情報は載せません。token・channelはページ内だけで、退場時に破棄します。受領確認前に認証窓口だけを成功扱いにせず、戻れない場合はAUTH_RETURN_UNAVAILABLEを表示します。

この代替経路は同じブラウザー/保存領域内の画面間に限ります。別ブラウザーや別アプリの保存領域に切り替わる端末は実機確認が必要です。


既存LINEの登録Endpointは /workforce/ 配下です。在庫PWA本体をそこへ戻す代わりに、「LINEでログイン」の明示操作で /workforce/inventory/auth/ の専用認証窓口を開きます。そこだけが既存LIFF SDKを初期化します。

認証窓口は固定origin、opener、nonceを照合してから元の在庫ウィンドウへID tokenを返します。元画面もpopupのsource/origin/nonceを確認します。tokenはページ内メモリーだけで、URL・Storage・ログ・原簿へ保存しません。退場で破棄。APIは従来どおり毎操作Coreで本人・従業員を照合します。

初回はログインボタンを押してください。ポップアップを拒否された場合はこのサイトのポップアップを許可します。OAuth後にopenerが失われた端末では、元の在庫画面からやり直してください。実端末の認証復帰とインストール完了は模擬テストと区別します。

以前の入れ子版TLH Inventoryをインストールした端末では、新URLから追加してください。重複を整理する場合は在庫アプリだけが対象です。WorkTimeを削除する必要はありません。

## 納期は入力しない

発注を記録し、入荷時に対応する注文を受取完了にすると、その期間を自動集計します。分納は最終受取までを測ります。注文に紐づかない入荷を勝手に納期実績にせず、発注だけでも学習しません。

当日受取の登録は発注と受取登録の時刻差を使用します。後日登録は届いた日と発注日のJST暦日差にし、「日付単位の概算」と表示します。したがって、届いた時に登録するほど時刻精度が上がります。受取後に長く放置した登録は実輸送時間とはずれ得ます。

最大20件の平均と直近を表示し、その長い側を予測納期に自動採用します。安全余裕だけを調整できます。過去に手入力した納期は予測に使いませんが、原簿と保存済み操作の再確認は維持します。

実績なしを0日とはみなしません。在庫切れ予測は表示し、発注期限だけ未学習にします。納期実績が得られると、発注期限＝安全側在庫切れ予測−実績納期−安全余裕で自動更新します。

## 正本・生成・配布

web/employee-login.jsは元ウィンドウ、web/auth.jsは認証窓口、web/employee-transport.jsは署名付きAPI通信です。scripts/build-employee-pwa.mjsがdist/employee-pwaへ生成します。

- 通常7資産は公開repoのinventory/へ置きます。
- auth-index.htmlとauth.jsはworkforce/inventory/auth/index.html・auth.jsへ置きます。
- legacy-index.htmlは旧workforce/inventory/index.htmlへ置きます。旧入口からmanifestを参照しません。

発注/受取集計はconsumption-forecast.mjsの共通索引で行い、画面と保存時の期限判断を一致させます。納期のために品目ごと全履歴を再走査しません。

employee-login.testは偽source/origin/nonce・退場時の破棄、employee-transport.testは独立PWAからの通信、consumption-forecast.testは受取完了の自動学習と安全余裕だけの保存を検査します。公開検査は新入口の7資産、認証窓口2資産、旧入口転送の一致を確認します。
