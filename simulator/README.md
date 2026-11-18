# WoooLAB OLED playground

This runs the actual C++ astra UI and C astra UI Lite engines from the owner's
repositories in two separate WebAssembly instances. It does not emulate an STM32.
The upstream menu, selector, camera, widget, animation, u8g2 rendering and embedded
bitmap-font implementations are preserved. Two missing bool returns in Selector are defined
for WebAssembly safety; the exact patch is recorded in upstream.json. `upstream.json` pins source commits and
SHA-256 hashes. `vendor/` includes only build inputs and original licenses.

`port/modern.cpp` implements Astra's HAL on top of its bundled u8g2 renderer.
`port/lite.c` substitutes the SPI/timer driver and registers a small demo with the
original Lite menu, switch, slider and custom-page APIs. Two browser switches match
the physical assembly: tap the upper/near-screen switch for previous, or hold it
for back; tap the lower/far-screen switch for next, or hold it for enter. A hold
fires once at 600 ms and never sends a short action on release. Dragging away,
touch scrolling, focus loss and engine changes cancel an unfinished hold.
The focused switches also accept short/held Enter or Space. Board keyboard
shortcuts remain Up/Down, Enter and Escape, without requiring a hold.
Demonstration content is supplied by these adapters. Hardware-only effects and
serial/ADC peripherals are not simulated. No UI engine is rewritten in JavaScript.

Build (WASI SDK 27, includes Clang, WASI libc and libc++):

```
python simulator/build.py --sdk /path/to/wasi-sdk-27.0
```

Each engine has a fixed 2 MiB linear-memory ceiling, with no threads or filesystem.
The website lazily fetches an engine only when the playground enters view, creates
at most one instance of each, and stops stepping at rest, out of view, on blur or
in a hidden tab. Reset replaces an instance rather than allocating more menus
inside it. Fonts are the bitmap arrays in the original source, embedded in WASM.

`oled-clock.js` advances Astra at 240 bounded native steps per active second and
Lite at its own slower 60-step cadence. Rendering follows every browser animation frame, with no
15 ms frame gate, so 90/144 Hz displays do not lose alternating refreshes. At most
50 ms is caught up after a stall; hidden/offscreen clocks reset instead of queuing
work. The original easing constants are unchanged. The display uploads one 128 x 64
RGBA image when pixels change, with contiguous white pixels and a true black
background. No oversized backing canvas, per-dot grid or repeated cell drawing.

`oled-grid.js` fits an integer physical-pixel pitch and aligns the canvas origin
to physical pixels, including fractional desktop DPI and visual-viewport zoom.
This prevents equal-width native dots alternating between two raster widths as
they move. The complete board scales with the physical OLED pitch, preserving the
specified glass, active area and component proportions. Narrow phones may use
their page gutters without overflowing the viewport. Alignment updates only
on layout/viewport events or input; it does not add a permanent animation loop.
`oled-keys.js` handles the two switches and cancels stale long-press timers.

Core geometry now follows the owner's 36.4 x 26.3 x 1.6 mm dimensions and PCB2.zip
Gerbers (SHA-256 `8f2e136c6b2273ba45af0111d49039294fb7601aeac861d96c80da7f13c113bc`).
The native Gerber outline is 36.449 x 26.289 mm, scaled to those nominal dimensions.
`tools/gerber_artwork.py ZIP_PATH` exports the original top copper, mask and
silkscreen as `assets/simulator/astra-core-artwork.svg`. Logo/DEBUG text are paths,
so their contours and alignment are preserved without a substituted web font.
The supplied fabrication archive is read only and is not published by the site.

The CH1115 glass is 35.8 x 17.1 mm; the 128 x 64 active area is nominally
29.42 x 14.7 mm (14.71 mm is used to retain the exact 2:1 logical pixel ratio).
Three SH1.0 4P side-entry shells follow the 6 x 4.25 mm shape in
[JST's drawing](https://www.jst-mfg.com/product/pdf/eng/eSH.pdf), positioned at the
Gerber's connector pad centers x=3.556, 10.160 and 16.764 mm. The 5 x 5 mm
MLT-5020 case is centered at (23.622,22.9868) mm; the two switches are centered at
(30.099,21.336) and (30.099,24.384) mm, measured from the top left. Their caps are
3 x 2.5 mm with 2 mm black plungers, matching the two-terminal turtle-switch style.
Other pads, LEDs and tooling holes follow the same coordinate system. The carrier,
protective film and peel tab are omitted. All artwork is static CSS/SVG with no
bitmap textures or filters over the active screen.

`port/modern-boot.h` cooperatively renders the original star/title logo from
`astra/astra_logo.cpp` and the `drawLogo(1000)` call in `astra_rocket.cpp`.
The MCU's blocking loop is split across browser steps; its Cascadia bitmap font,
star shapes, positions/targets and exponential movement are retained, with elapsed
time replacing the blocking loop counter. Boot runs on first load and Reset;
input may skip it, and reduced-motion mode settles it without displaying motion.
All three demo home icons use dark cut-outs in the original white tile field.

`port/lite-about.h` re-enables the staged copyright callbacks commented out in
astraLauncher's original `Core/Src/main.c`: title, credit, miniature board, screen
flashes and wires enter at the original 300...2400 ms offsets. It uses the supplied
photo's v1.0 wording, with complete right-aligned version numbers and slightly
tighter word spaces to fit 128 pixels. The final card rests after its finite
entry; repeated entry resets its state. The two missing characters in the supplied
font subset are embedded from the repository's original WenQuanYi BDF. Attribution
and the font-embedding license exception remain in `port/copyright-extra.bdf`;
`python simulator/tools/copyright_glyphs.py` regenerates their 12 px bitmaps.
The original unmodified animation/demo sources are also pinned in `upstream.json`.

The downloadable `assets/simulator/source.zip` contains the complete corresponding
source, browser loader, board stylesheet and build script. Both Astra projects retain their GPL-3.0 licenses;
u8g2's BSD notices remain in its source files. The browser adapter and demonstration
code in this directory are also distributed under GPL-3.0-or-later.
