"""Build the project-title webfont: python scripts/prepare-cascadia.py FONT.ttf.

Requires fonttools[woff]. Accepts cursive defaults or the italic ss01 feature.
"""

import argparse
import hashlib
import io
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    font = TTFont(args.source, recalcTimestamp=False)
    cursive_defaults = all(font.getBestCmap().get(ord(char)) == f"{char}.salt" for char in "flrs")
    if "fvar" in font:
        instantiateVariableFont(font, {"wght": 600}, inplace=True)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 16, 17]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=range(0x20, 0x7F))
    subsetter.subset(font)
    features = {record.FeatureTag for record in font["GSUB"].table.FeatureList.FeatureRecord}
    if not cursive_defaults and "ss01" not in features:
        raise ValueError("The source does not preserve the cursive ss01 feature.")
    if cursive_defaults and not all(font.getBestCmap().get(ord(char)) == f"{char}.salt" for char in "flrs"):
        raise ValueError("The subset lost a default cursive glyph.")
    # The modified subset uses its own family; the original license is retained.
    family = "WoooLAB Project Cursive"
    postscript = "WoooLABProjectCursive-SemiboldItalic"
    names = {1: family, 2: "Italic", 3: postscript, 4: f"{family} Semibold Italic",
             6: postscript, 16: family, 17: "Semibold Italic"}
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
    filename = f"cascadia-cursive-semibold.{digest[:12]}.woff2"
    output = Path(__file__).resolve().parent.parent / "assets/fonts"
    (output / filename).write_bytes(data)
    mode = "default cursive glyphs" if cursive_defaults else "ss01 feature"
    print(f"{filename}: {len(data)} bytes; {mode} retained; source SHA256 {hashlib.sha256(args.source.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
