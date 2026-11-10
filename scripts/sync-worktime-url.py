"""Work Timeの公開URLを生成する。Python標準ライブラリだけで実行できる。

責務: workforceの編集元HTML -> software/worktimeの配信HTML。業務JS/CSS/画像は
旧パスの共有資産を参照し、二重に編集・保守しない。削除すると新URLの更新が停止する。
概念: public route / source tree / deterministic generation。URLは保存先や認可ではない。
魔改造: 公開ルートの変更はPWA・LINE Endpoint・互換ルート・本テストと同期する。
秘密の境界: 実データ/認証文字列を生成しない。Inventory本体は編集・コピーしない。
検証: python scripts/sync-worktime-url.py --check と node --test tests/*.mjs。
"""
from pathlib import Path
import argparse
import re
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'workforce'
TARGET = ROOT / 'software' / 'worktime'
ORIGIN = 'https://tealabhokkaido.com'
CANONICAL = '/software/worktime/'
TAG = '<script src="/workforce/worktime-url.js"></script>'

def pages():
    return sorted(SOURCE.glob('*.html')) + [SOURCE / 'sandbox/index.html', SOURCE / 'inventory/auth/index.html', SOURCE / 'inventory/index.html']

def generated(source):
    relative = source.relative_to(SOURCE)
    text = source.read_text(encoding='utf-8')
    # baseは資産だけ旧パスへ。アプリ内リンクは下で新公開URLへ変換する。
    # manifestも元のURLを維持し、既存PWAのアプリ識別子を引き継ぐ。
    base = '/workforce/' + (relative.parent.as_posix() + '/' if relative.parent.as_posix() != '.' else '')
    text = text.replace(TAG, '')
    routes = {p.relative_to(SOURCE).as_posix() for p in pages()}
    def link(match):
        value = match[1]
        resolved = urlsplit(urljoin(ORIGIN + base, value))
        if value.startswith('#') or resolved.netloc != 'tealabhokkaido.com':
            return match[0]
        if resolved.path.startswith('/workforce/'):
            suffix = resolved.path[len('/workforce/'):]
            key = suffix + 'index.html' if suffix.endswith('/') or not suffix else suffix
            if key in routes:
                return 'href="' + CANONICAL + suffix + ('?' + resolved.query if resolved.query else '') + ('#' + resolved.fragment if resolved.fragment else '') + '"'
        return match[0]
    text = re.sub(r'href="([^"]+)"', link, text)
    # リンク変換の後にbaseを挿入する。base自身を新URLへ変換すると共有資産が404になる。
    text = re.sub(r'<head>', '<head>\n<base href="' + base + '">\n', text, count=1)
    # 旧一括編集のmeta refreshも新管理画面へ。資産用baseへ戻らない。
    text = text.replace('content="0;url=admin-schedule.html"', 'content="0;url=/software/worktime/admin-schedule.html"')
    return text

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for source in pages():
        destination = TARGET / source.relative_to(SOURCE)
        expected = generated(source)
        if args.check:
            if not destination.is_file() or destination.read_text(encoding='utf-8') != expected:
                raise SystemExit('Work Time公開HTMLが未同期: ' + str(destination.relative_to(ROOT)))
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(expected, encoding='utf-8', newline='\n')
    print('Work Time public HTML ' + ('verified' if args.check else 'generated') + ': ' + str(len(pages())))

if __name__ == '__main__':
    main()
