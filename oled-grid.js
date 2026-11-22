// SPDX-License-Identifier: GPL-3.0-or-later
export const boardWidthMm = 36.4;
export const boardHeightMm = 26.3;
export const cameraDistanceMm = 110;
export const oledAreaMm = { left: 5.1, top: 1.68, width: 29.42, height: 14.71 };

export function fitCoreWidth(width, height) {
  // Leave space for the side switches and corners while the board rotates.
  return Math.max(0, Math.min(width - 10, (height - 8) * boardWidthMm / boardHeightMm));
}

export function mountOledGrid(scene) {
  function sync() {
    const width = fitCoreWidth(scene.clientWidth, scene.clientHeight);
    if (!width) return;
    scene.style.setProperty('--oled-board-width', `${width}px`);
    scene.style.setProperty('--pcb-camera', `${width * cameraDistanceMm / boardWidthMm}px`);
  }
  new ResizeObserver(sync).observe(scene);
  sync();
}
