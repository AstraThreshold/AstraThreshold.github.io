# Project image sources

Retrieved 2026-11-10 from AstraThreshold's public project materials. These are photographs of the author's actual hardware and OLED display, not conceptual renders.

| File | Source | Suggested alternative text |
| --- | --- | --- |
| `launcher.webp` | [oled-ui-astra-lite / IMG2.JPG](https://raw.githubusercontent.com/AstraThreshold/oled-ui-astra-lite/main/IMG/IMG2.JPG) | astra Launcher 开发板实物，OLED 显示固件名称与版本信息。 / Physical astra Launcher board with its firmware information on the OLED. |
| `astra-lite.webp` | [oled-ui-astra-lite / IMG1.JPG](https://raw.githubusercontent.com/AstraThreshold/oled-ui-astra-lite/main/IMG/IMG1.JPG) | astra UI Lite 在开发板 OLED 上运行的多级列表菜单。 / astra UI Lite running a list menu on the development board's OLED. |

Images were resized proportionally and encoded to WebP. No content was generated or composited.

No screenshot or photograph was found in the Altium library repository; do not present a generated board or generic screenshot as that project's actual output.

## Public evidence for content

- [astra UI repository](https://github.com/AstraThreshold/oled-ui-astra): C++ OLED UI framework; the [Wiki introduction](https://github.com/AstraThreshold/oled-ui-astra/wiki/astra-UI%E4%BB%8B%E7%BB%8D-%E2%80%90-astra-UI-Introduction) explains list/tile menus, selector and camera concepts, and hardware abstraction. Avoid unqualified claims of support for every display or platform.
- [astra UI Lite](https://github.com/AstraThreshold/oled-ui-astra-lite): pure C, lightweight OLED/LCD UI framework. Current source declares list, switch, slider, user and button items; notifications and animated selector/camera structures are present. Its reference source uses 128×64 display constants, so do not state that every display size is already validated.
- [astra Launcher](https://github.com/AstraThreshold/astra-launcher): STM32 core board equipped with astra UI Lite. Public source includes firmware, `astraLaunchPad.pdf` schematic and `PCB2.zip` board files. Firmware demonstrates settings menus, terminal text, serial DMA receive and ADC acquisition. Do not infer measurement accuracy or hardware protection performance from the code alone.
- [AltiumDesignerLibPkg-dream](https://github.com/AstraThreshold/AltiumDesignerLibPkg-dream): author-maintained Altium Designer 25 library. Repository categories include connectors, MCU, IMU, power, serial/CAN interface components, displays and passives. Do not claim every footprint is production-validated.
- [FSM-key-scan](https://github.com/AstraThreshold/FSM-key-scan): finite-state-machine multi-key scan module with long/short press behavior. README states a long press does not trigger the short-press event.
- [dreamView-2.0](https://github.com/AstraThreshold/dreamView-2.0): public self-built miniature 135 SLR film camera project. Avoid repeating the repository's unverified priority claim ("first on the entire internet"). Public files alone do not establish a finished, tested camera.

GitHub REST snapshot on 2026-11-10: astra UI 2,417 stars / 241 forks; Altium library 1,125 / 103; Launcher 234 / 16; UI Lite 139 / 24. Treat counts as a dated snapshot, not live statistics.

## Video links

- [astra UI project film](https://www.bilibili.com/video/BV1i4421D7nJ/), 2024-07-08. Public page attributes the video to 无理造物WoooLAB and describes the author's C++ UI framework and accompanying porting documentation.
- [astra Launcher project film](https://www.bilibili.com/video/BV1YSJPzPEps/), 2025-05-18. Public page attributes the video to 无理造物WoooLAB and describes the board as an open-source STM32 project.
- [Earlier astra UI demonstration](https://www.bilibili.com/video/BV16x421S7qc), linked from the repository README and Wiki.

The Bilibili profile URL returned HTTP 412 to direct retrieval. Video pages and indexed public search results were available. Subscriber and play counts from search caches should not be treated as current.

## Altium library hover preview

- `altium-library.jpg`: Original cover of the owner's Bilibili video [BV12N4y117hD](https://www.bilibili.com/video/BV12N4y117hD/), retrieved on 2026-11-10 via the public video metadata API.
- Original image: https://i1.hdslb.com/bfs/archive/c784f7b93347ff76f3435cdc65c6976ddb7658a1.jpg
- Used only as an on-demand project-title preview; the image is unchanged.

## astra UI video frame

- `astra-ui-demo.webp`: Frame at 00:05 of the author's [astra UI demonstration, BV1i4421D7nJ](https://www.bilibili.com/video/BV1i4421D7nJ/?t=5), retrieved 2026-11-10.
- The public video metadata identifies uploader UID 43483079 and CID 1608972847. The frame shows the real OLED tile menu running on the development board.
- Extracted at the source resolution of 852 × 480 and encoded to WebP. No generated or composited content; the source frame and watermark are preserved.
- Replaces the previous boot-logo-only preview. GitHub stars were rechecked on 2026-11-10: 2,417 / 139 / 234 / 1,125 for astra UI / Lite / launcher / Altium library, respectively.
