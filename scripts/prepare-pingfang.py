"""Create the site's CJK webfonts from the owner's supplied PingFang TTC files.

Requires fonttools[woff]. Run: python scripts/prepare-pingfang.py SOURCE_DIRECTORY
The original font collection and its Windows font aliases are never published.
"""

import argparse
import hashlib
import io
import json
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parent.parent
FAMILY = "WoooLAB PingFang SC"
RANGES = [(0x2E80, 0x9FFF), (0xF900, 0xFAFF), (0xFE10, 0xFE1F),
          (0xFE30, 0xFE4F), (0xFF00, 0xFFEF), (0x20000, 0x323AF)]
UNICODE_RANGE = ", ".join(f"U+{first:X}-{last:X}" for first, last in RANGES)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_directory", type=Path)
    args = parser.parse_args()
    sources = sorted({p for pattern in ("*.html", "*.css", "*.js")
                      for p in ROOT.glob(pattern)} | {ROOT / "scripts/build.mjs"})
    characters = sorted({ord(char) for path in sources for char in path.read_text(encoding="utf-8")
                         if any(first <= ord(char) <= last for first, last in RANGES)})
    output = ROOT / "assets/fonts"
    output.mkdir(parents=True, exist_ok=True)
    faces = []
    rules = ["/* Generated from the owner's supplied PingFang fonts; CJK glyphs only. */"]

    for source_name, style, weight, css_weight in [
        ("msyhl.ttc", "Light", 300, "300"),
        ("msyh.ttc", "Regular", 400, "400 500"),
        ("msyhbd.ttc", "Semibold", 600, "600 900"),
    ]:
        source = args.source_directory / source_name
        font = TTFont(source, fontNumber=0, recalcTimestamp=False)
        if font["OS/2"].usWeightClass != weight:
            raise ValueError(f"Unexpected source weight: {source_name}")
        missing = set(characters) - font.getBestCmap().keys()
        if missing:
            raise ValueError(f"Source font lacks characters: {''.join(map(chr, sorted(missing)))}")
        options = subset.Options()
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 16, 17]
        options.name_legacy = True
        options.name_languages = ["*"]
        options.drop_tables += ["meta"]
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=characters)
        subsetter.subset(font)

        # Distinguish these web copies from the originals' Windows system aliases.
        postscript = f"WoooLABPingFangSC-{style}"
        names = {1: FAMILY, 2: style, 3: postscript, 4: f"{FAMILY} {style}",
                 6: postscript, 16: FAMILY, 17: style}
        for key, value in names.items():
            font["name"].removeNames(nameID=key)
            for platform, encoding, language in [(3, 1, 0x409), (1, 0, 0)]:
                font["name"].setName(value, key, platform, encoding, language)
        font["head"].macStyle &= ~3
        font["OS/2"].fsSelection &= ~(1 | 32 | 64)
        if weight == 400:
            font["OS/2"].fsSelection |= 64
        font.flavor = "woff2"
        buffer = io.BytesIO()
        font.save(buffer)
        font.close()
        data = buffer.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        filename = f"pingfang-sc-{style.lower()}.{digest[:12]}.woff2"
        (output / filename).write_bytes(data)
        faces.append({"file": filename, "weight": weight, "bytes": len(data),
                      "sha256": digest, "source": source_name,
                      "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
        rules.append(f'''@font-face {{
  font-family: "{FAMILY}";
  src: url("{filename}") format("woff2");
  font-style: normal;
  font-weight: {css_weight};
  font-display: swap;
  unicode-range: {UNICODE_RANGE};
}}''')
    (output / "pingfang.css").write_text("\n".join(rules) + "\n", encoding="utf-8")
    manifest = {"family": FAMILY, "characters": "".join(map(chr, characters)), "faces": faces}
    (output / "coverage.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    current_files = {face["file"] for face in faces}
    for candidate in output.glob("pingfang-sc-*.woff2"):
        if re.fullmatch(r"pingfang-sc-(light|regular|semibold)\.[0-9a-f]{12}\.woff2", candidate.name) and candidate.name not in current_files:
            candidate.unlink()
    print(json.dumps({"characters": len(characters), "total_bytes": sum(f["bytes"] for f in faces),
                      "faces": faces}, ensure_ascii=False))


if __name__ == "__main__":
    main()
