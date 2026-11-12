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
