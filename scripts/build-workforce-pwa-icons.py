"""PWAの仮文字アイコンを再生成する開発用スクリプト。実行時配信や認証には不要。
役割/流れ: 固定色とT/L/Hの長方形→SVG/PNGをworkforce/iconsの固定3ファイルへ保存。
削除影響: Gitの既存画像は配信できるが再生成できない。業務データには触れない。
概念: reproducible static asset / separation of build-time and runtime。
魔改造: RECTANGLESと色を変え、manifest/アイコン寸法の試験・PWA.mdを同時更新。
境界: 個人情報/外部通信/フォント取得なし。Python標準ライブラリだけで再現可能。
検証: node --test tests/pwa-preparation.test.mjs と画像の目視。企業ロゴの制定ではない。
"""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / 'workforce' / 'icons'
BACKGROUND = (47, 84, 82)
FOREGROUND = (243, 239, 231)
RECTANGLES = [(124, 196, 199, 213), (153, 213, 170, 316),
              (218, 196, 235, 316), (235, 299, 286, 316),
              (306, 196, 323, 316), (373, 196, 390, 316), (323, 247, 373, 264)]


def chunk(kind, data):
    """PNGの長さ・種類・本文・検査値を組み立てる。画像内容以外を埋め込まない。"""
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))


def png(size):
    """512座標の文字を指定寸法へ縮尺し、外部依存なしのRGB PNGを返す。"""
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            px, py = (x + .5) * 512 / size, (y + .5) * 512 / size
            color = FOREGROUND if any(a <= px < c and b <= py < d for a, b, c, d in RECTANGLES) else BACKGROUND
            rows.extend(color)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    ROOT.mkdir(exist_ok=True)
    rects = ''.join(f'<rect x="{a}" y="{b}" width="{c-a}" height="{d-b}"/>' for a, b, c, d in RECTANGLES)
    (ROOT / 'app.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>TLH</title><path fill="#2F5452" d="M0 0h512v512H0z"/><g fill="#F3EFE7">' + rects + '</g></svg>\n', encoding='utf-8')
    for size in (192, 512):
        (ROOT / f'app-{size}.png').write_bytes(png(size))
    print('PWA_ICONS_BUILT')
