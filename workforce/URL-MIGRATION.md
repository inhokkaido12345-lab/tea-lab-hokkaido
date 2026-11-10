## 公開確認（2026-11-10）

画面PR #64をmainへ反映し、Pagesの配信成功と変更49ファイルの一致を確認しました。LINE Developersの本番用Endpointは新URLへ保存済みです。開発用/審査用・scope・既存LINE IDは変更していません。

画面314件・backendとの連結66件の検査とGitHub検査に成功。実ブラウザでは新ホームの既存LINEセッション初期化、管理者確認、勤務外/本日未打刻の読取、旧ホーム/旧管理URLからの新URLへの移動と管理シフト読取を確認しました。在庫の既存共通ログインも新窓口を経て「最新の記録を読みました」へ復帰しました。シフト入力ファイルの使い方B19も新しい管理URLへ更新済みです。

実打刻・登録・承認・シフト公開・権限・受付・GASソースは変更していません。Androidホーム画面アイコンからの起動、iPhone、期限切れ後の新規OAuth往復は今回のブラウザ読取成功とは別の実機確認です。

# Work Timeの公開URL

配布URLは **https://tealabhokkaido.com/software/worktime/**（小文字）です。在庫は別サービスの`/software/inventory/`です。URLで会社・店舗・権限・データを分離したと解釈せず、従来の最新GAS認可と固定店舗照合を維持します。

## 編集する場所と公開する場所

`workforce/`が既存の編集元です。`software/worktime/`のHTMLは生成物なので手編集しません。業務JS/CSS・フォント・アイコンは`/workforce/`の同じ資産を読み込み、別コピーの業務ロジックを作りません。生成HTMLの`base`は資産用で、画面内の移動リンクは新URLへ変換します。backendのAPI名・ID・保存先は変更しません。

```powershell
python scripts/sync-schedule-workspace.py
python scripts/sync-worktime-url.py
python scripts/sync-worktime-url.py --check
node --test tests/*.mjs
```

初めてのPCはPython 3とNode.js 22を入れ、Gitで取得したリポジトリのルートから実行します。Pythonの追加パッケージやnpm installは不要です。通常の画面変更でも公開HTMLを再生成し、生成物を含めてGitHubへ保存してください。GitHubの検査も生成ずれを拒否します。

旧`/workforce/`と各業務HTMLは`worktime-url.js`で新しい同名ページへ移動します。旧資産・旧manifestを消さないでください。店舗queryは重複・不一致も含めて保持し、従来の照合で拒否します。認証code/state/tokenや任意の戻り先を転送しません。移行前から開いていた認証画面が失敗した場合は、新URLからLINEログインをやり直します。保存操作は自動再送しません。

## LINE設定と配布順

既存の本番LIFF IDは`2011940133-JXUDzLnG`のままです。LINE Developersの同じミニアプリ→ウェブアプリ設定→**本番用エンドポイントURL**を`https://tealabhokkaido.com/software/worktime/`へ変更済みです。今後の移行を再現する場合も同じ項目だけを変更します。開発用・審査用・scope・チャネルシークレット・GAS設定を一緒に変更しません。

[LINE公式仕様](https://developers.line.biz/en/docs/liff/developing-liff-apps/)上、SDK初期化・ログインの戻り先はEndpoint自身かその配下でなければなりません。GitHub Pagesの配信成功と新HTML/共有資産の一致を確認してから、同じ既存EndpointのURLだけを切り替えます。短時間の移行中に古い認証を開始した利用者は新入口からやり直します。LINEのミニアプリURLそのものは変わりません。

在庫アプリが使う旧`/workforce/inventory/auth/`も、新Endpoint内の`/software/worktime/inventory/auth/`へ互換転送します。popupのopener・固定origin/source/nonce照合と、メモリだけのtoken受渡しを維持します。最新mainのopener切断対策（要求固有BroadcastChannel・受領確認）も残します。旧認証窓口からは本人情報を含まない32桁hexのrequestだけを厳密に保持します。在庫本体のURLやAPI/権限には触れません。試験用アカウント画面も`/software/worktime/sandbox/`へ引き継ぎます。

## ホーム画面アプリ

manifestの場所は`/workforce/manifest.webmanifest`、アプリidは`/workforce/`を維持します。起動URLとscopeだけを`/software/worktime/`へ移し、在庫の起動範囲とは分けます。既存アイコンから旧URLを開いても互換入口が案内します。ブラウザによってmanifestの更新時期が違うため、旧ウィンドウやブラウザ枠が残る場合は、新URLをChrome/Safariで開き、旧アイコンを削除して再追加してください。アプリの削除でサーバーの打刻記録は消えません。

Service Worker/オフライン打刻/個人情報の端末保存は追加しません。Android・iPhoneそれぞれで、起動→LINEログイン→復帰→読取の実機確認が必要です。以前の旧URLでの実績を移行後の確認済みと取り違えないでください。

## 戻す場合と確認範囲

まずLINE本番Endpointを旧`https://tealabhokkaido.com/workforce/`へ戻し、GitHubで旧ページの移行script参照・PWA変更・認証窓口変更を含む移行コミットを戻します。Endpointだけ戻すと旧ページが新ページへ転送されるので、片方だけで作業を止めません。実データ・社員ID・打刻受付を復旧操作として変更しないでください。

模擬検査は固定ルート、店舗指定を消さない境界、認証query非転送、資産・内部リンク、PWA同一id、在庫認証窓口を確認します。公開後は新旧URL、実LINEログイン帰還、読取を確認し、試験のための打刻・従業員登録・実シフト公開は行いません。
