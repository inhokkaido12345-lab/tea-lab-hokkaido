<!-- current-doc-status:start -->
> 2026-11-05資料整理：機能仕様と保守資料。現在の公開・設定・未達状況は[最新状態](CURRENT-STATUS.md)を優先してください。本文の過去の日付・版・検査件数は当時の記録です。恒久的な安全方針は引き続き適用します。
<!-- current-doc-status:end -->

# 自分のアカウント情報

「その他」→「自分のアカウント情報を確認」→ページ表示時に、ログイン中の本人の登録情報を読みます。管理者も同じ入口です。管理タブに本人情報を混ぜません。

## 表示するもの

| 項目 | 保存元/意味 |
|---|---|
| TLHアカウントID | Users.tlh_user_id。LINEが変わっても維持するTLH内部の人物ID。社員コードとは別 |
| アカウント状態 | 有効なAccountのみ表示。停止/対応不明は情報を返さない |
| 現在のログイン方法 | 今回の本人確認に使ったLINE |
| 連携済みの認証方法 | 本人のACTIVE Identitiesのprovider名だけ。LINE固有IDや秘密は表示しない |
| 社員コード・登録氏名 | 本人に対応するEmployeeProfiles。LINEの表示名とは別 |
| 従業員登録の状態・入社日・退職日 | 同じProfile。空欄は「未登録」、Profileがなければ「従業員登録なし」 |
| 従業員/管理者権限 | 現在有効なEMPLOYEE/WORKFORCE、TLH_ADMIN/GLOBALの登録を各々確認。表示を次の操作の認可に再利用しない |

登録内容が違う場合は、社員コードと違っている項目を管理者へ伝えるか、この画面を見せます。自動通知/編集/連携解除はしません。氏名・入社日の訂正は既存の管理操作を使います。現在はLINEログインだけで、独自パスワード・メール/SMS認証は未実装です。この画面の追加ではログイン方式や権限を増やしません。

## 責務・削除影響・魔改造MAP

- `account-info.html`は本人向けの入口。削除しても保存情報は消えません。ホームのリンクと併せて変更します。
- `account-info.js`のinitは既存読取イベント/通信状態、bootstrapはLINE準備後の初回自動取得、verifyはHMAC、parseInfoは許可DTO、renderは項目順と文言を担当します。消すとこの画面だけ停止します。
- private repoの`gas/workforce/AccountInfoService.gs`は共通Accountと従業員情報を読取専用で組み合わせ、`BridgeAccountInfo.gs`は公式LINE検証/許可入力/HMAC応答を担当します。共通Account層は従業員表へ依存させません。
- 項目追加はServiceのDTO、Bridgeの署名契約、parseInfo、render、両repoのaccount-infoテストを同時更新します。DTO全体を無検査で表示したり、Sheet行をそのまま返したりしません。
- 見た目は既存app.cssのsecondary-page/card/review-valuesを再利用します。氏名・長いIDは文字として折り返し、innerHTMLへ入れません。

## 安全な読取と確認

対象IDをクライアントから指定せず、公式LINEで検証したsubjectからだけ決定。POSTの許可入力はaction/idToken/nonce/responseKeyの4つで、社員コード/他人のID/roleを追加したリクエストは拒否します。停止Identity・停止Account・重複・不正な日付・復旧停止印は情報を返さず、自動修復/新規登録しません。

表示は固定iframeのorigin/子孫source・nonce/action・DTO全体のHMACを検証した後だけ。読取中は二重送信せず、再確認開始/拒否/timeout/ページ退場で以前の情報を消します。応答遅延で古い情報を復活させず、URL・console・localStorage・sessionStorageへ個人情報を保存しません。認証方法はprovider名だけで、LINE固有ID/メールアドレス/秘密は返しません。

`node --test tests/*.mjs`とprivate repoの連結試験で検査します。模擬LINE/Sheetsと実UI/Service/HMACをつなぐ試験と、本人LINEでの表示確認は別の証拠です。公開はGASの配布照合を先に行い、その後に画面mainを進めます。
