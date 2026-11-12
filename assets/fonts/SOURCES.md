The three PingFang font collections were supplied by the website owner. The
original files use Windows system-font aliases: `msyhl.ttc` (300), `msyh.ttc`
(400), and `msyhbd.ttc` (600). The owner confirmed that these are PingFang glyphs
prepared for their Windows font replacement.

`scripts/prepare-pingfang.py` extracts the first face, retains the source
copyright and license metadata, subsets the site's CJK characters, assigns a
distinct web family name, and produces WOFF2 files. Original collections are
not stored in this repository or the public build. `coverage.json` records
source hashes and the embedded characters; the build checks for missing glyphs.

The stylesheet limits this family to CJK Unicode ranges. Latin text uses
the bundled Times/Consolas/Arial subsets described below. The 600 face also serves the
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

Latin body text, monospace text, status text, and link symbols are bundled from
the owner's local font files: Times New Roman (`times*.ttf`), Consolas
(`consola*.ttf`), Arial (`arial*.ttf`), and Segoe UI Symbol (`seguisym.ttf`).
`scripts/prepare-latin-fonts.py` preserves their glyph outlines, metrics,
copyright/license metadata, and embedding flags, and gives the web subsets
distinct WoooLAB family names. The Latin families include regular, bold,
italic, and bold italic; the browser only requests faces that are used.
`latin-coverage.json` records source hashes and glyph coverage for build-time
checks. It is not included in the public artifact. These font files retain
their respective source notices; the separate Cascadia license applies only
to the Cascadia derivative.

The standalone social-card SVG uses outlined text with the original glyph
outlines and browser-measured positions; it has no external font dependencies.
