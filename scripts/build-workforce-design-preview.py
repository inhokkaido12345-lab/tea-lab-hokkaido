"""管理/その他の見た目だけを実HTMLから再現する（Python標準ライブラリのみ）。

責務: 現役index.htmlの対象paneとapp.cssを使う、認証不要の表示見本を生成する。
呼出し: Pythonでこのファイルを実行→workforce/design/*.html。稼働コードは読み込まない。
削除影響: 見本の再生成だけ停止。GAS/本番の登録や打刻には影響しない。
一般概念: 静的なデザインの検証用fixture。権限確認を迂回する画面ではない。
改造: pane境界/HTMLを変えたら抽出範囲とDESIGN.mdを同期し、見本を再生成する。
秘密: 実データを取得しない。script/iframeを除去し、フォーム/移動先を無効にする。
検証: index.htmlの既存id/hidden/disabledを変えず、生成物で通信/保存できないことを確認。
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1] / 'workforce'
source = (root / 'index.html').read_text(encoding='utf-8')
parts = {
    'manager': source[source.index('<div id="manager-tools-panel"'):source.index('<section id="staff-section"')]
        + source[source.index('<div id="manager-registration-panel"'):source.index('<!-- claim/発行')]
        + source[source.index('<div id="manager-maintenance-panel"'):source.index('<div id="manager-test-panel"')],
    'more': source[source.index('<div id="employee-registration-panel"'):source.index('<div id="manager-registration-panel"')],
}
dest = root / 'design'
dest.mkdir(exist_ok=True)
for name, body in parts.items():
    body = re.sub(r'<(?:iframe|script)\b[\s\S]*?</(?:iframe|script)>', '', body)
    body = re.sub(r'(<(?:div|section)\b[^>]*\bid="(?:manager-tools-panel|manager-registration-panel|manager-maintenance-panel|maintenance-section|staff-admin)"[^>]*?)\s+hidden', r'\1', body)
    body = re.sub(r'<(button|input|select|textarea)\b', r'<\1 disabled', body)
    body = re.sub(r'href="[^"]*"', 'href="#preview-notice"', body)
    assert not re.search(r'<script|<iframe|action=|\bon\w+=', body)
    title = '管理' if name == 'manager' else 'その他'
    (dest / (name + '.html')).write_text(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'; font-src \'self\'; form-action \'none\'; base-uri \'none\'">'
        '<title>' + title + 'の表示見本 | TLH Workforce</title>'
        '<link rel="stylesheet" href="../fonts/ibm-plex-sans-jp.css?v=1">'
        '<link rel="stylesheet" href="../app.css?v=20261103-palette1"></head>'
        '<body class="home-page"><div class="app"><main>'
        '<p id="preview-notice" class="session-notice">表示見本：ログイン・通信・保存なし。操作は無効です。'
        ' <a href="manager.html">管理の見本</a> / <a href="more.html">その他の見本</a></p>'
        + body + '</main></div></body></html>\n', encoding='utf-8')
print('Generated two inert presentation previews from current HTML/CSS')
