The three PingFang font collections were supplied by the website owner. The
original files use Windows system-font aliases: `msyhl.ttc` (300), `msyh.ttc`
(400), and `msyhbd.ttc` (600). The owner confirmed that these are PingFang glyphs
prepared for their Windows font replacement.

`scripts/prepare-pingfang.py` extracts the first face, retains the source
copyright and license metadata, subsets the site's CJK characters, assigns a
distinct web family name, and produces WOFF2 files. Original collections are
not stored in this repository or the public build. `coverage.json` records
source hashes and the embedded characters; the build checks for missing glyphs.

The stylesheet limits this family to CJK Unicode ranges, so Latin text continues
to use the existing Times/Consolas/Arial stacks. The 600 face also serves the
site's heavier headings without synthesizing an extra bold font. The light face
is bundled but only downloaded if a light weight is used.

Project titles use the owner's local `CascadiaCodeItalic.ttf` from their
`cascadia-code-with-cursive-italic-main` font folder (source SHA256:
`d12c22ccda54dd699e0ab551c5220d5f2e42f4210f6c102a87369c5bd9109474`).
This variant already maps f/l/r/s to the cursive alternate glyphs by default.
`scripts/prepare-cascadia.py` creates a static 600-weight ASCII WOFF2 subset,
retaining those glyphs, and renames the modified font to `WoooLAB Project Cursive`.
Its source copyright/license metadata is retained, and `CASCADIA-LICENSE.txt`
is included in the public build. The license and italic/cursive feature details
are documented in the [official Cascadia Code repository](https://github.com/microsoft/cascadia-code).
