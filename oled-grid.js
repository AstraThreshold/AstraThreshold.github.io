// SPDX-License-Identifier: GPL-3.0-or-later
export const boardWidthMm = 36.4;
export const cameraDistanceMm = 110;

export function fitCoreWidth(available, viewport, ratio) {
  // Fit the whole assembly to the native display pitch, preserving every mm
  // ratio. A narrow phone can use its gutters without overflowing the viewport.
  const limit = Math.min(360, Math.max(available, Math.min(viewport - 2, 128 * 2 * boardWidthMm / 29.42)));
  const pitch = Math.max(1, Math.floor(limit * ratio * 29.42 / (128 * boardWidthMm) + 1e-5));
  return pitch * 128 * boardWidthMm / (29.42 * ratio);
}

export function fitOledGrid(rect, ratio, padding, viewport = {}) {
  const zoom = viewport.scale || 1;
  const pixelsPerCss = ratio * zoom;
  const offsetX = viewport.offsetLeft || 0, offsetY = viewport.offsetTop || 0;
  const innerWidth = Math.max(0, rect.width - padding.left - padding.right);
  const innerHeight = Math.max(0, rect.height - padding.top - padding.bottom);
  const pitch = Math.max(1, Math.floor(Math.min(innerWidth * pixelsPerCss / 128, innerHeight * pixelsPerCss / 64) + .001));
  const centerX = rect.left + padding.left + innerWidth / 2;
  const centerY = rect.top + padding.top + innerHeight / 2;
  const left = Math.round((centerX - offsetX) * pixelsPerCss - 64 * pitch);
  const top = Math.round((centerY - offsetY) * pixelsPerCss - 32 * pitch);
  return {
    pitch, ratio: pixelsPerCss, scale: pitch / pixelsPerCss,
    x: left / pixelsPerCss + offsetX - rect.left,
    y: top / pixelsPerCss + offsetY - rect.top
  };
}

export function mountOledGrid(canvas) {
  const bezel = canvas.parentElement;
  const board = canvas.closest('[data-board-width-mm]');
  const stage = board?.closest('.pcb-scene');
  const playground = board?.closest('[data-oled-playground]');
  let request = 0, resolution;
  function sync() {
    if (!canvas.isConnected) return;
    if (board) {
      const ratio = (devicePixelRatio || 1) * (window.visualViewport?.scale || 1);
      const width = fitCoreWidth((stage || board.parentElement).clientWidth, document.documentElement.clientWidth, ratio);
      const value = `${width}px`;
      const host = stage || board;
      if (host.style.getPropertyValue('--oled-board-width') !== value) {
        host.style.setProperty('--oled-board-width', value);
        host.style.setProperty('--pcb-camera', `${width * cameraDistanceMm / boardWidthMm}px`);
      }
    }
    const style = getComputedStyle(bezel);
    // A tilted world bounding box is not the OLED's local drawing surface.
    // Only the settled front view is snapped to the physical screen origin.
    const rect = stage && playground.dataset.pose !== 'active'
      ? {left:0,top:0,width:parseFloat(style.width),height:parseFloat(style.height)}
      : bezel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const padding = { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight),
      top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) };
    const grid = fitOledGrid(rect, devicePixelRatio || 1, padding, window.visualViewport || {});
    // A transform preserves fractional CSS precision without layout's 1/64 px rounding.
    const transform = `matrix(${grid.scale},0,0,${grid.scale},${grid.x},${grid.y})`;
    if (canvas.style.transform !== transform) canvas.style.transform = transform;
    canvas.dataset.pixelPitch = String(grid.pitch);
    canvas.dataset.gridReady = 'true';
  }
  function schedule() {
    if (!request && !document.hidden) request = requestAnimationFrame(() => { request = 0;sync(); });
  }
  function watchResolution() {
    resolution?.removeEventListener('change', watchResolution);
    resolution = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    resolution.addEventListener('change', watchResolution);
    schedule();
  }
  new ResizeObserver(schedule).observe(bezel);
  addEventListener('resize', schedule, { passive: true });
  addEventListener('scroll', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  document.fonts.ready.then(schedule);
  document.addEventListener('site-fonts-ready', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(request);request = 0; }
    else schedule();
  });
  watchResolution();sync();
  return { sync, schedule };
}
