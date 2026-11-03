# IBM Plex Sans JP の同一サイト配布

IBM Plex Sans JPをOFL-1.1に従って配布。公式の説明: https://github.com/IBM/plex/tree/master/packages/plex-sans-jp 。配布ライセンスはOFL.txt。

licenseSha256はUTF-8・LFに正規化した文書の値。WindowsのCRLF checkoutとLinuxで本文が同じかを検査するためで、ライセンス本文は変更していません。フォントバイナリのSHA-256は元バイト列そのものです。

Google Fonts v8の未改変WOFF2とunicode-rangeを保存。取得元と各ファイルのSHA-256はmanifest.json。400（本文）/600（見出し・操作）の2種類だけを使い、全246分割の合計は約2.9MB。ブラウザは画面の文字と太さに対応する分割だけを読み、全量を先読みしない。名前に出る文字を限定しないため、全ての分割を保存している。

`ibm-plex-sans-jp.css`をapp.cssより前に読み、`font-display:swap`で本文表示を待たせない。Google Fonts/CDNへの実行時通信、npm依存、追跡コード、フォントインストールはない。印刷の日本語も同じファミリーを使う。共有app.cssのページに適用し、独立CSSのsandbox/recoveryは今回の変更範囲外。

改造: `app.css`の:rootのfont-family、見出しの600を一組で変更。フォントCSS/ライセンス/manifestとHTML参照も同期。ファイルだけ削除すると代替フォントへ戻り404になるので、削除時はHTMLのlinkも外す。字体を変更した加工版を同じ名前で再配布せず、OFLの条件を確認する。
