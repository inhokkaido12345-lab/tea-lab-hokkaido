# Brand Assets

このディレクトリは、TEA LABORATORY HOKKAIDO の正式ブランドアセットを置く場所です。Affinity Designerから書き出した正式SVGをそのまま配置しています。

このREADMEはAsset Management(素材管理)の説明です。正式原本とWeb上の表示指定を分け、ロゴの大きさを変えるだけでパスや色に手を入れないために置いています。全体のレイアウト・公開方法・診断表は [サイト設計図](../../README.md) を参照してください。

## 現在のファイル

| ファイル | 用途 |
| --- | --- |
| `logo-mark.svg` | Symbol / favicon / very small identity。ブラウザタブや小さな識別表示に使います。 |
| `logo-horizontal.svg` | Header / 横長スペース。ページ上部のCompact Brandに使います。 |
| `logo-vertical.svg` | Hero / 主ブランド表示。First Viewの視覚的な社名に使います。 |

## Asset Variant

Asset Variantとは、同じブランドのロゴを用途別に分けて管理する考え方です。

このサイトでは、Headerは横長、Heroは縦組み、faviconはマーク単体と役割が違うため、`logo.svg` のような曖昧な重複ファイルは作らず、用途が分かるファイル名にしています。

## SVGの内部座標と表示サイズ

| 正式用語 | つまり何か | このサイトでの読み方 |
| --- | --- | --- |
| SVG / Vector Graphics | 輪郭や線を座標で表すベクター画像。Raster Image(PNG/JPEG等)の画素の集まりとは異なります。 | CSSで拡大縮小しても輪郭を再描画できます。ただし小さすぎる表示では細部は見分けにくくなります。 |
| `path` | 点・直線・曲線などの描画命令。主に`d`属性が形状を表します。 | カーブ化された文字も形のデータです。数値変更は誤字訂正やサイズ指定ではなく、原画の変更になります。 |
| `viewBox` | `min-x min-y width height`の4値で、表示へ対応付ける内部座標の範囲を指定します。 | 「この絵をどの座標系で描いたか」。ブラウザで何px幅に置くかとは別です。 |
| SVG viewport | SVGを描画する表示領域。内部座標がこの枠へ変換されます。 | imgのCSSが表示枠を決めます。`vw`が基準にするブラウザのviewportとは区別します。 |
| Intrinsic Size / Intrinsic Aspect Ratio | 画像由来の固有サイズ / 固有の縦横比。サイズと比率は別の情報です。 | 現在のSVGはwidth/heightが100%で、固定pxの固有サイズに頼らずviewBoxの比率を利用します。 |

現在の原本の値は次のとおりです。`vertical`はロゴ構成のvariant名で、画像の縦が横より長いことを意味しません。

| ファイル | viewBox | 内部の幅:高さ |
| --- | --- | --- |
| `logo-mark.svg` | `0 0 876 750` | 876:750 |
| `logo-horizontal.svg` | `0 0 3618 750` | 3618:750 |
| `logo-vertical.svg` | `0 0 2678 1199` | 2678:1199 |

Responsive SVGでは、CSSで幅を決め、高さを`block-size: auto`にして固有比率から求めます。Heroのロゴは`inline-size: min(100%, 600px)`なので、親幅と600pxの小さい方を採用します。表示幅が600pxなら高さは`600 × 1199 / 2678 ≒ 268.6px`です。Headerや狭幅の上限はstyle.css内に別の指定があります。

```text
SVG内部: pathをviewBoxの座標系で描く
↓ 比率を保ちながら表示枠へ対応付ける
CSS: inline-sizeで幅を決め、block-size:autoで高さを求める
```

`viewBox`は輪郭ぴったりとは限らず、絵の周囲の透明な余白も含み得ます。ロゴが小さく見えるときは「画像枠」と「枠内の絵」を区別します。幅と高さを別々に固定すると固有比率と枠の比率がずれ、余白などが意図と変わります。表示調整のためにviewBoxを削除・切り詰めると、切取りや拡縮の基準まで変わるため原本は編集しません。[MDN: viewBox](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox)

