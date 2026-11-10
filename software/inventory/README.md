# TLH Inventory

入口：[在庫アプリ](https://tealabhokkaido.com/software/inventory/)。WorkTimeとは別のPWAです。

「LINEでログイン」で共通本人確認を行います。ポップアップを拒否された場合はこのサイトで許可してください。端末への追加は新URLをChrome/Safariで開いて行います。WorkTimeの削除は不要です。

納期は入力せず、発注から対応する受取完了までの実績で自動計算します。安全余裕だけ調整できます。実績なしは未学習と表示します。

[配置・本人確認・納期計算・再構築の詳細](DESIGN.md)。正本は非公開tlh-inventoryのwebと生成スクリプトです。生成後7資産をsoftware/inventory/、認証窓口2資産をworkforce/inventory/auth/、転送HTMLを旧入口へ配置します。旧入れ子URLのPWA説明は変更前の記録です。

## LINEログインの復帰修正

LINEへ移った後で元画面とのopener接続が切れても、同一ブラウザー/保存領域では要求固有のBroadcastChannelで結果を受け取ります。認証窓口の受領確認が完了するまで成功と表示しません。tokenはURL/Storageへ保存しません。更新後は在庫ページ自体を再読み込みしてからログインしてください。戻れない場合はAUTH_RETURN_UNAVAILABLE等の固定診断を確認します。
