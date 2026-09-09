# ティーラボラトリー北海道 公式Webサイト

`tealabhokkaido.com` で公開するための、最小構成の静的サイトです。GitHub Pagesでそのまま配信できるよう、HTML、CSS、ドメイン設定用の `CNAME` を中心に構成しています。

React、Vue、Next.js、npm、bundler、CSS framework、JavaScript framework、外部CMSは使用していません。X公式タイムラインの表示に限って外部の`widgets.js`を読み込みます。自作の`script.js`はありません。

このREADMEはサイトの設計図と改造時の診断書です。コードにはその場所の設計理由を、ここには概念のつながり・公開までの流れ・故障の調べ方をまとめます。ロゴ原本の扱いは [ブランドアセットの説明](assets/brand/README.md) を参照してください。

## 1. 作成・変更したファイル

- `index.html`: 1ページサイト本体。SEO、OGP、Hero、About、Activities、Information、Updates、Contactを含みます。
- `style.css`: レスポンシブ対応のスタイル。配色、フォント、余白はCSS Custom Propertiesで管理しています。
- `CNAME`: GitHub Pagesで `tealabhokkaido.com` を独自ドメインとして使うためのファイルです。
- `README.md`: サイト構造、公開方法、DNS設定、設計思想、魔改造MAPをまとめた説明です。
- `assets/brand/logo-mark.svg`: faviconや小さな識別表示に使う正式シンボルです。
- `assets/brand/logo-horizontal.svg`: Headerで使う正式横ロゴです。
- `assets/brand/logo-vertical.svg`: Heroで使う正式縦ロゴです。
- `assets/brand/README.md`: ブランドアセット管理の使い方です。

## 2. サイト構造

v1.1は1ページ構成のブランド公式サイトです。

- Hero: 正式縦ロゴ、短いコピー、活動識別情報
- About: 活動概要
- Activities: 現在の主な活動領域6項目
- Information: 2026年8月以降、The TEAとは独立した活動であることの明示
- Updates: X公式タイムラインによる活動更新。読み込めない場合はプロフィールリンクを表示
- Contact: 正式なEmailとXプロフィール
- Footer: サイト名と著作権表記

## 学習用：このサイトの設計思想

### 教材の読み方

コメントは、A:ファイル冒頭の役割、B:Component / Section前の設計理由と改造ポイント、C:特殊な指定の近くにある注意、の3階層です。WHAT(何をするか)、WHY(なぜ選ぶか)、FAILURE MODE(どう壊れるか)を手がかりに読みます。普通の余白や色指定は逐語説明せず、共通概念をこのREADMEに集約しています。

「現在」と書かれた説明はこのリポジトリ内の実装についてです。公開サイトへの反映は、別途GitHubのファイルとPagesのdeployを確認してください。

### HTML / CSSの役割分担

このサイトは、Web制作の基本的な役割分担をそのまま使っています。

| 種類 | 役割 | このサイトでの使い方 |
| --- | --- | --- |
| HTML | 情報と構造 | 見出し、本文、セクション、ナビゲーション、活動項目、Updatesのフォールバック、Contactを定義しています。 |
| CSS | 視覚表現とレイアウト | 色、余白、文字サイズ、Header/Hero/Grid、レスポンシブ表示を定義しています。 |
| JavaScript | 動作・状態変化・インタラクション | X公式タイムラインを描画する外部`widgets.js`だけを使用しています。 |

HTMLは「何が書かれているか」、CSSは「どう見せるか」、JavaScriptは「ユーザー操作や状態変化に応じて何を動かすか」を担当します。

ページ本体はJavaScriptなしでも読めます。XウィジェットだけがProgressive Enhancementとして加わり、動かなければ通常リンクへGraceful Degradationします。サイト独自の動作・状態管理はないため、自作JavaScriptやFrameworkは追加していません。

### 現在の設計

このサイトは1ページのStatic Siteです。Static Siteとは、サーバー側で毎回ページを生成するのではなく、あらかじめ用意したHTML/CSSなどのファイルをそのまま配信するサイトです。

ブラウザで表示される流れはシンプルです。

```text
ブラウザ
↓
index.htmlを読む
├─ style.cssとロゴSVGを読む
└─ widgets.jsを非同期に読む（成功時だけXタイムラインを強化）
↓
画面へ描画する
```

これは読み込みの概念図です。実際にはブラウザがHTMLを解析しながらCSSやSVGも取得して描画します。手元でビルドして別の成果物を作る工程はなく、編集したファイルが公開の元データになります。ただし、ローカルで保存しただけではGitHubや公開サイトは更新されません。

### Static Siteのできること・境界

| HTML/CSSだけで得意なこと | 別の仕組みが必要になりやすいこと |
| --- | --- |
| 情報掲載、ロゴ、静的画像、ページ内リンク、レスポンシブ表示 | 問い合わせ内容の受信・保存、Login、database、管理画面、EC、会員機能 |

HTMLの`form`は入力欄や送信先を定義できますが、送られた情報を受け取り保存する処理は別です。現在のContactは`mailto:`とXへのリンクであり、Webサイト内に受信・保存処理はありません。GitHub Pagesは任意のサーバー処理をこのHTML内で実行する場所ではないため、フォームを作る段階でBackendや外部サービスを選びます。

Dynamic SearchもHTML/CSSだけでは実現しません。小さな静的データをブラウザ内で検索するならJavaScriptで対応でき、常に変わる大きなデータを検索するならAPI等が候補です。Static SiteだからJavaScriptが禁止なのではなく、必要な部分だけ追加できます。現在の例がX公式ウィジェットです。

