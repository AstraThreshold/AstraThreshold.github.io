# astraCore board geometry

`placements.json` records one populated board. It uses the Altium pick-and-place
centres checked against the SMT BOM and the solder paste Gerbers. The rear is
specified as seen from the rear, so its X positions are mirrored from the Altium
coordinates. The glass and buzzer use their physical housing offsets. Test
points and exposed pads are supplied by the Gerber artwork.

78 of the 98 placed components reuse 14 STEP models by the KiCad library
contributors. `sources.json` lists the original download URLs and SHA-256 hashes.
The web mesh uses triangulated copies with placement, material colors and a few
envelope adjustments. The UFQFPN uses the 0.55 mm height in the
[STM32F411 datasheet](https://www.st.com/resource/en/datasheet/stm32f411ce.pdf).
The Winbond SOIC body was widened to the installed package while retaining the
1.27 mm lead pitch. Q1 and U5 use the rear paste openings to align their asymmetric
pin rows. The back switches and mezzanine plugs use solid geometry based on the
[KHON TSE05410 drawing](https://www.khon-switch.com/upload/1c/202404/TSE05410.pdf)
and [XKB X0812WVS-12AS-9TV01 drawing](https://www.lcsc.com/datasheet/C21261690.pdf)
and the assembled board photo. The SH sockets, front tact switches, buzzer and
inductor also use solid approximations from the supplied photos and footprints.

The LED models use the assembled BOM packages:
[SZYY0402R](https://www.lcsc.com/datasheet/C434445.pdf),
[KT-0603R](https://www.lcsc.com/datasheet/C2286.pdf),
[KT-0805G](https://www.rcscomponents.kiev.ua/datasheets/KT-0805-G.pdf) and
[WS2812B-2020](https://www.lcsc.com/datasheet/C965555.pdf). The models include
raised clear resin, exposed terminations and individual dies. The discrete dies
and their resin scatter light in the powered simulation.

The installed 1.29-inch panel has a 35.8 × 17.1 × 1.22 mm outline and a
29.42 × 14.70 mm active area. Its 16 solder contacts are on 0.70 mm centers.
The inset and the driver-side mask are estimated from the front photo.
The polarizer and folded flex use the physical panel outline and U3 paste
pattern. The supplied 0.77-inch CAD illustration describes a 15-contact variant
and serves as a stack-up reference.

`solder.json` records the occupied paste openings from the front and rear Gerber
layers. Each entry stores the center and dimensions in face-view millimeters
and the direction of the termination (`±1` for X, `±2` for Y). The mesh adds a
silver fillet at each aperture, including the OLED contacts beneath the glass.
Exposed test pads are represented by the artwork.

The KiCad-derived geometry is credited to the KiCad library contributors and is
available under [CC BY-SA 4.0 with the KiCad library exception](KICAD-LICENSE.md).
The tessellation and assembly script uses the same GPL terms as the browser port.

Download the STEP files in `sources.json` to a local model folder as `<key>.step`.
Then run `python simulator/tools/core_mesh.py MODEL_FOLDER` with OCP 7.8 installed.
The checked-in indexed mesh is used directly by the site build.
