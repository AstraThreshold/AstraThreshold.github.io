// SPDX-License-Identifier: GPL-3.0-or-later
import { OledFrameClock } from './oled-clock.js';
import { mountOledGrid } from './oled-grid.js';
import { bindOledKeys } from './oled-keys.js';
import { mountOledStage } from './oled-stage.js';
const engineRepositories = {
  modern: 'https://github.com/AstraThreshold/oled-ui-astra',
  lite: 'https://github.com/AstraThreshold/astra-launcher'
};

// WASI is restricted to libc's abort/write hooks. Neither engine gets a filesystem.
export async function createOledEngine(source) {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
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
  const canvas = root.querySelector('.oled-screen');
  const context = canvas.getContext('2d', { alpha: false });
  const grid = mountOledGrid(canvas);
  const announcement = root.querySelector('.oled-announcement');
  const loading = root.querySelector('[data-oled-loading]');
  const actions = [...root.querySelectorAll('[data-oled-action]')];
  const picker = [...root.querySelectorAll('[data-ui-engine]')];
  const modules = new Map();
  const resetButton = root.querySelector('[data-oled-reset]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const controls = root.querySelector('.pcb-controls');
  const sceneHint = root.querySelector('.pcb-scene-hint');
  const powerToggle = root.querySelector('.pcb-power-toggle');
  let stage, liteState, resetOnPower = false, booting = false;
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
  const allowed = () => visible && focused && !document.hidden && !failure && stage?.powered;
  function updateControls() {
    const ready = root.dataset.state === 'ready' && stage?.interactive && !booting;
    controls.inert = !ready;
    actions.forEach(button => { if (button.disabled === ready) button.disabled = !ready; });
    const active = stage?.mode === 'active', aligning = stage?.mode === 'aligning';
    sceneHint.textContent = active && ready ? localText('已通电 · 可使用板上按键', 'Powered on · Use the board keys')
      : active ? (failure ? localText('通电失败，点击重启再试一次。', 'Could not power up. Press Reset to try again.')
        : localText('正在通电…', 'Powering up…'))
      : aligning ? localText('正在转正通电…', 'Turning to the front…')
      : localText('拖动旋转 · 点击板子通电', 'Drag to rotate · Click the board to power on');
    powerToggle.querySelector('span').textContent = active || aligning
      ? localText('旋转查看', 'Rotate board') : localText('通电体验', 'Power on');
    powerToggle.setAttribute('aria-pressed', String(active || aligning));
  }
  function syncHeartbeat() {
    board.dataset.heartbeat = String(allowed() && root.dataset.state === 'ready' && !reducedMotion.matches);
  }
  function stop() {
    cancelAnimationFrame(request);request = 0;clock.reset();
    root.dataset.running = 'false';
    syncHeartbeat();
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
      if (booting !== Boolean(flags & 8)) {
        booting = Boolean(flags & 8);
        root.dataset.booting = String(booting);
        updateControls();
      }
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
    syncHeartbeat();
    if (!allowed() || !current?.engine) return;
    if (reducedMotion.matches) {
      if (booting) { advanceWithoutMotion();draw(); }
      stop();return;
    }
    stableTime = 0;endTime = performance.now() + 6000;
    if (!request) { clock.reset(performance.now());root.dataset.running = 'true';request = requestAnimationFrame(tick); }
  }
  function advanceWithoutMotion() {
    // Settle the native boot, camera and menu before showing the final frame.
    for (let i = 0; i < 480; i++) current.engine.sim_step(Math.round(current.time += 1000 / 60));
  }
  function showFailure() {
    stop();failure = true;root.dataset.state = 'error';
    syncHeartbeat();
    actions.forEach(button => { button.disabled = true; });
    loading.hidden = false;
    loading.textContent = localText('通电失败，点击重启再试一次。', 'Could not power up. Press Reset to try again.');
    updateControls();
  }
  async function loadModule(name) {
    if (!modules.has(name)) {
      const load = async () => {
        manifestPromise ??= fetch(new URL(`assets/simulator/engines.json${new URL(import.meta.url).search}`, import.meta.url), { signal: AbortSignal.timeout(12000) })
          .then(response => { if (!response.ok) throw new Error('Engine list unavailable');return response.json(); })
          .catch(error => { manifestPromise = null;throw error; });
        const manifest = await manifestPromise;
        const response = await fetch(new URL(`assets/simulator/${name}.wasm?v=${manifest[name].sha256.slice(0, 12)}`, import.meta.url), { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('OLED engine unavailable');
        return WebAssembly.compile(await response.arrayBuffer());
      };
      modules.set(name, load().catch(error => { modules.delete(name);throw error; }));
    }
    return modules.get(name);
  }
  function choose(name) {
    selected = name;
    root.dataset.engine = name;
    picker.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.uiEngine === name)));
    root.querySelector('[data-oled-source]').href = engineRepositories[name];
  }
  async function powerUp(reset = false) {
    const name = selected;
    const ticket = ++sequence;
    keys.cancel();grid.sync();
    stop();failure = false;current = null;
    clock.setRate(name === 'lite' ? 60 : 240);
    resetButton.disabled = true;
    root.dataset.state = 'loading';
    booting = false;root.dataset.booting = 'false';
    syncHeartbeat();
    updateControls();
    loading.hidden = false;loading.textContent = localText('正在通电…', 'Powering up…');
    try {
      let state = name === 'lite' && !reset ? liteState : null;
      if (!state) {
        const module = await loadModule(name);
        if (ticket !== sequence || !stage.powered) return;
        state = { engine: await createOledEngine(module), time: 0 };
      }
      if (ticket !== sequence || !stage.powered) return;
      if (name === 'lite') liteState = state;
      current = state;lastFlags = -1;
      // Original engines animate their own selectors; reduced motion settles offscreen.
      // Settle both the new boot and its following camera entry without motion.
      if (reducedMotion.matches) advanceWithoutMotion();
      else state.engine.sim_step(Math.round(state.time += 1000 / 60));
      draw(true);announce();
      root.dataset.state = 'ready';loading.hidden = true;
      resetButton.disabled = false;
      updateControls();
      wake();
    } catch { if (ticket === sequence) { resetButton.disabled = false;showFailure(); } }
  }
  function input(action) {
    if (!current?.engine || root.dataset.state !== 'ready' || !stage.interactive || booting) return;
    try {
      stage.activity();
      grid.sync();
      current.engine.sim_input(action);
      if (reducedMotion.matches) {
        advanceWithoutMotion();
        draw();
      }
      announce();wake();
    } catch { showFailure(); }
  }
  const keys = bindOledKeys(actions, input);
  stage = mountOledStage(root, board, {
    onPower(on) {
      if (on) {
        const reset = resetOnPower;
        resetOnPower = false;
        powerUp(reset);
        return;
      }
      sequence++;
      current = null;booting = false;
      root.dataset.state = 'waiting';root.dataset.booting = 'false';
      board.dataset.led = 'false';
      resetButton.disabled = false;
      stop();updateControls();
    },
    onMode() { keys.cancel();grid.sync();updateControls(); }
  });
  picker.forEach(button => button.addEventListener('click', () => {
    const changed = selected !== button.dataset.uiEngine;
    choose(button.dataset.uiEngine);
    stage.activate();
    if (changed && stage.powered) powerUp();
  }));
  resetButton.addEventListener('click', () => {
    if (stage.powered) { stage.activity();powerUp(true); }
    else { resetOnPower = true;stage.activate(); }
  });
  const keyActions = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, Enter: 3, Escape: 2 };
  board.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    const action = keyActions[event.key];
    // Focused switches handle Enter/Space themselves, including long presses.
    if (action === undefined || (event.key === 'Enter' && event.target.closest('button'))) return;
    event.preventDefault();input(action);
  });
  function syncAvailability() {
    const available = visible && focused && !document.hidden;
    stage.setAvailable(available);
    if (!available) stop();else if (stage.powered) wake();
  }
  document.addEventListener('visibilitychange', syncAvailability);
  window.addEventListener('blur', () => { focused = false;syncAvailability(); });
  window.addEventListener('focus', () => { focused = true;syncAvailability(); });
  window.addEventListener('pagehide', () => { stage.setAvailable(false);stop();board.dataset.heartbeat = 'false'; });
  window.addEventListener('pageshow', syncAvailability);
  reducedMotion.addEventListener('change', wake);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncAvailability();
    }, { threshold: .08 }).observe(root.querySelector('.pcb-scene'));
  } else { visible = true;syncAvailability(); }
  context.putImageData(pixels, 0, 0);
  return { updateLanguage() {
    updateControls();
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
