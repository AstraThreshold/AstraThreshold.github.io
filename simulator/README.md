# WoooLAB OLED playground

This runs the actual C++ astra UI and C astra UI Lite engines from the owner's
repositories in two separate WebAssembly instances. It does not emulate an STM32.
The upstream menu, selector, camera, widget, animation, u8g2 rendering and embedded
bitmap-font implementations are preserved. Two missing bool returns in Selector are defined
for WebAssembly safety; the exact patch is recorded in upstream.json. `upstream.json` pins source commits and
SHA-256 hashes. `vendor/` includes only build inputs and original licenses.

`port/modern.cpp` implements Astra's HAL on top of its bundled u8g2 renderer.
`port/lite.c` substitutes the SPI/timer driver and registers a small demo with the
original Lite menu, switch, slider and custom-page APIs. The four browser buttons
map to previous / next / back / enter, avoiding long-press-only controls.
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

The downloadable `assets/simulator/source.zip` contains the complete corresponding
source, browser loader, board stylesheet and build script. Both Astra projects retain their GPL-3.0 licenses;
u8g2's BSD notices remain in its source files. The browser adapter and demonstration
code in this directory are also distributed under GPL-3.0-or-later.
