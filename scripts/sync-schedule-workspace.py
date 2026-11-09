"""単独ページを正本に、ホームの従業員/管理シフトを別々にを再生成する（標準ライブラリのみ）。

責務: schedule/admin-schedule/admin-schedule-bulk.html → index.htmlの2つの明示範囲。
削除影響: 再生成だけ停止。生成画面を手直しせず、元ページとcontrollerを変更する。
一般化: ID名前空間で本人/管理者のフォームと返信iframeを分離する静的合成。
魔改造: prefix変更はschedule-workspace.jsのidPrefix/frameName、試験と同期。
境界: 私的なデータを埋め込まず、管理者wrapperは初期hidden。認可はGASの担当。
検証: 全DOM IDの一意性と元ページとの同期を試験。再実行で同じ結果になる。
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1] / 'workforce'
target = root / 'index.html'
text = target.read_text(encoding='utf-8')

def main(name):
    source = (root / name).read_text(encoding='utf-8')
    body = source[source.index('<main>')+6:source.index('</main>')]
    return body.replace('<h1', '<h2').replace('</h1>', '</h2>')

employee = main('schedule.html')
employee = employee.replace('<button id="schedule-refresh" type="button" disabled>最新の状態に更新</button>', '<button id="schedule-refresh" type="button" hidden disabled>最新の状態に更新</button><button id="schedule-workspace-refresh" type="button" disabled>シフトを更新</button>')
admin = main('admin-schedule.html')
# 公開用出力は本人側の共有DTOから一つだけ作る。管理用DOMを印刷へ転用しない。
admin = re.sub(r'<section class="schedule-export">[\s\S]*?</section>', '', admin)
admin = re.sub(r'<section id="schedule-report"[\s\S]*?</section>', '', admin)
def prefix(match):
    return match[1] + '="' + ' '.join('schedule-admin-'+v[9:] if v.startswith('schedule-') else v for v in match[2].split()) + '"'
admin = re.sub(r'\b(id|for|aria-labelledby|aria-controls)="([^"]+)"', prefix, admin)
admin = admin.replace('href="#schedule-', 'href="#schedule-admin-')
admin = admin.replace('name="tlhScheduleFrame"', 'name="tlhScheduleAdminFrame"')
admin = admin.replace('href="admin-schedule-bulk.html"', 'href="#schedule-import-section"')
# 管理内だけ月選択を一つにする。管理者の半月選択は承認/締切/公開の対象を選ぶために残す。
admin = admin.replace('<label>表示する月', '<label hidden>表示する月').replace('id="schedule-admin-refresh" type="button"', 'id="schedule-admin-refresh" type="button" hidden')
admin = admin.replace('<h2>シフトの取込み・希望の確認</h2>', '<h2>希望の確認・締切・確定公開</h2>')
bulk = main('admin-schedule-bulk.html')
bulk = bulk.replace('<label>対象月', '<label hidden>対象月').replace('id="bulk-load" type="button"','id="bulk-load" type="button" hidden')
bulk = bulk.replace('href="admin-schedule.html"', 'href="#schedule-manage-review"')
navigation = '<nav class="schedule-task-nav" aria-label="シフトの作業"><a class="button secondary" href="#schedule-calendar">月間カレンダー</a><a class="button secondary" href="#schedule-request-deadline">希望休・変更申請</a></nav>'
shortcuts = '<nav id="schedule-admin-shortcuts" class="schedule-task-nav" aria-label="管理者のシフト作業" hidden><a class="button primary" href="#schedule-import-section">シートを開く・取り込む</a><a class="button secondary" href="#schedule-admin-review">希望を確認する</a><a class="button secondary" href="#schedule-admin-collection">締切を設定する</a><a class="button secondary" href="#schedule-admin-release">確定公開する</a></nav>'
employee = employee.replace('<h2>月間シフト・希望の提出</h2>', '<h1>月間シフト・希望</h1>')
employee = employee.replace('</div></div>', '</div></div>' + navigation + '<p id="schedule-draft-notice" class="footnote" role="status" hidden></p>', 1)
employee_block = ('<!-- schedule-workspace:start -->\n'
    '<div id="schedule-work-panel" data-workforce-pane="schedule" role="tabpanel" aria-labelledby="schedule-tab" hidden>\n'
    + employee + '</div>\n<!-- schedule-workspace:end -->\n')
admin_block = ('<!-- schedule-management:start -->\n'
    '<div id="manager-schedule-panel" data-workforce-pane="manager" role="tabpanel" aria-labelledby="manager-tab" hidden>'
    '<section id="schedule-admin-entry" data-schedule-admin hidden aria-label="管理者用シフト作業">'
    '<h2>シフトの管理</h2><p class="footnote">シート取込み・希望確認・承認・締切・公開をここにまとめます。本人の閲覧・希望申請は従業員用のシフトタブへ。</p>'
    + shortcuts + '<label>管理する月<input id="schedule-management-month" type="month" required></label>'
    '<button id="schedule-management-refresh" type="button" disabled>シフト管理を更新</button>'
    '<section id="schedule-import-section">' + bulk + '</section>'
    '<section id="schedule-manage-review">' + admin + '</section></section></div>\n'
    '<!-- schedule-management:end -->\n')

def replace_block(source, start, end, block):
    return source[:source.index(start)] + block + source[source.index(end)+len(end):].lstrip('\n')

text = replace_block(text, '<!-- schedule-workspace:start -->', '<!-- schedule-workspace:end -->', employee_block)
if '<!-- schedule-management:start -->' in text:
    text = replace_block(text, '<!-- schedule-management:start -->', '<!-- schedule-management:end -->', admin_block)
else:
    # 初回の移動だけ。管理見出し・分類選択の後へ置き、従業員側に管理DOMを残さない。
    marker = '<section id="staff-section"'
    assert text.count(marker) == 1
    text = text.replace(marker, admin_block + marker, 1)
ids = re.findall(r'\bid="([^"]+)"', text)
assert len(ids) == len(set(ids)), 'duplicate DOM id'
target.write_text(text, encoding='utf-8', newline='\n')
print('Separate employee/admin schedule workspaces synchronized; all DOM IDs unique')
