// SPDX-License-Identifier: GPL-3.0-or-later
import { mountPcbModel } from './oled-model.js';

function rotateInPlace(base, x, y, z, lift = 0) {
  const orientation = DOMMatrix.fromMatrix(base);
  orientation.m41 = orientation.m42 = orientation.m43 = 0;
  return new DOMMatrix().translate(base.m41, base.m42 + lift, base.m43).rotate(x, y, z).multiply(orientation).toString();
}

export function mountOledStage(root, board, { onPower, onApproach, onTap, onMode }) {
  const scene = root.querySelector('.pcb-scene');
  const object = root.querySelector('.pcb-object');
  const model = mountPcbModel(scene, object);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const front = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';
  const display = getComputedStyle(object).getPropertyValue('--pcb-case-pose').trim();
  const turnDuration = 980, powerAt = 230, approachAt = 780;
  let mode = 'display', powered = false, approachingFront = false, available = false, introduced = false, motion, drag, frame = 0;
  let idleTimer = 0, turnTimer = 0, epoch = 0, returning;
  root.dataset.pose = mode;
  board.dataset.power = 'off';

  function syncModel() {
    model.sync(available, Boolean(motion && motion.playState !== 'paused'), motion?.id === 'pcb-orbit');
  }

  function setMode(value) {
    mode = value;root.dataset.pose = value;onMode(value);
  }
  function setPower(value) {
    if (!value) approachingFront = false;
    if (powered === value) return;
    powered = value;board.dataset.power = value ? 'on' : 'off';onPower(value);
  }
  function approachFront() {
    if (approachingFront) return;
    approachingFront = true;
    onApproach();
  }
  function snapshot() {
    const transform = getComputedStyle(object).transform;
    object.style.transform = transform === 'none' ? front : transform;
    motion?.cancel();motion = null;
    return object.style.transform;
  }
  function clearTimers() {
    clearTimeout(idleTimer);clearTimeout(turnTimer);idleTimer = turnTimer = 0;
  }
  function orbit(base = display) {
    introduced = true;
    snapshot();object.style.transform = base;
    if (!reduced.matches) {
      const matrix = new DOMMatrix(base);
      const tilt = (x, y, z, lift) => rotateInPlace(matrix, x, y, z, lift);
      motion = object.animate([
        { transform: matrix.toString() },
        { transform: tilt(8, 60, 4, -1) },
        { transform: tilt(4, 120, 6, -2) },
        { transform: tilt(-8, 180, 1, -1) },
        { transform: tilt(4, 240, -4, 1) },
        { transform: tilt(6, 300, -2, 0) },
        { transform: matrix.toString() }
      ], { id:'pcb-orbit', duration: 32000, iterations: Infinity, easing: 'linear' });
      if (!available) motion.pause();
    }
    syncModel();
  }
  function enterDisplay() {
    introduced = true;
    if (reduced.matches) { orbit();return; }
    const start = snapshot();
    const entrance = motion = object.animate([{transform:start},{transform:display}], {
      id:'pcb-entrance', duration:720, easing:'cubic-bezier(.2,.65,.24,1)', fill:'forwards'
    });
    entrance.finished.then(() => { if (motion === entrance) orbit(); }).catch(() => {});
  }
  function activity() {
    clearTimeout(idleTimer);idleTimer = 0;
    if (mode !== 'active' || !available) return;
    idleTimer = setTimeout(() => {
      idleTimer = 0;
      // Do not move the controls out from under a keyboard user or held switch.
      if ((document.documentElement.dataset.inputMode === 'keyboard' && root.contains(document.activeElement))
          || board.querySelector('[data-key-pressed]')) activity();
      else showDisplay();
    }, 18000);
  }
  function scheduleTurn(ticket) {
    clearTimeout(turnTimer);turnTimer = 0;
    if (!available || approachingFront || mode !== 'aligning') return;
    const milestone = powered ? approachAt : powerAt;
    const delay = reduced.matches ? 0 : Math.max(0, milestone - Number(motion?.currentTime || 0));
    turnTimer = setTimeout(() => {
      turnTimer = 0;
      if (ticket !== epoch || !available || mode !== 'aligning') return;
      if (powered) approachFront();
      else { setPower(true);scheduleTurn(ticket); }
    }, delay);
  }
  function activate() {
    if (mode === 'active') { activity();return Promise.resolve(); }
    if (mode === 'aligning') return returning;
    const ticket = ++epoch;
    introduced = true;
    clearTimers();endDrag(true);
    const start = snapshot();
    setMode('aligning');
    const animation = motion = object.animate([{transform:start},{transform:front}], {
      id:'pcb-approach', duration:reduced.matches ? 0 : turnDuration,easing:'cubic-bezier(.3,0,.16,1)',fill:'forwards'
    });
    if (!available) animation.pause();
    syncModel();
    scheduleTurn(ticket);
    returning = animation.finished.then(() => {
      if (ticket !== epoch) return;
      object.style.transform = 'none';animation.cancel();motion = null;
      clearTimeout(turnTimer);turnTimer = 0;
      setPower(true);setMode('active');approachFront();activity();
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
      id:'pcb-return', duration:reduced.matches ? 0 : 850,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards'
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
    if (mode === 'display' && !motion && !drag) {
      if (introduced) orbit(object.style.transform);
      else enterDisplay();
    }
    if (mode === 'dragging' && !drag) showDisplay();
    if (mode === 'aligning') scheduleTurn(epoch);
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
    if (canceled) return;
    if (ending.moved && mode === 'dragging') showDisplay();
    else if (ending.moved) orbit(object.style.transform);
    else if (mode === 'active') { activity();onTap(); }
    else activate();
  }
  function cancelPointerDrag() {
    if (!drag) return;
    endDrag(true);
    if (mode === 'dragging') showDisplay();
    else if (mode === 'display') orbit(object.style.transform);
  }
  scene.addEventListener('pointerdown', event => {
    if (mode === 'active') activity();
    if ((mode !== 'display' && mode !== 'active') || !event.isPrimary || event.button !== 0
        || event.ctrlKey || event.metaKey || !event.target.closest('.pcb-object')) return;
    if (event.target.closest('.pcb-key') || board.querySelector('[data-key-pressed]')) return;
    const base = snapshot();
    syncModel();
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,base:new DOMMatrix(base),moved:false,next:base};
    scene.setPointerCapture(event.pointerId);
  }, true);
  scene.addEventListener('pointermove', event => {
    if (mode === 'active') activity();
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx,dy) <= 5) return;
      drag.moved = true;
      if (mode === 'active') {
        clearTimers();setPower(false);setMode('dragging');
      }
    }
    drag.next = rotateInPlace(drag.base, Math.max(-65,Math.min(65,-dy*.35)), dx*.45, 0);
    if (!frame) frame = requestAnimationFrame(paintDrag);
  }, {passive:true});
  scene.addEventListener('pointerup', event => { if (drag?.id === event.pointerId) endDrag(); });
  scene.addEventListener('pointercancel', cancelPointerDrag);
  scene.addEventListener('lostpointercapture', cancelPointerDrag);
  // Clicks retargeted by the magnetic cursor reach the body at their intended control.
  document.body.addEventListener('click', event => {
    if ((mode === 'active' || mode === 'aligning') && !root.contains(event.target)) showDisplay();
  }, {capture:true, passive:true});
  scene.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (mode === 'active') { activity();return; }
    if (!['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();activate();
  }, true);
  board.addEventListener('focusin', () => {
    if (document.documentElement.dataset.inputMode === 'keyboard') activate();
  });
  reduced.addEventListener('change', () => {
    if (mode === 'display') orbit(reduced.matches && motion?.id === 'pcb-entrance' ? display : snapshot());
    else if (reduced.matches) motion?.finish();
  });
  return {
    activate, activity, setAvailable, writeScreen: model.writeScreen,
    get powered() { return powered; },
    get approachingFront() { return approachingFront; },
    get interactive() { return mode === 'active' && powered; }
  };
}
