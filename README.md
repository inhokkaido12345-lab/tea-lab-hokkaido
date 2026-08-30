# ティーラボラトリー北海道 公式Webサイト

`tealabhokkaido.com` で公開するための、最小構成の静的サイトです。ビルド工程、外部フレームワーク、外部スクリプト、Cookie、トラッキングは使用していません。

## 1. 作成・変更したファイル

- `index.html`: 1ページサイト本体。SEO、OGP、各セクションの文章を含みます。
- `style.css`: レスポンシブ対応のスタイル。配色、フォント、余白はCSS変数で管理しています。
- `CNAME`: GitHub Pagesで `tealabhokkaido.com` を独自ドメインとして使うためのファイルです。
- `README.md`: サイト構造、公開方法、DNS設定、今後の拡張場所をまとめた説明です。

JavaScriptは現時点で不要なため、`script.js` は作成していません。

## 2. サイト構造

初版は1ページ構成です。

- Hero: サイト名と短いコピー
- About: 活動概要
- Activities: 現時点の主な活動領域4項目
- Information: 2026年8月以降、The TEAとは独立した活動であることの明示
- Contact: 連絡先を後から設定するための枠
- Footer: サイト名と著作権表記

## 学習用：このサイトの設計思想

### HTML / CSSの役割分担

このサイトは、Web制作の基本的な役割分担をそのまま使っています。

| 種類 | 役割 | このサイトでの使い方 |
| --- | --- | --- |
| HTML | 情報と構造 | 見出し、本文、セクション、ナビゲーション、活動項目、Contact枠を定義しています。 |
| CSS | 視覚表現とレイアウト | 色、余白、文字サイズ、2列/1列レイアウト、レスポンシブ表示を定義しています。 |
| JavaScript | 動作・状態変化・インタラクション | 現在は必要ないため使用していません。 |

HTMLは「何が書かれているか」、CSSは「どう見せるか」、JavaScriptは「ユーザー操作や状態変化に応じて何を動かすか」を担当します。

現在のサイトは、ページ内リンクとレスポンシブ表示だけで目的を満たせるため、JavaScriptを追加していません。

### 現在の設計

このサイトは1ページのStatic Siteです。Static Siteとは、サーバー側で毎回ページを生成するのではなく、あらかじめ用意したHTML/CSSなどのファイルをそのまま配信するサイトです。

ブラウザで表示される流れはシンプルです。

```text
ブラウザ
↓
index.htmlを読む
↓
style.cssを読む
↓
画面へ描画する
```

ビルド工程がないため、`index.html` と `style.css` を編集すれば、その内容がそのまま公開物になります。GitHub Pagesとの相性もよい構成です。

### GitHub Pages

GitHub Pagesは、GitHub上のリポジトリに置いたファイルをWebサーバーから配信する仕組みです。

このサイトでは、リポジトリのルートにある `index.html` がトップページとして配信されます。`style.css` も同じ場所にあるため、HTML内の `<link rel="stylesheet" href="style.css">` から読み込まれます。

GitHub Pages自体の設定方法は、このREADMEの「公開方法」と「独自ドメイン設定で残っている作業」にまとめています。

### 独自ドメイン

独自ドメイン公開では、`CNAME`、DNS、GitHub Pagesがそれぞれ別の役割を持ちます。

```text
利用者
↓
tealabhokkaido.com
↓ DNS
GitHub Pages
↓
このリポジトリのindex.html
```

- `CNAME`: GitHub Pages側に、このサイトで使う独自ドメインが `tealabhokkaido.com` であることを伝えるファイルです。
- DNS: ドメイン管理サービス側で、`tealabhokkaido.com` や `www.tealabhokkaido.com` の行き先をGitHub Pagesへ向ける設定です。
- GitHub Pages: GitHub上のファイルをWebサイトとして配信する場所です。

`CNAME` ファイルの中身は `tealabhokkaido.com` のままにします。`www` 側はDNSで `TODO: GitHubユーザー名またはOrganization名.github.io` に向ける想定です。

## 魔改造MAP

