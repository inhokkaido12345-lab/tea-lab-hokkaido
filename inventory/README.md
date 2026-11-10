# TLH Inventory

入口：[在庫アプリ](https://tealabhokkaido.com/inventory/)。WorkTimeとは別のPWAです。

「LINEでログイン」で共通本人確認を行います。ポップアップを拒否された場合はこのサイトで許可してください。端末への追加は新URLをChrome/Safariで開いて行います。WorkTimeの削除は不要です。

納期は入力せず、発注から対応する受取完了までの実績で自動計算します。安全余裕だけ調整できます。実績なしは未学習と表示します。

[配置・本人確認・納期計算・再構築の詳細](DESIGN.md)。正本は非公開tlh-inventoryのwebと生成スクリプトです。生成後7資産をinventory/、認証窓口2資産をworkforce/inventory/auth/、転送HTMLを旧入口へ配置します。旧入れ子URLのPWA説明は変更前の記録です。
