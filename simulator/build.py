"""Build the two original Astra engines as bounded WebAssembly reactors.

Usage: python simulator/build.py --sdk PATH_TO_WASI_SDK
Requires WASI SDK 27, no Emscripten, Node packages, or network at build time.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / 'simulator'
PUBLIC = ROOT / 'assets/simulator'
C_FILES = '''u8g2_setup.c u8g2_d_setup.c u8g2_d_memory.c u8g2_buffer.c
u8g2_hvline.c u8g2_ll_hvline.c u8g2_box.c u8g2_circle.c u8g2_bitmap.c
u8g2_line.c u8g2_font.c u8g2_intersection.c u8g2_font_myfont.c
u8x8_setup.c u8x8_8x8.c u8x8_string.c u8x8_display.c u8x8_cad.c u8x8_byte.c
u8x8_d_ssd1306_128x64_noname.c u8x8_gpio.c u8x8_message.c u8g2_message.c'''.split()
EXPORTS = ['sim_init', 'sim_step', 'sim_input', 'sim_buffer', 'sim_selected', 'sim_flags', 'sim_label']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', required=True, type=Path)
    args = parser.parse_args()
    sdk = args.sdk.resolve()
    suffix = '.exe' if os.name == 'nt' else ''
    cc = str(sdk / ('bin/clang' + suffix))
    cxx = str(sdk / ('bin/clang++' + suffix))
    work = ROOT / '.research/ui-simulator/build'
    work.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for engine in ('modern', 'lite'):
        directory = work / engine
        directory.mkdir(exist_ok=True)
        vendor = HERE / 'vendor' / engine / 'Core/Src'
        graphics = vendor / ('hal/hal_dreamCore/components/oled/graph_lib/u8g2' if engine == 'modern' else 'u8g2')
        c_files = [graphics / filename for filename in C_FILES]
        if engine == 'lite':
            c_files.extend((vendor / 'astra-ui-lite').glob('*.c'))
        # Only hardware-facing draw-driver.c is replaced; the UI C sources remain intact.
        c_files = [file for file in c_files if file.name != 'astra_ui_draw_driver.c']
        includes = ['-I' + str(HERE / 'port'), '-I' + str(vendor), '-I' + str(graphics)]
        common = ['--sysroot=' + str(sdk / 'share/wasi-sysroot'), '-target', 'wasm32-wasi', '-Os', '-flto', '-fvisibility=hidden', *includes]
        subprocess.run([cc, *common, '-c', *map(str, c_files)], cwd=directory, env=env, check=True)
        sources = [HERE / 'port' / ('modern.cpp' if engine == 'modern' else 'lite.c')]
        if engine == 'modern':
            sources += [vendor / 'hal/hal.cpp', vendor / 'astra/ui/launcher.cpp']
            sources += sorted((vendor / 'astra/ui/item').glob('*/*.cpp'))
        objects = [directory / (file.stem + '.o') for file in c_files]
        output = PUBLIC / (engine + '.wasm')
        link = [cxx if engine == 'modern' else cc, *common]
        if engine == 'modern':
            link += ['-std=c++17', '-fno-exceptions']
        link += ['-mexec-model=reactor', '-Wl,--initial-memory=2097152', '-Wl,--max-memory=2097152',
                 '-Wl,-z,stack-size=262144', '-Wl,--strip-all']
        link += ['-Wl,--export=' + name for name in EXPORTS]
        link += [*map(str, sources), *map(str, objects), '-o', str(output)]
        subprocess.run(link, cwd=directory, env=env, check=True)
        data = output.read_bytes()
        manifest[engine] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        print(engine, len(data), 'bytes', flush=True)
    (PUBLIC / 'engines.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    # Corresponding source, both original licenses, adapters, and build command.
    with zipfile.ZipFile(PUBLIC / 'source.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(HERE.rglob('*')):
            if file.is_file() and '__pycache__' not in file.parts:
                archive.write(file, file.relative_to(ROOT))
        for name in ('oled-playground.js', 'oled-clock.js', 'oled-grid.js', 'oled-keys.js', 'oled-stage.js', 'oled-playground.css'):
            archive.write(ROOT / name, name)
        archive.write(PUBLIC / 'astra-core-artwork.svg', 'assets/simulator/astra-core-artwork.svg')
        archive.write(PUBLIC / 'astra-core-back.svg', 'assets/simulator/astra-core-back.svg')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
