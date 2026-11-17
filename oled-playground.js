// SPDX-License-Identifier: GPL-3.0-or-later
import { OledFrameClock } from './oled-clock.js';
import { mountOledGrid } from './oled-grid.js';
import { bindOledKeys } from './oled-keys.js';
const engineRepositories = {
  modern: 'https://github.com/AstraThreshold/oled-ui-astra',
  lite: 'https://github.com/AstraThreshold/astra-launcher'
};

// WASI is restricted to libc's abort/write hooks. Neither engine gets a filesystem.
export async function createOledEngine(bytes) {
  const module = await WebAssembly.compile(bytes);
  let instance;
  const wasi = {
    proc_exit(code) { throw new Error(`OLED engine stopped (${code}).`); },
    fd_close() { return 8; }, fd_seek() { return 8; },
    fd_write(_fd, vectors, count, written) {
      const view = new DataView(instance.exports.memory.buffer);
      let length = 0;
      for (let i = 0; i < count; i++) length += view.getUint32(vectors + i * 8 + 4, true);
      view.setUint32(written, length, true);return 0;
    },
    environ_sizes_get(count, size) {
      const view = new DataView(instance.exports.memory.buffer);
      view.setUint32(count, 0, true);view.setUint32(size, 0, true);return 0;
    },
    environ_get() { return 0; },
    random_get(pointer, length) {
      const bytes = new Uint8Array(instance.exports.memory.buffer, pointer, length);
      for (let offset = 0; offset < length; offset += 65536) crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
      return 0;
    }
  };
  instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi });
  instance.exports._initialize?.();
  instance.exports.sim_init();
  return instance.exports;
}

