# astraCore board geometry

`placements.json` records one populated board. It uses the Altium pick-and-place
centres checked against the SMT BOM and the solder paste Gerbers. The rear is
specified as seen from the rear, so its X positions are mirrored from the Altium
coordinates. The glass and buzzer use their physical housing offsets. Test
points and exposed pads are supplied by the Gerber artwork.

85 of the 98 placed components reuse 18 STEP models by the KiCad library
contributors. `sources.json` lists the original download URLs and SHA-256 hashes.
The web mesh uses triangulated copies with placement, material colors and a few
envelope adjustments. The UFQFPN uses the 0.55 mm height in the
[STM32F411 datasheet](https://www.st.com/resource/en/datasheet/stm32f411ce.pdf).
The Winbond SOIC body was widened to the installed package while retaining the
1.27 mm lead pitch. The back switches use the KiCad side-actuated package with
an amber insert based on the board photo. The OLED stack, SH sockets, front
tact switches, buzzer, rear mezzanine connectors, RGB LEDs, and inductor are
assembled from solid geometry using the supplied photos and footprints. Those
parts are visual approximations where a matching 3D package was unavailable.

The KiCad-derived geometry is credited to the KiCad library contributors and is
available under [CC BY-SA 4.0 with the KiCad library exception](KICAD-LICENSE.md).
The tessellation and assembly script uses the same GPL terms as the browser port.

Download the STEP files in `sources.json` to a local model folder as `<key>.step`.
Then run `python simulator/tools/core_mesh.py MODEL_FOLDER` with OCP 7.8 installed.
The checked-in indexed mesh is used directly by the site build.
