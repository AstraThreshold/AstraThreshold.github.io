// SPDX-License-Identifier: GPL-3.0-or-later
import { mountPcbModel } from './oled-model.js';

export function mountOledStage(root, board, { onPower, onMode }) {
  const scene = root.querySelector('.pcb-scene');
  const object = root.querySelector('.pcb-object');
  const toggle = root.querySelector('.pcb-power-toggle');
  const updateModel = mountPcbModel(scene, object);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const front = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';
  const display = 'rotateX(-16deg) rotateY(-23deg) rotateZ(-5deg)';
  let mode = 'display', powered = false, available = false, motion, drag, frame = 0;
  let idleTimer = 0, powerTimer = 0, epoch = 0, returning;
  root.dataset.pose = mode;
  board.dataset.power = 'off';
  object.style.transform = display;

  function syncModel() {
    updateModel(available, Boolean(motion && motion.playState !== 'paused'));
  }

  function setMode(value) {
    mode = value;root.dataset.pose = value;onMode(value);
  }
  function setPower(value) {
    if (powered === value) return;
    powered = value;board.dataset.power = value ? 'on' : 'off';onPower(value);
  }
  function snapshot() {
    const transform = getComputedStyle(object).transform;
    object.style.transform = transform === 'none' ? front : transform;
    motion?.cancel();motion = null;
    return object.style.transform;
  }
  function clearTimers() {
    clearTimeout(idleTimer);clearTimeout(powerTimer);idleTimer = powerTimer = 0;
  }
  function orbit(base = display) {
    snapshot();object.style.transform = base;
    if (!reduced.matches) {
      const matrix = new DOMMatrix(base);
      const tilt = (x, y, z, lift) => new DOMMatrix().translate(0, lift, 0).rotate(x, y, z).multiply(matrix).toString();
      motion = object.animate([
        { transform: matrix.toString() },
        { transform: tilt(8, 60, 4, -3) },
        { transform: tilt(4, 120, 6, -5) },
        { transform: tilt(-8, 180, 1, -2) },
        { transform: tilt(4, 240, -4, 2) },
        { transform: tilt(6, 300, -2, 0) },
        { transform: matrix.toString() }
      ], { duration: 32000, iterations: Infinity, easing: 'linear' });
      if (!available) motion.pause();
    }
    syncModel();
  }
  function activity() {
    clearTimeout(idleTimer);idleTimer = 0;
    if (mode !== 'active' || !available) return;
    idleTimer = setTimeout(() => {
      idleTimer = 0;
      // Do not move the controls out from under a keyboard user or held switch.
      if ((document.documentElement.dataset.inputMode === 'keyboard' && scene.contains(document.activeElement))
          || board.querySelector('[data-key-pressed]')) activity();
      else showDisplay();
    }, 18000);
  }
  function schedulePower(ticket) {
    clearTimeout(powerTimer);
    if (!available || powered || mode !== 'aligning') return;
    const delay = reduced.matches ? 0 : Math.max(0, 230 - Number(motion?.currentTime || 0));
    powerTimer = setTimeout(() => {
      powerTimer = 0;
      if (ticket === epoch && available && mode === 'aligning') setPower(true);
    }, delay);
  }
  function activate() {
    if (mode === 'active') { activity();return Promise.resolve(); }
    if (mode === 'aligning') return returning;
    const ticket = ++epoch;
    clearTimers();endDrag(true);
    const start = snapshot();
    setMode('aligning');
    const animation = motion = object.animate([{transform:start},{transform:front}], {
      duration:reduced.matches ? 0 : 980,easing:'cubic-bezier(.3,0,.16,1)',fill:'forwards'
    });
    if (!available) animation.pause();
    syncModel();
    schedulePower(ticket);
    returning = animation.finished.then(() => {
      if (ticket !== epoch) return;
      object.style.transform = 'none';animation.cancel();motion = null;
      clearTimeout(powerTimer);powerTimer = 0;
      setPower(true);setMode('active');activity();
      syncModel();
    }).catch(() => {});
    return returning;
  }
  function showDisplay() {
    const ticket = ++epoch;
    clearTimers();endDrag(true);
    const start = snapshot();
    setPower(false);setMode('returning');
    const animation = motion = object.animate([{transform:start},{transform:display}], {
      duration:reduced.matches ? 0 : 850,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards'
    });
    if (!available) animation.pause();
    syncModel();
    animation.finished.then(() => {
      if (ticket !== epoch) return;
      object.style.transform = display;animation.cancel();motion = null;
      setMode('display');orbit();
    }).catch(() => {});
  }
  function setAvailable(value) {
    available = value;
    if (!value) {
      clearTimers();motion?.pause();endDrag(true);
      syncModel();
      return;
    }
    if (motion?.playState === 'paused') motion.play();
    if (mode === 'display' && !motion && !drag) orbit(object.style.transform);
    if (mode === 'aligning') schedulePower(epoch);
    if (mode === 'active') activity();
    syncModel();
  }
  function paintDrag() {
    frame = 0;
    if (drag?.next) object.style.transform = drag.next;
    syncModel();
  }
  function endDrag(canceled = false) {
    if (!drag) return;
    const ending = drag;cancelAnimationFrame(frame);paintDrag();drag = null;
    if (scene.hasPointerCapture(ending.id)) scene.releasePointerCapture(ending.id);
    if (!canceled && ending.moved) orbit(object.style.transform);
    else if (!canceled) activate();
  }
  scene.addEventListener('pointerdown', event => {
    if (mode === 'active') { activity();return; }
    if (mode !== 'display' || !event.isPrimary || event.button !== 0
        || event.ctrlKey || event.metaKey || !event.target.closest('.pcb-object')) return;
    const base = snapshot();
    syncModel();
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,base:new DOMMatrix(base),moved:false,next:base};
    scene.setPointerCapture(event.pointerId);
  }, true);
  scene.addEventListener('pointermove', event => {
    if (mode === 'active') { activity();return; }
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
    if (Math.hypot(dx,dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    drag.next = new DOMMatrix().rotate(Math.max(-65,Math.min(65,-dy*.35)),dx*.45,0).multiply(drag.base).toString();
    if (!frame) frame = requestAnimationFrame(paintDrag);
  }, {passive:true});
  scene.addEventListener('pointerup', event => { if (drag?.id === event.pointerId) endDrag(); });
  scene.addEventListener('pointercancel', () => { endDrag(true);if (mode === 'display') orbit(object.style.transform); });
  scene.addEventListener('lostpointercapture', () => { if (drag) {endDrag(true);orbit(object.style.transform);} });
  scene.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (mode === 'active') { activity();return; }
    if (!['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) || event.target === toggle) return;
    event.preventDefault();event.stopPropagation();activate();
  }, true);
  board.addEventListener('focusin', () => {
    if (document.documentElement.dataset.inputMode === 'keyboard') activate();
  });
  toggle.addEventListener('click', () => mode === 'active' || mode === 'aligning' ? showDisplay() : activate());
  reduced.addEventListener('change', () => {
    if (mode === 'display') orbit(snapshot());
    else if (reduced.matches) motion?.finish();
  });
  return {
    activate, showDisplay, activity, setAvailable,
    get powered() { return powered; },
    get interactive() { return mode === 'active' && powered; },
    get mode() { return mode; }
  };
}
