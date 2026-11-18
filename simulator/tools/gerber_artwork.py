"""Export the visible face artwork from the owner's RS-274X core-board Gerbers.

Usage: python simulator/tools/gerber_artwork.py PATH_TO_PCB2_ZIP
The original archive is read only; its fabrication files are not copied to dist.
"""
from pathlib import Path
import hashlib
import math
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
UNIT = .000254  # inch, 2:5 coordinates
WIDTH, HEIGHT = 36.449, 26.289


def n(value):
    return f'{value:.5f}'.rstrip('0').rstrip('.') or '0'


def layer(source):
    data = source.replace('\r', '').replace('\n', '')
    if '%FSLAX25Y25*%' not in data or '%MOIN*%' not in data:
        raise ValueError('Expected absolute inch 2:5 Gerber coordinates')
    metadata = {}
    for code, x, y, radius, rotation in re.findall(
            r'G04:AMPARAMS\|DCode=(\d+)\|XSize=(.*?)mil\|YSize=(.*?)mil\|CornerRadius=(.*?)mil\|.*?Rotation=(.*?)\|', data):
        w, h, r, angle = float(x)*.0254, float(y)*.0254, float(radius)*.0254, float(rotation)
        metadata[int(code)] = (w, h, r, angle)
    apertures = {}
    for code, shape, params in re.findall(r'%ADD(\d+)([A-Z][A-Z0-9]*)(?:,([^%]*?))?\*%', data):
        values = [float(v)*25.4 for v in params.split('X')] if params else []
        if shape == 'C':
            apertures[int(code)] = ('circle', values[0], values[0], values[0]/2, 0)
        elif shape in ('R', 'O'):
            apertures[int(code)] = ('rect', values[0], values[1], min(values)/2 if shape == 'O' else 0, 0)
        elif int(code) in metadata:
            apertures[int(code)] = ('rect', *metadata[int(code)])
        else:
            raise ValueError(f'Unsupported aperture {code}/{shape}')
    data = re.sub(r'%AM.*?%', '', data)
    data = re.sub(r'%([^%]*)%', lambda m: m[0] if m[1].startswith('LP') else '', data)
    tokens = re.findall(r'%LP[DC]\*%|[^*%]+\*', data)
    x = y = 0
    code = None
    region = False
    paths, contour, output = [], [], []
    polarity = 'white'
    for token in tokens:
        token = token.strip('*')
        if token.startswith('G04') or token in ('G70', 'G71', 'G01', 'G75', 'M02'):
            continue
        if token.startswith('%LP'):
            polarity = 'black' if 'LPC' in token else 'white'
            continue
        if token == 'G36':
            region = True;paths = [];contour = []
            continue
        if token == 'G37':
            if contour: paths.append(' '.join(contour)+' Z')
            if paths: output.append(f'<path fill="{polarity}" fill-rule="evenodd" d="{" ".join(paths)}"/>')
            region = False;contour = []
            continue
        command = re.search(r'D0*(\d+)', token)
        if command and int(command[1]) >= 10:
            code = int(command[1]);continue
        if not command: continue
        action = int(command[1])
        old_x, old_y = x, y
        mx, my = re.search(r'X(-?\d+)', token), re.search(r'Y(-?\d+)', token)
        if mx: x = int(mx[1])*UNIT
        if my: y = int(my[1])*UNIT
        if action == 2:
            if region:
                if contour: paths.append(' '.join(contour)+' Z')
                contour = [f'M{n(x)} {n(y)}']
        elif action == 1:
            if region:
                contour.append(f'L{n(x)} {n(y)}')
            else:
                width = apertures[code][1]
                output.append(f'<path fill="none" stroke="{polarity}" stroke-width="{n(width)}" stroke-linecap="round" d="M{n(old_x)} {n(old_y)}L{n(x)} {n(y)}"/>')
        elif action == 3:
            shape, w, h, radius, angle = apertures[code]
            if shape == 'circle':
                output.append(f'<circle fill="{polarity}" cx="{n(x)}" cy="{n(y)}" r="{n(w/2)}"/>')
            else:
                output.append(f'<rect fill="{polarity}" x="{n(x-w/2)}" y="{n(y-h/2)}" width="{n(w)}" height="{n(h)}" rx="{n(radius)}" transform="rotate({n(angle)} {n(x)} {n(y)})"/>')
    return ''.join(output)


def main():
    source = Path(sys.argv[1])
    with zipfile.ZipFile(source) as archive:
        rendered = {name: layer(archive.read('PCB2.'+name).decode('ascii')) for name in ('GTL','GTS','GTO')}
    flip = f'translate(0 {HEIGHT}) scale(1 -1)'
    masks = ''.join(f'<mask id="{name}" maskUnits="userSpaceOnUse" x="0" y="0" width="{WIDTH}" height="{HEIGHT}" style="mask-type:luminance"><g transform="{flip}">{content}</g></mask>' for name, content in rendered.items())
    # A face-on illustration, at nominal 36.4 x 26.3 mm; keep the Gerber artwork
    # in its native coordinate system and scale the complete board uniformly.
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}">
<title>astraCore original top copper, exposed pads and silkscreen</title>
<desc>Derived from PCB2.zip SHA-256 {hashlib.sha256(source.read_bytes()).hexdigest()}. Original manufacturing files are not embedded.</desc>
<defs>{masks}</defs>
<rect width="{WIDTH}" height="{HEIGHT}" fill="#265843" mask="url(#GTL)" opacity=".5"/>
<g mask="url(#GTS)"><rect width="{WIDTH}" height="{HEIGHT}" fill="#d3be83" mask="url(#GTL)"/></g>
<rect width="{WIDTH}" height="{HEIGHT}" fill="#e8ebd7" mask="url(#GTO)"/>
</svg>'''
    output = ROOT / 'assets/simulator/astra-core-artwork.svg'
    output.write_text(svg, encoding='utf-8')
    # Separate review render keeps the geometry visible without the screen/parts.
    print(f'{output.name}: {len(svg.encode())} bytes; Gerber outline {WIDTH} x {HEIGHT} mm')


if __name__ == '__main__':
    main()
