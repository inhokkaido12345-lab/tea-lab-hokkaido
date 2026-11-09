"""単独ページを正本に、ホームのシフト作業場だけを再生成する（標準ライブラリのみ）。

責務: schedule/admin-schedule/admin-schedule-bulk.html → index.htmlの明示範囲。
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
employee = employee.replace('<button id="schedule-refresh" type="button" disabled>最新の状態に更新</button>', '<button id="schedule-refresh" type="button" hidden disabled>最新の状態に更新</button><button id="schedule-workspace-refresh" type="button" disabled>シフト全体を更新</button>')
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
# 月選択は作業場で一つ。管理者の半月選択は承認/締切/公開の対象を選ぶために残す。
admin = admin.replace('<label>表示する月', '<label hidden>表示する月').replace('id="schedule-admin-refresh" type="button"', 'id="schedule-admin-refresh" type="button" hidden')
admin = admin.replace('<h2>シフトの取込み・希望の確認</h2>', '<h2>希望の確認・締切・確定公開</h2>')
bulk = main('admin-schedule-bulk.html')
bulk = bulk.replace('<label>対象月', '<label hidden>対象月').replace('id="bulk-load" type="button"','id="bulk-load" type="button" hidden')
bulk = bulk.replace('href="admin-schedule.html"', 'href="#schedule-manage-review"')
navigation = '<nav class="schedule-task-nav" aria-label="シフトの作業"><a class="button secondary" href="#schedule-calendar">月間カレンダー</a><a class="button secondary" href="#schedule-request-deadline">希望休・変更申請</a></nav>'
shortcuts = '<nav id="schedule-admin-shortcuts" class="schedule-task-nav" aria-label="管理者のシフト作業" hidden><a class="button primary" href="#schedule-import-section">シートを開く・取り込む</a><a class="button secondary" href="#schedule-admin-review">希望を確認する</a><a class="button secondary" href="#schedule-admin-collection">締切を設定する</a><a class="button secondary" href="#schedule-admin-release">確定公開する</a></nav>'
employee = employee.replace('<h2>月間シフト・希望の提出</h2>', '<h1>月間シフト・希望</h1>')
employee = employee.replace('</div></div>', '</div></div>' + navigation + shortcuts, 1)
block = ('<!-- schedule-workspace:start -->\n'
    '<div id="schedule-work-panel" data-workforce-pane="schedule" role="tabpanel" aria-labelledby="schedule-tab" hidden>\n'
    + employee + '\n'
    '<section id="schedule-admin-entry" data-schedule-admin hidden aria-label="管理者用シフト作業">'
    '<h2>管理者用のシフト作業</h2><p class="footnote">管理者権限を確認した場合だけ表示します。勤務の編集はスプレッドシートで行います。</p>'
    '<nav class="schedule-task-nav" aria-label="管理者のシフト作業"><a class="button primary" href="#schedule-import-section">シートを開く・取り込む</a><a class="button secondary" href="#schedule-manage-review">希望確認・締切・公開</a></nav>'
    '<section id="schedule-import-section">' + bulk + '</section>'
    '<section id="schedule-manage-review">' + admin + '</section></section></div>\n'
    '<!-- schedule-workspace:end -->\n')

start, end = '<!-- schedule-workspace:start -->', '<!-- schedule-workspace:end -->'
if start in text:
    text = text[:text.index(start)] + block + text[text.index(end)+len(end):].lstrip('\n')
else:
    # 最初の移行だけ、旧管理メニューの入口と旧本人paneを置き換える。
    text = re.sub(r'<section id="schedule-admin-entry"[\s\S]*?</section>', '', text)
    a, b = text.index('<div id="schedule-work-panel"'), text.index('<div id="manager-tools-panel"')
    text = text[:a] + block + text[b:]
text = re.sub(r'<button id="manager-schedule-choice"[\s\S]*?</button>\s*', '', text)
text = text.replace('manager-tools-panel schedule-admin-entry ', 'manager-tools-panel ')
ids = re.findall(r'\bid="([^"]+)"', text)
assert len(ids) == len(set(ids)), 'duplicate DOM id'
target.write_text(text, encoding='utf-8', newline='\n')
print('Schedule workspace synchronized; all DOM IDs unique')
