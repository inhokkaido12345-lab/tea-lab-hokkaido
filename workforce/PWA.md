# ホーム画面起動・LINEログイン

利用URLは **https://tealabhokkaido.com/software/worktime/**。従業員向けの追加手順は[ヘルプ](employee-help.html#android)、移行/切戻しは[URL移行](URL-MIGRATION.md)を参照してください。

## 現在の設定

manifestは既存の`/workforce/manifest.webmanifest`、アプリidは`/workforce/`を維持します。start_urlとscopeは`/software/worktime/`。表示名はTLH Work Time、制作元はTEA LABORATORY HOKKAIDO/SOFTWARE/xxxです。在庫等をscopeへ含めません。idと公開URLは役割が違うため、古い文字列を検索して一括置換しないでください。

既存アイコンの起動URLは互換転送します。ブラウザごとにmanifest更新時期が違い、古い枠やURLが残る場合は、新URLをChrome/Safariで開いて旧アイコンを削除し再追加します。アイコンを消してもサーバーの打刻記録は消えません。

## 認証・通信の境界

LINEの既存IDを使い、本番Endpointは新URLへ設定済みです。未ログインや本人確認拒否では本人がLINEログインを押して復帰します。通常の通信障害・署名不正と認証切れは区別し、保存結果不明中に新しい保存やログイン遷移で結果を見失わないようにします。保存は自動再送しません。

オンライン必須です。Service Worker、個人情報のStorage/IndexedDB、オフライン送信キュー、Push通知は追加していません。静的なアイコン/manifestは本人確認や保存完了の証明ではありません。

## 確認実績と残件

旧URLではAndroid＋Chromeのインストール/起動/LINE往復を本人確認済み。新URLでは実ブラウザの既存LINEセッション初期化・GAS読取・旧入口転送を確認しました。**新URLのAndroidホーム画面、iPhone、期限切れ後の新規OAuth往復は別途確認が必要**です。

実機では、起動→勤務先表示→必要時LINEログイン→同じ画面へ復帰→タブの読取を確認します。表示確認のため登録・打刻・承認は押しません。通信断で成功と表示しないことは模擬検査で確認し、実打刻を通信断試験へ使いません。

## 改造と検査

名前/色/起動範囲はmanifest、画像はicons、生成元はscripts/build-workforce-pwa-icons.py。旧manifest URL/idの変更は既存インストールを別アプリにする可能性があるため、URL移行設計と端末確認が必要です。LINEのEndpoint外でSDKを動かす変更はしません。

`python scripts/sync-worktime-url.py --check`と`node --test tests/*.mjs`を実行。静的設定/資産寸法/保存しない境界を検査し、実機成功の代用にはしません。

[説明整理前の記録](history/20261110-before-guidance-audit-PWA.md)。