## 外部SVGとして扱う理由

現在はimgから独立ファイルを参照しています。HTMLを小さく保ち、同じ素材を再利用し、Affinityの書き出し内容をそのまま保持するためです。HTMLにSVGコードを埋め込むInline SVGなら内部pathをCSSやDOM操作の対象にできますが、外部画像の内部へページ側のSelectorは届きません。比較は [サイト設計図](../../README.md#外部svgとinline-svg) にまとめています。

## カーブ化された文字

ロゴ内の文字はカーブ化済みです。閲覧環境に同じフォントがなくても形状が保たれる一方、SVG内の文字列としては編集できません。表記変更が必要な場合は、元のAffinity Designerデータから正式に書き出し直してください。

## 変更時の注意

- SVGのパス形状、ブランドカラー、viewBox、日本語文字形状、シンボル形状をサイト側で改変しないでください。
- 正式原本には最適化・簡略化・色置換をかけません。将来別用途のデータが必要になったら、正式に制作した別variantを追加します。
- Headerで `logo-mark.svg` と `logo-horizontal.svg` を二重に並べないでください。
- OGP画像にはこのSVGをそのまま使わず、将来 `assets/og/` などに1200x630程度のPNG/JPEGを用意してください。
- faviconは現在 `logo-mark.svg` を使っています。小さく潰れる場合は、将来favicon専用の簡略マークを追加できます。

## サイトでの参照場所

- Header: `index.html` の `.brand__logo` が `logo-horizontal.svg` を参照します。
- Hero: `index.html` の `.hero-brand__logo` が `logo-vertical.svg` を参照します。
- favicon: `index.html` の `link rel="icon"` が `logo-mark.svg` を参照します。

アクセシビリティ上、ロゴ画像は `alt="" aria-hidden="true"` とし、意味は親リンクの `aria-label` や `h1` が担当します。これにより「ティーラボラトリー北海道」を二重読み上げさせません。

この扱いは、周囲のHTMLに同じ意味が既にあるため成立します。ロゴを別ページへ単独コピーし、親リンクの名前もh1もない状態にすると意味が失われます。Decorative Image(装飾画像)の指定だけを無条件に流用せず、その場所のAccessible Nameを確認します。

## 魔改造時に触る場所

| やりたいこと | 編集箇所 | 壊しやすい点 |
| --- | --- | --- |
| Headerをマーク単体にする | index.htmlの`.brand__logo`のsrcとstyle.cssの同class | 横ロゴとマークは比率が違います。幅だけ同じにするとHeaderが高くなり得ます。 |
| Heroを横ロゴにする | `.hero-brand__logo`のsrcとCSS | 透明余白・コピーとの間隔・右ラベルとの釣合いを確認。h1は残します。 |
| ロゴサイズを変える | `.brand__logo` / `.hero-brand__logo`と820px / 460pxのMedia Query | 基本ルールだけ変えても、狭幅の同じ指定には上書きされます。 |
| monochrome / dark背景用を追加 | 正式variantをこのフォルダへ追加し、参照元のsrcを変更 | 現在のSVGのpathや色を書き換えて代用しないこと。背景とのコントラストも確認します。 |
| favicon専用マークを追加 | 正式な小サイズ用variantとheadの`link rel="icon"` | まず参照先とdeployを確認し、その後favicon cacheを調べます。 |

差し替えたら、ローカルの存在確認だけで終えず、GitHub上のmainに同じファイル名で配置されたか、Pages deployが成功したかを確認します。公開先では大文字小文字や相対パスの階層違いで404になり得ます。ブランド名を変える際は画像だけでなく、aria-label / h1 / metadataも合わせて見直します。
