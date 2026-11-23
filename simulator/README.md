# WoooLAB OLED playground

This runs the actual C++ astra UI and C astra UI Lite engines from the owner's
repositories in two separate WebAssembly instances. It does not emulate an STM32.
The upstream menus, selectors, camera, widgets and u8g2 graphics use their
embedded bitmap fonts. `upstream.json` pins the source commits and hashes and
records the WebAssembly patches, including the Lite easing adjustment.
`vendor/` includes the build inputs and their original licenses.

`port/modern.cpp` implements Astra's HAL on top of its bundled u8g2 renderer.
`port/lite.c` substitutes the SPI/timer driver and registers a small demo with the
original Lite menu, switch, slider and custom-page APIs. Two browser switches match
the physical assembly: tap the upper/near-screen switch for previous, or hold it
for back; tap the lower/far-screen switch for next, or hold it for enter. A hold
fires once at 600 ms and never sends a short action on release. Dragging away,
touch scrolling, focus loss and engine changes cancel an unfinished hold.
The focused switches also accept short/held Enter or Space. Board keyboard
shortcuts remain Up/Down, Enter and Escape, without requiring a hold.
The board and its decorative image are non-selectable and non-draggable, avoiding
the browser's dark image-selection overlay during pointer/keyboard operation.
The board sits in the profile column. After a short entrance it rotates under
the overhead light in a glass cabinet.
The standby display cues power
and drag gestures. After boot, a brief light shows the two keys and a ring
shows progress during a long press. The selector below the board switches
between Astra UI and Lite. The 3D presentation uses a perspective camera and a
depth-tested assembly mesh.
Both faces have component bodies, leads and solder joints on a 1.6 mm substrate.
An overhead light shades the parts. The front LEDs emit from their package
lenses and cast colored light on nearby surfaces. The renderer samples the live
OLED texture directly on the glass. See
[board model sources](models/README.md) for placement and package details.

Click the board or choose a different UI to bring it forward and turn it to
the front over 980 ms while the cabinet fades. Power starts 230 ms into that
turn. Each power-up starts a fresh instance of the selected
engine. Astra UI replays its original boot before unlocking the keys. Lite
animates its selector into the first row as the turn nears the front. Dragging
the powered board turns it off and fades its last OLED frame. It shrinks back
into the cabinet on release, on a click outside the board area, or after 18
seconds without interaction.
If an engine fails to load, tap the board to retry.
Keyboard focus and held keys keep the front view available. Reduced-motion
mode settles immediately.
The orbit and LED animation pause offscreen, in hidden tabs and on blur.
The mesh redraws during motion, display updates, power fading, heartbeat
pulses, resizing or key presses. Subsequent power-ups reuse the compiled module.
Demonstration content is supplied by these adapters. Hardware-only effects and
serial/ADC peripherals are not simulated. No UI engine is rewritten in JavaScript.

Build (WASI SDK 27, includes Clang, WASI libc and libc++):

```
python simulator/build.py --sdk /path/to/wasi-sdk-27.0
```

Each engine has a fixed 2 MiB linear-memory ceiling, with no threads or filesystem.
The website retains the active instance while powered and stops stepping at
rest, out of view, on blur or in a hidden tab. Fonts are the bitmap
arrays in the original source, embedded in WASM.

`oled-clock.js` advances Astra at 240 bounded native steps per active second
and Lite at 120. Each pair of Lite steps matches the easing of one original
60 Hz update. The port keeps the time-based widgets and hourglass duration.
The browser presents the latest frame at its display cadence. The clock
catches up at most 50 ms after a stall and resets when paused. The renderer
uploads a 128 x 64 image when the native pixels change and filters it to the
available screen resolution. The 2D canvas provides the WebGL fallback.

`oled-grid.js` fits the assembled board and its camera to the profile slot.
The physical glass, active area and component proportions scale together.
`oled-keys.js` handles the two switches and cancels stale long-press timers.

Core geometry now follows the owner's 36.4 x 26.3 x 1.6 mm dimensions and PCB2.zip
Gerbers (SHA-256 `8f2e136c6b2273ba45af0111d49039294fb7601aeac861d96c80da7f13c113bc`).
The native Gerber outline is 36.449 x 26.289 mm, scaled to those nominal dimensions.
`tools/gerber_artwork.py ZIP_PATH` exports the original top and bottom copper,
mask and silkscreen as `assets/simulator/astra-core-artwork.svg` and
`astra-core-back.svg`. Logo/DEBUG text are paths,
so their contours and alignment are preserved without a substituted web font.
The supplied fabrication archive is read only and is not published by the site.

The CH1115 glass is 35.8 x 17.1 mm; the 128 x 64 active area is nominally
29.42 x 14.7 mm (14.71 mm is used to retain the exact 2:1 logical pixel ratio).
Its placement and fine outer boundary follow the owner's product photograph:
the left driver/bonding margin is wider than the right glass margin. The local
4.6 mm left inset is a visual estimate from that photograph, not a drawing datum.
Three SH1.0 4P side-entry shells follow the 6 x 4.25 mm shape in
[JST's drawing](https://www.jst-mfg.com/product/pdf/eng/eSH.pdf), positioned at the
Gerber's connector pad centers x=3.556, 10.160 and 16.764 mm. The 5 x 5 mm
MLT-5020 case is centered at (23.622,22.9868) mm; the two switches are centered at
(30.099,21.336) and (30.099,24.384) mm, measured from the top left. Their caps are
3 x 2.5 mm with 1.7 mm black plungers, matching the two-terminal turtle-switch style.
Other pads, LEDs and tooling holes follow the same coordinate system. The
Gerber-derived texture is applied to the substrate. The native pixel surface
has its own plane at the glass height.

The upper LED gives a short double heartbeat every 1.6 seconds, controlled by the
native Status LED switch. Only its luminous center changes opacity; solder ends
stay fixed. This CSS animation is independent of the native screen clock, so the
display still stops at rest. It stops out of view, on blur or in a hidden tab;
reduced-motion mode uses a steady light.
All three LEDs have brighter cores and soft local halos. A static screen surround
and a faint foreground gradient spread a thin mist over the board without
blurring the native pixels or adding another canvas, filter, or animation loop.

`port/modern-boot.h` cooperatively renders the original star/title logo from
`astra/astra_logo.cpp` and the `drawLogo(1000)` call in `astra_rocket.cpp`.
The MCU's blocking loop is split across browser steps; its Cascadia bitmap font,
star shapes, positions/targets and exponential movement are retained, with elapsed
time replacing the blocking loop counter. Boot runs for every power-on and Reset.
Reduced-motion mode settles to its final frame.
All three demo home icons use dark cut-outs in the original white tile field.
The browser HAL adds one inner diagonal pixel to each of the four small list
selector notches, keeping XOR drawing and the integer raster bounds intact.
The home screen's dotted divider starts and ends within a dash, reaching both
edges of the native 128-pixel display while retaining five-on/three-off spacing.

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
