"""Bundle the site's Latin and symbol faces from the owner's font directory.

Requires fonttools[woff]. Run: python scripts/prepare-latin-fonts.py FONT_DIRECTORY
"""

import argparse
import hashlib
import html
import io
import json
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parent.parent
CJK_RANGES = [(0x2E80, 0x9FFF), (0xF900, 0xFAFF), (0xFE10, 0xFE1F),
              (0xFE30, 0xFE4F), (0xFF00, 0xFFEF), (0x20000, 0x323AF)]
SOURCES = {
    "serif": ("WoooLAB Serif", ["times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"]),
    "mono": ("WoooLAB Mono", ["consola.ttf", "consolab.ttf", "consolai.ttf", "consolaz.ttf"]),
    "sans": ("WoooLAB Sans", ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"]),
    "symbols": ("WoooLAB Symbols", ["seguisym.ttf"]),
}
STYLES = ["regular", "bold", "italic", "bold-italic"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_directory", type=Path)
    args = parser.parse_args()
    sources = {p for pattern in ("*.html", "*.css", "*.js") for p in ROOT.glob(pattern)}
    sources.add(ROOT / "scripts/build.mjs")
    characters = set(range(0x20, 0x7F))
    for path in sources:
        content = path.read_text(encoding="utf-8")
        if path.suffix == ".html":
            content = html.unescape(content)
        characters.update(ord(char) for char in content if ord(char) >= 0x20
                          and not any(first <= ord(char) <= last for first, last in CJK_RANGES))
    output = ROOT / "assets/fonts"
    output.mkdir(parents=True, exist_ok=True)
    rules = ["/* Generated self-hosted Latin and symbol fonts; no local() sources. */"]
    faces = []
    covered = set()
    for slug, (family, filenames) in SOURCES.items():
        for filename, style in zip(filenames, STYLES):
            source = args.source_directory / filename
            font = TTFont(source, recalcTimestamp=False)
            available = set(font.getBestCmap())
            wanted = characters & available
            if slug == "symbols":
                wanted = {code for code in wanted if code > 0x7F}
            covered.update(wanted)
            options = subset.Options()
            options.layout_features = ["*"]
            options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 16, 17]
            options.name_legacy = True
            options.name_languages = ["*"]
            options.drop_tables += ["meta", "MERG"]
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(unicodes=wanted)
            subsetter.subset(font)
            label = style.replace("-", " ").title()
            postscript = family.replace(" ", "") + "-" + label.replace(" ", "")
            names = {1: family, 2: label, 3: postscript, 4: f"{family} {label}",
                     6: postscript, 16: family, 17: label}
            for key, value in names.items():
                font["name"].removeNames(nameID=key)
                for platform, encoding, language in [(3, 1, 0x409), (1, 0, 0)]:
                    font["name"].setName(value, key, platform, encoding, language)
            font.flavor = "woff2"
            buffer = io.BytesIO()
            font.save(buffer)
            font.close()
            data = buffer.getvalue()
            digest = hashlib.sha256(data).hexdigest()
            webfile = f"{slug}-{style}.{digest[:12]}.woff2"
            (output / webfile).write_bytes(data)
            faces.append({"file": webfile, "family": family, "style": style,
                          "characters": "".join(map(chr, sorted(wanted))), "bytes": len(data),
                          "sha256": digest, "source": filename,
                          "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
            css_style = "italic" if "italic" in style else "normal"
            css_weight = "100 900" if slug == "symbols" else "600 900" if "bold" in style else "100 500"
            rules.append(f'''@font-face {{
  font-family: "{family}";
  src: url("{webfile}") format("woff2");
  font-style: {css_style};
  font-weight: {css_weight};
  font-display: swap;
}}''')
    if characters - covered:
        raise ValueError(f"Font sources lack characters: {''.join(map(chr, sorted(characters - covered)))}")
    (output / "latin.css").write_text("\n".join(rules) + "\n", encoding="utf-8")
    manifest = {"characters": "".join(map(chr, sorted(characters))), "faces": faces}
    (output / "latin-coverage.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    current = {face["file"] for face in faces}
    for candidate in output.glob("*.woff2"):
        if re.fullmatch(r"(serif|mono|sans|symbols)-(regular|bold|italic|bold-italic)\.[0-9a-f]{12}\.woff2", candidate.name) and candidate.name not in current:
            candidate.unlink()
    print(json.dumps({"faces": len(faces), "characters": len(characters),
                      "total_bytes": sum(face["bytes"] for face in faces)}))


if __name__ == "__main__":
    main()
