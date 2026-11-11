"""単独ページを正本に、ホームの従業員/管理シフトを別々に再生成する（標準ライブラリのみ）。

責務: schedule/admin-schedule.html → index.htmlの2つの明示範囲。
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

def main(name, offset=0):
    source = (root / name).read_text(encoding='utf-8')
    body = source[source.index('<main>')+6:source.index('</main>')]
    # 単独はh1起点、管理への埋込みは単独h1をcategory h2へ1段下げる。id/フォームは変更しない。
    return re.sub(r'<(/?)h([1-6])(?=[\s>])', lambda m: '<'+m[1]+'h'+str(min(6,int(m[2])+offset)), body)

employee = main('schedule.html')
employee = employee.replace('<button id="schedule-refresh" type="button" disabled>最新の状態に更新</button>', '<button id="schedule-refresh" type="button" hidden disabled>最新の状態に更新</button><button id="schedule-workspace-refresh" type="button" disabled>シフトを更新</button>')
admin = main('admin-schedule.html', offset=1)
navigation = '<nav class="schedule-task-nav" aria-label="シフトの作業"><a class="button secondary" href="#schedule-calendar">全員のシフト表</a><a class="button secondary" href="#schedule-request-deadline">希望休・変更申請</a></nav>'
employee = employee.replace('<h1>月間シフト・希望の提出</h1>', '<h1>月間シフト・希望</h1>')
employee = employee.replace('</div></div>', '</div></div>' + navigation + '<p id="schedule-draft-notice" class="footnote" role="status" hidden></p>', 1)
employee_block = ('<!-- schedule-workspace:start -->\n'
    '<div id="schedule-work-panel" data-workforce-pane="schedule" role="tabpanel" aria-labelledby="schedule-tab" hidden>\n'
    + employee + '</div>\n<!-- schedule-workspace:end -->\n')
admin_block = ('<!-- schedule-management:start -->\n'
    '<div id="manager-schedule-panel" data-workforce-pane="manager" role="tabpanel" aria-labelledby="manager-tab" hidden>'
    '<section id="schedule-admin-entry" data-schedule-admin hidden aria-label="管理者用シフト作業">'
    + admin + '</section></div>\n<!-- schedule-management:end -->\n')

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