### 外部サービス埋め込み

UpdatesはX公式のEmbedded Timelineです。`<a class="twitter-timeline">`という通常リンクをHTMLへ置き、`https://platform.x.com/widgets.js`を`async`で1回読み込みます。スクリプトが動くと、Xの公開プロフィールタイムラインが外部コンテンツとして表示されます。X公式は公開ポストを持つプロフィールの埋め込みに対応し、高さとLight / Dark Themeを設定できると案内しています。[Xヘルプ: タイムラインを埋め込む方法](https://help.x.com/ja/using-x/embed-x-feed)

この追加により、以前の純粋なローカルHTML/CSS/SVGだけの構成から、XというExternal Dependencyが1つ増えました。閲覧時にブラウザはXの外部リソースへ通信します。Xは、埋め込みを含むX for WebsitesでページURL、IPアドレス、ブラウザ・OS・Cookie情報等を受け取る場合があると説明しています。具体的な扱いはXの現行ポリシーを確認します。[Xヘルプ: X for Websites](https://help.x.com/en/x-for-websites-ads-info-and-privacy)

| 概念 | このサイトでの実例 | 壊れ方・判断点 |
| --- | --- | --- |
| Third-party Embed | 自サイトのHTMLからXのJavaScriptを読み、Xのコンテンツを描画 | X側の仕様変更・障害・サービス終了で、自サイトを変更していなくても表示が変わり得ます。 |
| Progressive Enhancement | 通常リンクへJavaScriptでタイムライン機能を加える | ウィジェットを前提にContactや重要情報を置かないこと。 |
| Graceful Degradation / Fallback | JavaScript無効・遮断・通信失敗時もプロフィールリンクが残る | anchorを消すとフォールバックも失われます。 |
| `async` | 外部scriptの取得完了を待たず、HTML解析を進められる | 実行時刻や成功順を前提にした自作処理は置いていません。 |
| `iframe` | 外部コンテンツを分離された文書としてページ内へ表示する仕組み | 自サイトCSSから内部pathやポストの見た目を自由に変更できません。公式data属性を使います。 |

`data-height="560"`はタイムラインの高さ、`data-theme="light"`は公式Light Themeです。外枠の最大幅は`.updates-embed`の520pxで管理します。X以外にYouTube、Google Maps、Instagram、Google Forms等を追加するときも、外部通信、表示速度、障害時の代替リンク、サービス側の仕様・プライバシー情報を確認します。必要な法的対応はサイトの運営条件や利用サービスで変わるため、このREADMEでは技術構造までを説明します。

### GitHub Pages

GitHub Pagesは、GitHub上のリポジトリに置いたファイルをWebサーバーから配信する仕組みです。

このサイトでは、リポジトリのルートにある `index.html` がトップページとして配信されます。`style.css` も同じ場所にあるため、HTML内の `<link rel="stylesheet" href="style.css">` から読み込まれます。

GitHub Pages自体の設定方法は、このREADMEの「公開方法」と「独自ドメイン設定の確認項目」にまとめています。

### Git / GitHub / GitHub Pages

| 名前 | 役割 | 混同しやすい点 |
| --- | --- | --- |
| Git | ファイルの変更履歴をcommitとして管理する仕組み | 手元のcommitは、まだGitHub上にない場合があります。 |
| GitHub | Git repositoryを置いて共有するホスティングサービス | ファイルがあることと、Pagesで配信済みであることは別です。 |
| GitHub Pages | repository内の静的ファイルをWeb配信する機能 | このサイトは`main`の`/ (root)`を公開元とする構成です。 |

Gitの内部やGitHub APIで見かける名前は、次の関係です。

```text
file contents -> blob (ファイル内容。名前や置き場所は含まない)
directory structure -> tree (名前・モード・blobや子treeへの参照)
snapshot + metadata -> commit (ルートtree・親commit・作者・日時・メッセージ)
main branch -> commitを指す更新可能な参照
GitHub上のmain更新 -> GitHub Pages build/deploy -> 公開サイト
```

Commit SHAはcommitを識別するIDです。同じ内容でも親やメッセージなどが変わると別のcommitになります。`main`という名前は特定のcommitを指しており、新しいcommitを反映すると指す先が進みます。blobやtreeを作っただけでは、まだ`main`を更新したことにはなりません。これは仕組みの説明であり、特定SHAの反映済みを保証するものではありません。[Git公式: Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)

### CommitとDeployは別

```text
手元のファイルを保存
↓ Gitでcommitし、pushしてGitHubへ反映
GitHub上のmainが更新される
↓ GitHub Pagesのbuild/deployが実行される
公開サイトが更新される
↓ ブラウザが取得・表示する
```

GitHubの画面やAPIで直接commitする場合は手元からのpushを省略できますが、deployの段階は残ります。手元のビルド工程がなくても、Pages側の配信準備は別にあります。

`main`更新と公開更新は同時とは限りません。GitHubでは新しくても、deployが実行待ち・実行中・失敗なら公開サイトは古いままの場合があります。GitHubの`Actions`でPagesの実行結果と対象commitを確認し、`Settings` → `Pages`で公開状況を確認します。成功後も古い場合に調べる別要因がBrowser Cacheです。[GitHub Docs: 公開元とdeploy](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

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

`CNAME` ファイルの中身は `tealabhokkaido.com` の1行だけにします。`www` 側はDNSで `inhokkaido12345-lab.github.io` に向ける想定です。

リポジトリの`CNAME`ファイルとDNSのCNAMEレコードは同じものではありません。ファイルを書くだけでドメイン管理サービスのDNSまで変更されるわけではありません。DNSは接続先、Pagesは配信元、HTMLのcanonicalは検索エンジン向けの代表URLを担当します。

### Information Architecture

Information Architectureは、読む人が知りたいことへ順番にたどり着けるよう情報を配置する設計です。今は「誰か」「何をするか」「The TEAとの関係」「現在の活動」「どう連絡するか」という構造です。

| 現在の位置 | 読む人の疑問に対する役割 |
| --- | --- |
| Identity / Hero | どの活動主体のサイトか。正式ロゴとh1が名前を伝えます。 |
| About | 何をする活動で、どう取り組むか。 |
| Activities | どの領域を扱うか。能力・活動範囲を具体化します。 |
| Information | The TEAとの関係は何か。誤認防止のため本文中に明示します。 |
| Updates | 現在も活動しているか。Xを更新ログとして補助的に表示します。 |
| Contact | どう連絡するか。EmailとXプロフィールを示します。 |

現在の流れは`Identity → Capability → Relationship / Context → Current Activity → Contact`です。将来Works / Projectsを追加すると、`Identity → Capability → Evidence → Current Activity → Contact`へ発展できます。Informationの独立表記は引き続き見つけやすい位置に残し、Evidenceには実際に公開できる成果だけを載せます。

### Class / id / BEM風命名

現在の`<section class="section section--ruled" id="activities" aria-labelledby="activities-title">`は、共通スタイルと派生スタイルを使い、`activities`という固有の住所を持っています。

| 仕組み | 現在の例 | 改造時に合わせて見る場所 |
| --- | --- | --- |
| `class` | `section`や`activity-card`は複数要素へ再利用するスタイル・Component識別 | CSSの`.section`や`.activity-card`。名前を変えただけでは新しいスタイルは生まれません。 |
| `id` | `activities`はページ内で一意の識別子 | `href="#activities"`というFragment Linkの行き先です。 |
| `aria-labelledby` | `activities-title`というh2のidを参照 | 章の名前をその見出しから取得します。sectionのidとは参照の役割が違います。 |

章をコピーしたらidを重複させず、navの`href`と`aria-labelledby`も対応させます。`id`をCSSで指定することも可能ですが、現在は共通classをスタイルの中心にして、住所と見た目を分けています。

命名はBEM完全準拠ではなく、考え方を部分的に借りています。Blockは`brand` / `hero` / `activity-card`のような部品、Elementは`brand__logo` / `hero__layout` / `activity-card__code`のような部品内の部分、Modifierは`section--ruled`のような派生です。`__`や`--`がブラウザに特別な機能を与えるわけではありません。

## CSSを読むための基礎

### Logical Propertiesと単位

CSS Logical Propertiesは物理的な上下左右ではなく、文章の流れに基づく指定です。現在の日本語横書きでは`inline-size ≒ width`、`block-size ≒ height`、`margin-inline ≒ 左右margin`です。`writing-mode`や`direction`に応じて意味が対応しやすく、縦書き・多言語・RTL言語対応の出発点になります。ただしこのCSSには`width`や`border-left`等も残るので、言語設定だけで完全対応するわけではありません。

`rem`はルート要素の文字サイズを基準にした単位、`px`はCSSピクセル、`vw`はブラウザのviewport幅の1%です。文字設定に追従させたいサイズにはrem、線や上限などにはpx、画面幅に連動する余白・幅にはvwを使っています。`%`はプロパティごとの基準で決まり、現在のロゴ幅の`100%`は親の幅です。vwとは基準が違います。

### CSS関数とfr

以下のpx換算例は`1rem = 16px`の場合です。これは説明用の仮定で、サイトでルートの文字サイズを16pxに固定しているわけではありません。

| 正式名称と入力 | どう決まるか | このサイトでの意図・注意 |
| --- | --- | --- |
| CSS math function `min(48vw, 18rem)` | viewportが1000pxなら`min(480px, 288px)`から288pxを採用 | Headerロゴの巨大化を防ぎnavの場所を残します。820px以下では式自体が上書きされます。 |
| CSS math function `clamp(4.5rem, 11vw, 8.5rem)` | 同じ幅なら`clamp(72px, 110px, 136px)`から110px。理想値を最小・最大で制限 | Fluid Design / Fluid Spacing。Hero上余白に使用し、現在の文字サイズはMedia Queryで段階変更します。 |
| Grid sizing function `minmax(250px, 330px)` | 250pxを最小、330pxを最大とする列の範囲を定義し、Gridが配分 | Hero右列です。単純な2値の大小比較ではなく、狭すぎれば最小幅がoverflowの原因にもなります。 |
| Grid notation `repeat(2, minmax(0, 1fr))` | 同じ列定義を2回繰り返す | Activitiesの2列です。3に変えると3列になりますが、カード内容はHTML側で増やします。 |

`fr`はfraction、Gridの余剰空間を分配する比率です。`1fr 1fr`は基本的に等分、`1fr 2fr`なら1:2です。まず固定列や`gap`などを考慮するため、`1fr`は画面幅の一定割合という意味ではありません。

Heroの`minmax(0, 1fr) minmax(250px, 330px)`は、右に範囲付きの列を確保して左が残りを受け持ちます。例えばviewportが1000pxのとき、containerは960px、gapは60px、右列が330pxなら左列は570pxです。ロゴの上限が600pxでも、親の左列が570pxなので実際にはそちらに収まります。[MDN: minmax()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/minmax)

### Automatic Minimum Size

Flex/Grid itemは、既定の最小サイズが内容由来になる場合があります。長い文字列やSVGがあると「幅を縮めたはずなのに縮まず、横へはみ出す」原因になります。Headerの`.brand`にある`min-inline-size: 0`は、「必要なら内容より小さく縮んでよい」という許可で、幅を常に0にする指定ではありません。

`minmax(0, 1fr)`は同じ問題をGridの列側で避ける指定です。itemの最小幅と列の最小幅は別の階層なので、どちらが広がっているかを調べます。これだけで文字の折返しまで作られるわけではなく、画像の幅や長いURLも確認します。原因を見ずに`overflow: hidden`で隠すと、文章やフォーカス枠を切り落とし得ます。[MDN: min-width](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/min-width)

### Cascade / Specificity / Source Order / Inheritance

| 用語 | つまり何か | 現在の実装で読む場所 |
| --- | --- | --- |
| Cascade | 適用条件・出所・重要度などから、競合する宣言の優先順位を決める仕組み全体 | `@media`の条件が合うか、`!important`があるかも関わります。単に上から下ではありません。 |
| Specificity | 同じ優先段階でSelectorの詳細度を比べること | 通常はID、class等、要素名の順に数を比較します。`.activity-card p`は`.activity-card__code`より詳細です。 |
| Source Order | 詳細度なども同じ場合、後に書いた宣言が勝つこと | 基本指定とMedia Query内の`.brand__logo`。 |
| Inheritance | その要素で値が決まっていない継承プロパティを親から引き継ぐこと | 本文の`font-family`や`line-height`。marginやwidthは通常継承しません。 |

このサイトの`.brand__logo`は、基本の`min(48vw, 18rem)`を820px以下で`min(70vw, 16rem)`、460px以下で`min(78vw, 14rem)`へ上書きします。400pxでは両Media Queryが成立し、同じSelectorの後の指定が勝ちます。`block-size: auto`は再指定していないので基本ルールが適用され続けます。親から継承しているのとは違います。[MDN: Cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Introduction)

「CSSを変更したのに効かない」ときは、まずDevToolsで対象要素を選び、次の順に調べます。

1. Stylesで、後ろのルールから上書きされていないかを見る。
2. Media Queryに同じプロパティの別指定がないか、現在幅で条件が合うかを見る。
3. Specificityの高いSelectorや`!important`が優先していないかを見る。
4. 親からInheritanceされた値か、その要素へ直接指定された値かを見る。

候補のルール自体が出ないなら、Selectorの綴り、CSS構文、stylesheetのパス・読み込みを確認します。修正用の`!important`を足し続けると優先順位を追いにくくなります。

## 相対パスと別ページ化

現在は`base`要素を使っていないので、Relative URLはHTMLのURLを基準に解決されます。

| 種類 | 例 | 基準 |
| --- | --- | --- |
| Relative URL | `assets/brand/logo-horizontal.svg`、`style.css` | 現在のHTMLがあるディレクトリ。今はrootのindex.htmlからassets/brandへ進みます。 |
| Root-relative URL | `/assets/brand/logo-horizontal.svg` | 同じorigin(スキーム・ホスト・ポート)のルート。先頭の`/`が目印です。 |
| Absolute URL | `https://tealabhokkaido.com/` | スキームとホストを含むURL。canonicalはこの形式です。 |

将来`/projects/example.html`へ同じ`src="assets/brand/logo-horizontal.svg"`をコピーすると、`/projects/assets/brand/logo-horizontal.svg`を探してしまいます。その階層からなら`../assets/brand/logo-horizontal.svg`が候補です。

Root-relative URLは深さに依存しませんが、独自ドメインを使わないGitHub Pagesの`/tea-lab-hokkaido/`のようなサブパス公開では、そのサブパスを飛ばしてしまいます。Multi-page化時は公開URLとフォルダ構造を合わせて判断します。CSSの`url(...)`はHTMLではなくCSSファイルの位置を基準にする点も違います。

## ブランドアセット

ブランドロゴは `assets/brand/` で管理します。正式SVGはAffinity Designerから書き出したデータをそのまま配置しており、パス、色、viewBox、文字形状はサイト側で改変していません。

現在の構成:

| ファイル | 役割 |
| --- | --- |
| `assets/brand/logo-mark.svg` | Symbol / favicon / very small identity。ブラウザタブや小さな識別表示に使います。 |
| `assets/brand/logo-horizontal.svg` | Header / 横長スペース。ページ上部のCompact Brandに使います。 |
| `assets/brand/logo-vertical.svg` | Hero / 主ブランド表示。First Viewで視覚上の社名として使います。 |

SVGを使う理由:

- ベクター形式なので、拡大縮小しても基本的にぼやけません。
- `viewBox`から固有の縦横比を得られ、CSSで幅と高さを適切に指定すると比率を保って表示できます。
- PNG/JPGなどのraster imageより、ロゴや記号のような形状に向いています。
- 文字はカーブ化済みのため、閲覧環境に同じフォントがなくてもロゴ形状が保たれます。

Asset Variantの考え方:

同じブランドでも、使う場所によって適した形が違います。Headerには横長ロゴ、Heroには縦ロゴ、faviconにはマーク単体を使います。`logo.svg` のような曖昧な重複ファイルは作らず、用途がファイル名から分かる命名にしています。

Responsive SVG / Intrinsic Size:

`style.css`では`inline-size`で表示幅を決め、`block-size: auto`で高さを自動にしています。SVG内部の座標系である`viewBox`と、CSSで与える画面上のサイズは別物です。現在のSVGは`width="100%" height="100%"`を持ち、固定pxのIntrinsic Sizeに頼らず、`viewBox`から得られるIntrinsic Aspect Ratioを利用しています。

`viewBox` / SVG viewport / vector graphics / pathの対応と実測値は [ブランドアセットのSVG解説](assets/brand/README.md#svgの内部座標と表示サイズ) にまとめています。Asset Managementとして原本を`assets/brand/`に分け、将来の写真は`assets/images/`、共有画像は`assets/og/`、実績画像は`assets/projects/`などへ分離できます。これらの将来用ディレクトリはまだ作成していません。

### 外部SVGとInline SVG

| 形式 | 特徴 | このサイトでの判断 |
| --- | --- | --- |
| 外部SVG: `<img src="assets/brand/logo-horizontal.svg">` | 独立したファイルを画像として読み込みます。同じファイルを複数箇所から参照でき、HTMLに大量のpathを含めずに済みます。 | Affinity書き出しデータをそのまま保管し、正式ブランド原本を保護しやすいため採用しています。 |
| Inline SVG: HTML内へ`<svg>...</svg>`を書く | 内部のpathもページのDOMになり、CSSのSelectorや`currentColor`、JavaScriptで操作できます。 | 色・形状を動的に変える用途には便利ですが、現在のロゴでは必要ありません。 |

外部SVGの内部pathへ、ページの`.brand__logo path`のようなCSSは届きません。親の`color`を変えてもロゴ内部の色は自動連動しません。今後monochromeやdark背景用の正式データができたら、別のAsset Variantとして追加して`src`を切り替えます。

ロゴ差し替え方法:

1. 同じファイル名で `assets/brand/` 内のSVGを差し替えます。
2. Headerのロゴサイズは `style.css` の `.brand__logo` を調整します。
3. Heroのロゴサイズは `style.css` の `.hero-brand__logo` を調整します。
4. faviconを別データにする場合は、`index.html` の `<link rel="icon">` の `href` を変更します。

注意:

- SVGのパス形状、ブランドカラー、viewBox、日本語文字形状、シンボル形状をサイト側で改変しないでください。
- SVGの `viewBox` は削除しないでください。
- 固定 `width` / `height` に依存しすぎず、CSS側の `max-inline-size` や `inline-size` で制御します。
- OGP画像には今回のSVGロゴをそのまま指定しません。SNS互換性を考えると、将来 `assets/og/` などへ1200x630程度のPNG/JPEGを別途用意する方針が安全です。
- faviconは現在 `logo-mark.svg` をそのまま使っています。小さなブラウザタブで細部が潰れる場合、将来favicon専用の簡略マークを追加できます。

## ブランドカラー

v1.1では正式ブランドパレットへ移行しています。CSSでは主に`:root`のSemantic Tokenを参照し、部品ごとに色の意味を管理しています。

| ブランド色 | CSS上の主なToken | 役割 |
| --- | --- | --- |
| `#F3EFE7` | `--color-bg`, `--color-surface` | Base / Background。サイト全体の基底面です。 |
| `#252829` | `--color-text` | Primary Text。本文と最重要文字です。 |
| `#2F5452` | `--color-brand` | Primary Brand。見出し、小ラベル、主要な線などに使います。 |
| `#8E3F35` | `--color-point` | Point / Signal。番号、強調、識別記号などに小さく使います。 |
| `#495C63` | `--color-muted`, `--color-steel` | Steel Dark。補助見出し、英字、Secondary Textに使います。 |
| `#7C908E` | `--color-steel-light`, `--color-line` | Steel Light。線、境界、弱い補助情報に使います。 |

`--color-brand` は「緑系の色」ではなく「ブランドの主要アクセント」という役割名です。将来ブランド色を変える場合も、変数名ではなく値を変更します。

ただし変数を変えると連動するのは`var(...)`で参照している箇所だけです。SVG内部の色、headの`theme-color`、CSS内の一部の半透明背景は個別指定です。`--color-line`と`--color-brand-soft`もRGB値を直接持っており、他のTokenから自動計算していません。`--color-steel-light`は現在パレット記録として定義され、`var()`での使用箇所はありません。全配色を変えるときは、これらと文字・背景のコントラストも確認します。

## Hero構造

Heroはページの主役となる導入セクションです。First View / Above the Foldはスクロール前に見える範囲で、端末の高さによりHero全体と一致しない場合があります。

現在のHeroは次の役割分担です。

- `eyebrow`: `01 / INDEPENDENT LABORATORY / RESEARCH STUDIO` のような小さな分類ラベル
- `h1.visually-hidden`: 画面には表示しないページ主題。Semantic HTMLとAccessibilityを担当します。
- `img.hero-brand__logo`: 視覚上の正式ブランド表示。`assets/brand/logo-vertical.svg` を表示します。
- `hero__lead`: 「北海道を基盤に、食・技術・実装を横断する。」という短いコピー
- `aside.field-label`: 活動の識別情報。BASE、FIELDS、METHOD、STATUSを表示します。

視覚上の社名はロゴ画像が担当し、HTML上の主題は `h1` が担当します。ロゴ画像は `alt="" aria-hidden="true"` とし、同じ「ティーラボラトリー北海道」をスクリーンリーダーへ二重読み上げさせないようにしています。

日本語社名の不自然な改行問題は、視覚上の主役を正式縦ロゴへ移し、HTML上のページ主題を `h1.visually-hidden` に分離することで解決しています。

## Activities拡張

Activitiesは `div.activity-list` の中に `article.activity-card` を並べる構造です。

6項目の現在構成:

- A-01 FOOD & BEVERAGE R&D
- A-02 PRODUCT DEVELOPMENT
- A-03 EQUIPMENT DEVELOPMENT
- A-04 SOFTWARE DEVELOPMENT
- A-05 HOKKAIDO RESEARCH
- A-06 DESIGN & PROTOTYPING

活動を増やす場合は、`index.html` の `article.activity-card` をコピーして番号、見出し、説明文を変更します。

6項目から8項目に増やす場合、現在の2列Gridなら `2列 x 4段` として自然に表示できます。3列にしたい場合は `style.css` の `.activity-list` にある `grid-template-columns` を `repeat(3, minmax(0, 1fr))` へ変更できます。ただしカードの親は最大1120pxのcontainer全体ではなく、見出し列とgapを除いた`section__grid`の右列です。3列では本文が狭くなるため、文章量とセットで判断してください。

820px以下ではMedia Queryにより1列表示へ上書きされます。枚数だけ増やすならCSS変更は不要です。追加後は820pxの前後とスマートフォン幅で長い英字見出しも確認します。

## 魔改造MAP

| やりたいこと | 主に触る場所 | 関係する概念 |
| --- | --- | --- |
| ロゴを変更する | `assets/brand/` と `index.html` のHeader/Hero | SVG / Asset Management / Asset Variant |
| Headerだけマーク単体にする | `index.html` の `.brand` と `.brand__logo` | Decorative Image / Accessible Name |
| Heroだけ横ロゴにする | `index.html` の `.hero-brand__logo` の `src` | Asset Variant / Information Architecture |
| monochromeロゴを追加する | `assets/brand/` と参照元の `src` | Asset Management / Design System |
| dark background用ロゴを追加する | `assets/brand/` と背景を使うsection | Theme / Contrast / Asset Variant |
| favicon専用簡略マークを追加する | `assets/brand/` または `assets/favicon/` と `head` | favicon / SVG / Browser Metadata |
| ロゴサイズを変更する | `style.css` の `.brand__logo`, `.hero-brand__logo` | Intrinsic Size / max-inline-size / Responsive SVG |
| ブランド色を変更する | `style.css` の `:root` | CSS Custom Properties / Design Token / Semantic Token |
| Heroレイアウトを変更する | `style.css` の `.hero__layout` | CSS Grid / Responsive Design |
| Heroに写真を入れる | `index.html` の `.hero` 周辺と `style.css` の `.hero__layout` | HTML `img` / Responsive Image / Layout |
| HeroにCTAボタンを入れる | `index.html` の `.hero__content` | Link / Button / Above the Fold |
| Activitiesを追加する | `index.html` の `article.activity-card` | Component / Semantic HTML |
| Activitiesの列数を変更する | `style.css` の `.activity-list` | CSS Grid / Grid Layout |
| スマホ表示を変更する | `style.css` の `@media` | Responsive Design / Breakpoint / Cascade |
| OGP画像を追加する | `index.html` の `head` | OGP / Twitter Card / Social Metadata |
| 実績セクションを追加する | `index.html` のセクション追加位置 | Semantic HTML / Information Architecture |
| 別ページ化する | 新規HTMLファイルとナビゲーション | Multi-page Static Site |
| サイト独自の動きを追加する | `style.css` または将来の自作`script.js` | Animation / Interaction / prefers-reduced-motion |
| 問い合わせフォームを作る | `index.html` の `#contact` | Form / Backend / Privacy |
| ダークモードを作る | `style.css` の `:root` とMedia Query等 | Theme / CSS variables / color-scheme |
| ゲーム事業を将来追加する | Activitiesまたは新規section | Information Architecture / Content Strategy |
| 本文幅を変える | `style.css` の `--container` と `.container` | Layout / max-width / margin-inline |
| フォントを変える | `style.css` の `--font-serif` / `--font-sans` | Font Stack / CSS Inheritance |
| 見出し階層を整理する | `index.html` の `h1` / `h2` / `h3` | Semantic HTML / Accessibility |
| ナビ項目を増やす | `index.html` の `nav` と対応する `section id` | Fragment Link / id / href |
| メールアドレスを変更する | `index.html` の`#contact`にある表示文字と`mailto:` | URI Scheme / Contact Information |
| Xアカウントを変更する | `#updates`のhref・表示名と`#contact`のXリンク | External Link / Third-party Embed |
| Xタイムラインの高さを変える | `.twitter-timeline`の`data-height` | Embedded Widget / Data Attribute |
| X埋め込みを削除する | `#updates`と末尾の`widgets.js`読み込み | External Dependency / Information Architecture |
| X以外のSNSを追加する | Contactまたは新しいsection | External Link / Information Architecture |
| 外部scriptを確認する | `index.html`末尾の`script` | Third-party JavaScript / async |
| 深い階層へページを増やす | 新規HTMLの`src` / `href`とCSSの`url()` | Relative URL / Multi-page Static Site |
| 縦書き・RTLへ対応する | Logical Propertiesと残っている物理方向の指定 | writing-mode / direction / Internationalization |
| CSSが効かない理由を調べる | DevToolsのStyles / Computed | Cascade / Specificity / Source Order |
| 公開が更新されない理由を調べる | GitHubの対象commit、Pagesのdeploy、Network | Git / Deployment / Browser Cache |

## Browser DevToolsで実験する

Browser DevTools / Developer Toolsは、表示中のページを調べて試しに変更するブラウザの開発者ツールです。Chrome / EdgeではF12で開けます。端末によってはFn+F12、または右クリックの「検証」から開きます。

1. 要素選択ツールでHeaderロゴなどを選び、`Elements`でHTML構造とclassを見る。
2. `Styles`で適用されるCSSを見る。打消し線は上書きの手がかり、プロパティのチェックボックスは一時的に無効化する実験に使えます。
3. `Computed`でブラウザが最終的に計算した幅や色を見る。式を書いた場所と、実際に決まった値を区別できます。
4. `Device Toolbar`のResponsiveモードで幅を変える。821px / 820px、461px / 460pxの両側を見るとBreakpointによる差が分かります。

例えば`.brand__logo`の幅を一時的に変えて、navがどう折り返すかを観察します。外部SVGの内部pathはこのページのElementsには現れないので、ロゴの形状ではなく画像の表示枠を選びます。

通常のDevTools編集は、その場のブラウザ表示だけの変更です。再読み込みで戻り、ローカルのHTML/CSSやGitHub上のファイルは変更されません。永続化機能を別途設定しない限り、壊して試せる実験場として使えます。結果を採用するときに初めて実ファイルを編集します。端末シミュレーションだけで実機のフォントや操作まで完全再現できるわけではありません。[Chrome DevTools: CSSの確認と変更](https://developer.chrome.com/docs/devtools/css)

## Browser Cacheと更新確認

ブラウザはCSS、SVG、画像などをcacheして再利用する場合があります。ただし「古い表示」の原因がcacheとは限らないので、次の順で切り分けます。

1. GitHub上の`main`で目的のファイルとcommitを確認する。ローカル保存だけで止まっていないかを見る。
2. その更新に対応したPages deployが成功したかを見る。実行待ちや失敗なら、cacheを消しても更新されません。
3. 公開ページを通常リロードし、まだ古ければChrome / EdgeのCtrl+Shift+Rで強制再読み込みを試す。
4. DevToolsの`Network`を開いて再読み込みし、CSS/SVGのRequest URL、Status、Response、cache利用表示を確認する。404はまずパスを、200/304は内容や再検証の結果を調べます。

Networkの`Disable cache`は通常DevToolsを開いている間の診断に使えます。全履歴やCookieの削除から始める必要はありません。faviconは独自にcacheされる場合があるため、`link rel="icon"`の参照と実ファイルを確認してから、タブを開き直す等で確かめます。

## 困ったときの診断表

| 症状 | 最初に見る場所 | 切り分け方 |
| --- | --- | --- |
| ロゴが出ない | `src` / `assets/brand/` / GitHub上のfile | 名前の大文字小文字や階層を照合し、Networkで404を確認。Windowsでは気付かない綴りの差も公開先では影響し得ます。 |
| CSSが効かない | DevTools Styles / Cascade / Media Query | 読み込まれているか、Selectorが一致するか、後から上書きされるかを調べる。 |
| スマホだけ崩れる | `@media` | 820pxと460pxの条件を確認。460px以下では両方のブロックが適用候補です。 |
| 横スクロールが出る | width / min-size / overflow | はみ出す要素をElementsで特定し、固定幅・Automatic Minimum Size・長い文字列を確認。bodyは現在320pxの最小幅を持ちます。 |
| GitHubでは変わったがサイトが古い | Pages deploy / Browser Cache | mainの対象commit、deploy成功、ブラウザ取得内容の順に見る。 |
| faviconが変わらない | favicon cache / `link rel="icon"` | 参照先とGitHub上のSVGを先に確認し、タブの再表示等を試す。 |
| ページ内リンクが飛ばない | `href="#..."` / `id` | 参照先の綴りとidの一意性を確認。ARIAが参照する見出しidとの混同にも注意。 |
| 色を一括変更したい | `:root` Design Token | var()の参照範囲を確認。外部SVGや直接指定の色まで自動では変わりません。 |
| Activitiesを増やしたい | `article.activity-card` | `activity-list`内へコピーし、番号・h3・説明文を更新。2列なら8枚でも列数変更は不要。 |
| ロゴ比率がおかしい | SVG viewBox / `block-size: auto` | 原本を修正する前にCSSの幅と高さ、親の制約、viewBox内の余白を確認。 |
| h1の文字設定を変えてもロゴが変わらない | `h1.visually-hidden` / SVG | 見出しは意味、ロゴは視覚表現を担当。SVGの文字はカーブ化済みです。 |
| h1が見えない | `.visually-hidden` | 現在は意図した動作。削除やdisplay:noneにせず、支援技術に残る見出しかを確認。 |
| フォームの内容が届かない | Contact / formの送信先 | 入力画面と受信・保存処理は別。現在はフォーム自体を実装していません。 |
| メールリンクで何も起きない | `mailto:` / OS・ブラウザの既定メールアプリ | Webサイトが直接送信する機能ではありません。hrefの綴りと端末設定を切り分けます。 |
| Xリンク先が違う | `#updates`と`#contact`のhref | 同じアカウント情報が2箇所にあるため、表示名も含めて照合します。 |
| Xタイムラインが出ない | `twitter-timeline` / `widgets.js` / Network | 通常リンクが残るかを確認し、外部scriptの遮断・失敗やX側の状態を調べます。サイト本体の故障とは限りません。 |
| Xタイムラインが大きすぎる | `data-height` / `.updates-embed` | 高さは公式data属性、外側の最大幅はCSSで管理します。iframe内部へCSS hackを加えません。 |

## 教材として学ぶ順序

1. `index.html`のmainを読み、Hero → About → Activities → Information → Updates → Contactの情報順と見出し階層を追う。
2. classとidを手がかりに`style.css`を検索し、`:root`から部品へのvar()参照を追う。
3. DevToolsで1つの値を試し、min() / clamp() / Grid / min-sizeが実サイズにどう効くかを見る。
4. 820px / 460pxの前後を試し、StylesとComputedで上書きを確かめる。
5. UpdatesをJavaScript無効または通信遮断の条件でも確認し、FallbackとExternal Dependencyの境界を見る。
6. ブランドアセットの説明を読み、SVG原本とCSSの表示サイズ、h1と画像の意味分担を理解する。
7. ファイル保存 → commit → GitHubへの反映 → Pages deploy → cacheの順を確認し、小さな変更を1つずつ履歴に残す。

## 3. 公開方法

このサイトはGitHub Pagesで公開する想定です。現在の公開URLは `https://tealabhokkaido.com/` です。

1. GitHubリポジトリ `inhokkaido12345-lab/tea-lab-hokkaido` のルートにファイルを配置します。
2. GitHubのリポジトリ画面で `Settings` → `Pages` を開きます。
3. `Build and deployment` の `Source` を `Deploy from a branch` にします。
4. Branchを `main`、フォルダを `/ (root)` に設定します。
5. `Custom domain` に `tealabhokkaido.com` を設定します。
6. DNS反映後、`Enforce HTTPS` が選択可能になったら有効化します。

既に公開済みの場合は、上記設定を変更せず、`index.html`、`style.css`、`README.md`、`assets/brand/README.md` などのファイル更新だけを反映します。

## 4. 独自ドメイン設定の確認項目

GitHub Pagesの公式ドキュメントに基づく設定です。既に公開済みで問題なく動いている場合、DNSを不用意に変更する必要はありません。

### GitHubで確認する操作

- GitHubアカウントまたはOrganizationで、可能であれば `tealabhokkaido.com` のドメイン所有確認を行う。
- リポジトリの `Settings` → `Pages` でCustom domainが `tealabhokkaido.com` になっていることを確認する。
- `Enforce HTTPS` が有効になっていることを確認する。

### ドメイン管理サービスで確認するDNSレコード

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
| CNAME | `www` | `inhokkaido12345-lab.github.io` |

注意:

- ワイルドカードDNSレコード（例: `*.tealabhokkaido.com`）は設定しないでください。
- `www` のCNAME値にはリポジトリ名を含めません。
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

`index.html`の`id="contact"`にある`contact-list`を編集します。メールアドレスは画面上の文字と`href="mailto:..."`をセットで変更し、Xは`href`と表示中のハンドルをセットで変更します。Xアカウントを変える場合は`id="updates"`のタイムラインリンクも同時に更新してください。

`mailto:`はメール作成を要求するURI Schemeです。端末の既定メールアプリに依存し、サイトから直接送信する処理ではありません。問い合わせフォームに変える場合は、HTMLの入力欄とは別に受信・保存先を用意します。

### Updates / X埋め込み

`index.html`の`id="updates"`にある`.twitter-timeline`がプロフィールURL、表示名、`data-height`、`data-theme`を持ちます。外枠幅は`style.css`の`.updates-embed`です。

X埋め込みを完全に削除する場合は、`#updates`セクション、Headerの`href="#updates"`、body末尾にある`https://platform.x.com/widgets.js`のscriptをセットで整理します。Contactの通常Xリンクを残すかはInformation Architectureとして別に判断できます。scriptは現在1回だけ読み込みます。

### 配色・フォント・余白

`style.css` 先頭の `:root` にあるCSS変数を編集してください。

主な変数:

- `--color-bg`
- `--color-surface`
- `--color-text`
- `--color-muted`
- `--color-line`
- `--color-brand`
- `--color-point`
- `--color-steel`
- `--color-steel-light`
- `--color-brand-soft`
- `--font-serif`
- `--font-sans`
- `--container`
- `--space-*`

### セクション追加

`index.html` 内のコメント `セクション追加位置` の下に、新しい `section` 要素を追加してください。

## 将来の拡張候補

今回は実装していませんが、将来的に次のようなセクションやページを追加できます。

- Works / 実績
- Projects
- Products
- Research Notes
- Equipment
- Software
- Games
- News
- About詳細
- Contact Form

追加時は、まず `index.html` に新しい `section` を作り、必要になった段階で複数HTMLファイルへ分けるのが単純です。フォームの受信処理やCMSの管理機能は、現在のHTML/CSSだけでは賄えません。静的ページと外部サービスを組み合わせる構成も可能なので、導入前に公開ページと処理側の役割を分けて検討してください。

## 公開前に確認したい点

2026-09-09のコメント監査では、説明の誤りと実コードの確認事項を分けました。`.visually-hidden`の未使用説明、HeroとFirst Viewの混同、BreakpointやCascadeの不正確な説明は訂正済みです。以下のCSSは今回変更していません。

| 区分 | 現在の状態と確認事項 |
| --- | --- |
| 実コード上の不整合 | 活動番号の`.activity-card__code`は`--color-point`を指定していますが、`.activity-card p`の方がSpecificityが高いため、実際には`--color-muted`が優先します。番号へPoint色を使う意図かどうかを確認してから修正する箇所です。 |
| 実コード上の要確認 | `a:focus-visible`の枠は`--color-brand-soft`(透明度0.12)です。単色の`--color-bg`上へ合成した計算では約1.20:1のコントラストで、薄い枠になります。実ページの背景とTab操作で視認性を確認し、必要なら別作業で色を見直します。 |

コメント量に起因する点として、元の文字コード宣言は先頭1024バイトの範囲をわずかに超えていました。今回、その前のコメントを短くして範囲内へ戻しました。`meta charset`要素の位置関係・属性・値は変更していません。今後も冒頭に長い説明を追加せず、詳細はREADMEへ置きます。[HTML Standard: 文字コード宣言](https://html.spec.whatwg.org/multipage/semantics.html#charset)
