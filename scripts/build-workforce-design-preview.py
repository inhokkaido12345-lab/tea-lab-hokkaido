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
        + source[source.index('<div id="manager-maintenance-panel"'):source.index('<div id="manager-test-panel"')]
        + source[source.index('<div id="manager-support-panel"'):source.index('<div id="more-tools-panel"')],
    'more': source[source.index('<div id="employee-registration-panel"'):source.index('<div id="manager-registration-panel"')]
        + source[source.index('<div id="more-tools-panel"'):source.index('</main>')],
}
# 切替ボタンを動かさず、選択ごとの静的見本を作る。権限確認/通信を含む現役JSは読み込まない。
parts['manager-employees'] = parts['manager']
parts['manager-schedule'] = parts['manager']
dest = root / 'design'
dest.mkdir(exist_ok=True)
for name, body in parts.items():
    body = re.sub(r'<(?:iframe|script)\b[\s\S]*?</(?:iframe|script)>', '', body)
    body = re.sub(r'(<(?:div|section)\b[^>]*\bid="(?:manager-tools-panel|manager-support-panel|labor-policy-section|maintenance-section|staff-admin|more-tools-panel)"[^>]*?)\s+hidden', r'\1', body)
    if name.startswith('manager'):
        selected={'manager':'attendance','manager-employees':'employees','manager-schedule':'schedule'}[name]
        groups={'manager-attendance-panel':'attendance','manager-registration-panel':'employees','manager-maintenance-panel':'employees','schedule-admin-entry':'schedule'}
        for panel, category in groups.items():
            def visibility(m, visible=category == selected):
                tag=re.sub(r'\s+hidden(?=[\s>])', '', m.group(0))
                return tag if visible else tag[:-1]+' hidden>'
            body=re.sub(r'<(?:div|section)\b[^>]*\bid="'+panel+r'"[^>]*>', visibility, body)
        for category in ['employees','attendance','schedule']:
            body=re.sub(r'(<button\b[^>]*id="manager-'+category+r'-choice"[^>]*aria-pressed=")[^"]+"',lambda m:m[1]+str(category==selected).lower()+'"',body)
    # 本番のdisabledを保持し、同じ属性を重複させず全操作を無効化する。
    body = re.sub(r'<(?:button|input|select|textarea)\b[^>]*>',
                  lambda m: m[0] if re.search(r'\sdisabled(?:\s|=|>)', m[0]) else m[0][:-1] + ' disabled>', body)
    body = re.sub(r'href="[^"]*"', 'href="#preview-notice"', body)
    assert not re.search(r'<script|<iframe|action=|\bon\w+=', body)
    body = '\n'.join(line.rstrip() for line in body.split('\n'))
    title = {'manager':'出退勤の管理','manager-employees':'従業員の管理','manager-schedule':'シフトの管理','more':'その他'}[name]
    (dest / (name + '.html')).write_text(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'; font-src \'self\'; form-action \'none\'; base-uri \'none\'">'
        '<title>' + title + 'の表示見本 | TLH Work Time</title>'
        '<link rel="stylesheet" href="../fonts/ibm-plex-sans-jp.css?v=1">'
        '<link rel="stylesheet" href="../app.css?v=20261104-manager-sections"></head>'
        '<body class="home-page"><div class="app"><main>'
        '<p id="preview-notice" class="session-notice">表示見本：ログイン・通信・保存なし。操作は無効です。'
        ' <a href="manager.html">出退勤</a> / <a href="manager-employees.html">従業員</a> / <a href="manager-schedule.html">シフト管理</a> / <a href="more.html">その他</a></p>'
        + body + '</main></div></body></html>\n', encoding='utf-8', newline='\n')
print('Generated four inert presentation previews from current HTML/CSS')