| やりたいこと | 主に触る場所 | 関係する概念 |
| --- | --- | --- |
| 色を全部変える | `style.css` の `:root` | CSS Custom Properties / Design Token / Semantic Token |
| 活動を増やす | `index.html` の `article.activity-card` | Semantic HTML / Component |
| Activitiesを2列から3列にする | `style.css` の `.activity-list` | CSS Grid / Grid Layout |
| スマホ表示を変える | `style.css` の `@media` | Responsive Design / Breakpoint / Cascade |
| Heroに写真を入れる | `index.html` の `.hero` 周辺と `style.css` の `.hero__layout` | HTML `img` / Grid Layout |
| HeroにCTAボタンを入れる | `index.html` の `.hero__content` | Link / Button / Above the Fold |
| SNS共有画像を付ける | `index.html` の `head` | OGP / Twitter Card |
| 新しいページを作る | 新規HTMLファイルとナビゲーション | Multi-page Site / Static Site |
| 動きを付ける | `style.css` または将来の `script.js` | Animation / JavaScript / prefers-reduced-motion |
| 問い合わせフォームを作る | `index.html` の `#contact` | Form / Backend / Privacy |
| ダークモードを作る | `style.css` の `:root` とMedia Query等 | Theme / CSS variables / color-scheme |
| 本文幅を変える | `style.css` の `--container` と `.container` | Layout / max-width / margin-inline |
| フォントを変える | `style.css` の `--font-serif` / `--font-sans` | Font Stack / CSS Inheritance |
| 見出し階層を整理する | `index.html` の `h1` / `h2` / `h3` | Semantic HTML / Accessibility |
| ナビ項目を増やす | `index.html` の `nav` と対応する `section id` | Fragment Link / id / href |

## 3. 公開方法

GitHub Pagesで公開する想定です。

1. GitHubで公開用リポジトリを作成します。
2. このフォルダ内のファイルをリポジトリのルートに配置してpushします。
3. GitHubのリポジトリ画面で `Settings` → `Pages` を開きます。
4. `Build and deployment` の `Source` を `Deploy from a branch` にします。
5. Branchを `main`、フォルダを `/ (root)` に設定して保存します。
6. `Custom domain` に `tealabhokkaido.com` を入力して保存します。
7. DNS反映後、`Enforce HTTPS` が選択可能になったら有効化します。

このローカルフォルダは現時点でGitリポジトリではなく、GitHubユーザー名・リポジトリ名も未指定のため、GitHub側の設定は未実行です。

## 4. 独自ドメイン設定で残っている作業

GitHub Pagesの公式ドキュメントに基づく設定です。不明な値は推測せず、TODOとして残しています。

### GitHubで行う操作

- GitHubアカウントまたはOrganizationで、可能であれば `tealabhokkaido.com` のドメイン所有確認を行う。
- リポジトリの `Settings` → `Pages` でCustom domainに `tealabhokkaido.com` を設定する。
- DNS反映後、`Enforce HTTPS` を有効化する。

### ドメイン管理サービスで設定するDNSレコード

apexドメイン `tealabhokkaido.com`:

| 種別 | ホスト名 | 値 |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

IPv6も使う場合:

| 種別 | ホスト名 | 値 |
| --- | --- | --- |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

`www.tealabhokkaido.com`:

| 種別 | ホスト名 | 値 |
| --- | --- | --- |
| CNAME | `www` | `TODO: GitHubユーザー名またはOrganization名.github.io` |

例: GitHubユーザー名が `example-user` の場合、`www` のCNAME値は `example-user.github.io` です。リポジトリ名は含めません。

注意:

- ワイルドカードDNSレコード（例: `*.tealabhokkaido.com`）は設定しないでください。
- GitHub PagesのCustom domainを先に設定してから、DNSを向けるのが安全です。
- DNS反映には最大24時間程度かかる場合があります。

参考:

- [GitHub Docs: Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub Docs: Verifying your custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)

## 5. 今後拡張する場合の場所

### サイト名

`index.html` 内の以下を更新してください。

- `<title>`
- `og:title`
- `twitter:title`
- ヘッダーの `.brand`
- Hero内の `<h1>`
- Footer

### About文章

`index.html` の `id="about"` セクション内にあるコメント `About文章` の直後を編集してください。

### Activities

`index.html` の `id="activities"` セクション内にある `article.activity-card` を追加・編集してください。

### Contact

`index.html` の `id="contact"` セクション内にある `contact-placeholder` を、メールアドレス決定後に `mailto:` リンクへ差し替えてください。

### 配色・フォント・余白

`style.css` 先頭の `:root` にあるCSS変数を編集してください。

主な変数:

- `--color-bg`
- `--color-text`
- `--color-accent`
- `--font-serif`
- `--font-sans`
- `--container`
- `--space-*`

### セクション追加

`index.html` 内のコメント `セクション追加位置` の下に、新しい `section` 要素を追加してください。