export function initOledPlayground(getLanguage) {
  const root = document.querySelector('[data-oled-playground]');
  if (!root) return { updateLanguage() {} };
  const board = root.querySelector('.pcb-board');
  const canvas = root.querySelector('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  const grid = mountOledGrid(canvas);
  const announcement = root.querySelector('.oled-announcement');
  const loading = root.querySelector('[data-oled-loading]');
  const actions = [...root.querySelectorAll('[data-oled-action]')];
  const picker = [...root.querySelectorAll('[data-ui-engine]')];
  const states = new Map();
  const pending = new Map();
  const resetButton = root.querySelector('[data-oled-reset]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 'modern', current = null, manifestPromise;
  let visible = false, focused = document.hasFocus(), sequence = 0;
  let request = 0, endTime = 0, stableTime = 0;
  const clock = new OledFrameClock();
  let failure = false;
  const displayed = new Uint8Array(1024).fill(255);
  const pixels = context.createImageData(128, 64);
  const pixelData = new Uint32Array(pixels.data.buffer);
  pixelData.fill(0xff000000);
  let lastFlags = -1;

  const localText = (zh, en) => getLanguage() === 'en' ? en : zh;
  const allowed = () => visible && focused && !document.hidden && !failure;
  function stop() {
    cancelAnimationFrame(request);request = 0;clock.reset();
    root.dataset.running = 'false';
  }
  function label() {
    if (!current?.engine) return '';
    const engine = current.engine;
    const ptr = engine.sim_label();
    const text = new Uint8Array(engine.memory.buffer, ptr, Math.min(100, engine.memory.buffer.byteLength - ptr));
    const zero = text.indexOf(0);
    return new TextDecoder().decode(zero < 0 ? text : text.subarray(0, zero));
  }
  function announce() {
    if (!current?.engine) return;
    announcement.textContent = `${selected === 'modern' ? 'astra UI' : 'astra UI Lite'} · ${label()}`;
    canvas.setAttribute('aria-label', localText(`128 × 64 OLED：${label()}`, `128 × 64 OLED: ${label()}`));
  }
  function draw(force = false) {
    const engine = current.engine;
    const frame = new Uint8Array(engine.memory.buffer, engine.sim_buffer(), 1024);
    const flags = engine.sim_flags();
    const inverted = Boolean(flags & 2);
    const brightness = selected === 'lite' ? ((flags >> 8) & 255) : 100;
    if (flags !== lastFlags) {
      force = true;lastFlags = flags;
      board.dataset.led = String(Boolean(flags & 1));
    }
    const level = Math.round(135 + brightness * 1.2);
    const lit = (0xff000000 | (level << 16) | (level << 8) | level) >>> 0;
    let changed = false;
    for (let i = 0; i < 1024; i++) {
      if (!force && frame[i] === displayed[i]) continue;
      changed = true;
      const x = i % 128, y = (i >> 7) * 8;
      for (let bit = 0; bit < 8; bit++) {
        if (!force && !((frame[i] ^ displayed[i]) & (1 << bit))) continue;
        const on = Boolean(frame[i] & (1 << bit)) !== inverted;
        pixelData[(y + bit) * 128 + x] = on ? lit : 0xff000000;
      }
      displayed[i] = frame[i];
    }
    if (changed) context.putImageData(pixels, 0, 0);
    root.dataset.selected = String(engine.sim_selected());
    return changed;
  }
  function tick(now) {
    request = 0;
    if (!allowed() || !current?.engine) { stop();return; }
    try {
      clock.advance(now, milliseconds => {
        current.time += milliseconds;
        current.engine.sim_step(Math.round(current.time));
      });
      stableTime = draw() ? 0 : stableTime + clock.elapsed;
    } catch { showFailure();return; }
    if (now < endTime && (stableTime < 300 || (current.engine.sim_flags() & 4))) request = requestAnimationFrame(tick);
    else stop();
  }
  function wake() {
    if (!allowed() || !current?.engine) return;
    if (reducedMotion.matches) { stop();return; }
    stableTime = 0;endTime = performance.now() + 6000;
    if (!request) { clock.reset(performance.now());root.dataset.running = 'true';request = requestAnimationFrame(tick); }
  }
  function showFailure() {
    stop();failure = true;root.dataset.state = 'error';
    actions.forEach(button => { button.disabled = true; });
    loading.hidden = false;
    loading.textContent = localText('通电失败，点击重启再试一次。', 'Could not power up. Press Reset to try again.');
  }
  async function getState(name, replace = false) {
    if (pending.has(name)) return pending.get(name);
    let state = states.get(name);
    if (state && !replace) return state;
    const operation = load();
    pending.set(name, operation);
    try { return await operation; }
    finally { if (pending.get(name) === operation) pending.delete(name); }
    async function load() {
      if (!state?.bytes) {
        manifestPromise ??= fetch(new URL(`assets/simulator/engines.json${new URL(import.meta.url).search}`, import.meta.url), { signal: AbortSignal.timeout(12000) })
          .then(response => { if (!response.ok) throw new Error('Engine list unavailable');return response.json(); })
          .catch(error => { manifestPromise = null;throw error; });
        const manifest = await manifestPromise;
        const response = await fetch(new URL(`assets/simulator/${name}.wasm?v=${manifest[name].sha256.slice(0, 12)}`, import.meta.url), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('OLED engine unavailable');
        const bytes = await response.arrayBuffer();
        state = { bytes, engine: null, time: 0 };
      }
      const engine = await createOledEngine(state.bytes);
      state = { bytes: state.bytes, engine, time: 0 };
      states.set(name, state);
      return state;
    }
  }
  async function select(name, reset = false) {
    const ticket = ++sequence;
    keys.cancel();grid.sync();
    stop();failure = false;selected = name;current = null;
    resetButton.disabled = true;
    root.dataset.engine = name;root.dataset.state = 'loading';
    picker.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.uiEngine === name)));
    root.querySelector('[data-oled-source]').href = engineRepositories[name];
    actions.forEach(button => { button.disabled = true; });
    loading.hidden = false;loading.textContent = localText('正在通电…', 'Powering up…');
    try {
      const state = await getState(name, reset);
      if (ticket !== sequence) return;
      current = state;lastFlags = -1;
      // Original engines animate their own selectors; reduced motion settles offscreen.
      const frames = reducedMotion.matches ? 220 : 1;
      for (let i = 0; i < frames; i++) { state.time += 1000 / 60;state.engine.sim_step(Math.round(state.time)); }
      draw(true);announce();
      root.dataset.state = 'ready';loading.hidden = true;
      resetButton.disabled = false;
      actions.forEach(button => { button.disabled = false; });
      wake();
    } catch { if (ticket === sequence) { resetButton.disabled = false;showFailure(); } }
  }
  function input(action) {
    if (!current?.engine || root.dataset.state !== 'ready') return;
    try {
      grid.sync();
      current.engine.sim_input(action);
      if (reducedMotion.matches) {
        for (let i = 0; i < 220; i++) { current.time += 1000 / 60;current.engine.sim_step(Math.round(current.time)); }
        draw();
      }
      announce();wake();
    } catch { showFailure(); }
  }
  const keys = bindOledKeys(actions, input);
  picker.forEach(button => button.addEventListener('click', () => {
    if (selected !== button.dataset.uiEngine || root.dataset.state === 'waiting') select(button.dataset.uiEngine);
  }));
  resetButton.addEventListener('click', () => select(selected, true));
  const keyActions = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, Enter: 3, Escape: 2 };
  board.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    const action = keyActions[event.key];
    // Focused switches handle Enter/Space themselves, including long presses.
    if (action === undefined || (event.key === 'Enter' && event.target.closest('button'))) return;
    event.preventDefault();input(action);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop();else wake(); });
  window.addEventListener('blur', () => { focused = false;stop(); });
  window.addEventListener('focus', () => { focused = true;wake(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', wake);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (!visible) stop();
      else if (root.dataset.state === 'waiting') select(selected);
      else wake();
    }, { threshold: .08 }).observe(board);
  } else { visible = true;select(selected); }
  context.putImageData(pixels, 0, 0);
  return { updateLanguage() {
    actions.forEach((button, index) => button.setAttribute('aria-label',
      getLanguage() === 'en' ? ['Previous; hold to go back','Next; hold to enter'][index] : ['上一项，长按返回','下一项，长按确认'][index]));
    actions.forEach(button => { button.title = button.getAttribute('aria-label'); });
    grid.schedule();
    board.setAttribute('aria-label', localText('可操作的 OLED 开发板', 'Interactive OLED development board'));
    if (failure) loading.textContent = localText('通电失败，点击重启再试一次。', 'Could not power up. Press Reset to try again.');
    else if (root.dataset.state !== 'ready') loading.textContent = localText('正在通电…', 'Powering up…');
    announce();
  } };
}
