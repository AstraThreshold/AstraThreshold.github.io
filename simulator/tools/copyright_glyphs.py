"""Embed the original WenQuanYi glyphs missing from Lite's small font subset."""
from pathlib import Path
import re

PORT = Path(__file__).resolve().parents[1] / 'port'
source = (PORT / 'copyright-extra.bdf').read_text(encoding='utf-8')
output = ['/* WenQuanYi Bitmap Song 0.9.9.8; GPL v2 with font embedding exception.\n'
          ' * Original font attribution/license is preserved in copyright-extra.bdf.\n'
          ' * Generated with: python simulator/tools/copyright_glyphs.py */']
calls = []
for block in re.findall(r'STARTCHAR .*?ENDCHAR', source, re.S):
    code = int(re.search(r'ENCODING (\d+)', block)[1])
    w, h, xo, yo = map(int, re.search(r'BBX (\d+) (\d+) (-?\d+) (-?\d+)', block).groups())
    rows = re.search(r'BITMAP[ \t]*\n(.*?)\nENDCHAR', block, re.S)[1].splitlines()
    stride = (w+7)//8;data = [0]*(h*stride)
    for y, row in enumerate(rows):
        value = int(row, 16)
        for x in range(w):
            if value & (1 << (len(row)*4-1-x)): data[y*stride+x//8] |= 1 << (x%8)
    output.append(f'static const uint8_t copyright_glyph_{code}[] = '+'{'+','.join(hex(b) for b in data)+'};')
    x = 2 if code == 36731 else 14
    calls.append(f'    u8g2_DrawXBMP(&u8g2,{x+xo},baseline-({h+yo}),{w},{h},copyright_glyph_{code});')
output.append('static void draw_lightweight(int16_t baseline) {\n'+'\n'.join(calls)+'\n}')
(PORT / 'lite-font-extra.h').write_text('\n'.join(output)+'\n', encoding='utf-8')
print('Embedded the original 12 px glyphs for 轻量')
