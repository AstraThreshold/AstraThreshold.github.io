// SPDX-License-Identifier: GPL-3.0-or-later
export class OledKeyGesture {
  constructor(activate, timers = globalThis) {
    this.activate = activate;this.timers = timers;
    this.press = null;this.holdTimer = 0;this.releaseTimer = 0;this.suppressClick = false;
  }
  begin(action, heldAction) {
    this.reset();
    const press = this.press = { action, heldAction, held: false };
    this.holdTimer = this.timers.setTimeout(() => {
      this.holdTimer = 0;
      if (this.press !== press) return;
      press.held = true;this.activate(press.heldAction);
    }, 600);
  }
  finish() {
    const press = this.press;
    this.cancel();
    if (press && !press.held) this.activate(press.action);
  }
  cancel() {
    this.timers.clearTimeout(this.holdTimer);this.holdTimer = 0;this.press = null;
    this.suppressClick = true;
    this.timers.clearTimeout(this.releaseTimer);
    this.releaseTimer = this.timers.setTimeout(() => { this.suppressClick = false;this.releaseTimer = 0; }, 350);
  }
  reset() {
    this.timers.clearTimeout(this.holdTimer);this.timers.clearTimeout(this.releaseTimer);
    this.holdTimer = 0;this.releaseTimer = 0;this.press = null;this.suppressClick = false;
  }
  click(action) {
    if (!this.press && !this.suppressClick) this.activate(action);
  }
}

export function bindOledKeys(buttons, activate) {
  const gesture = new OledKeyGesture(activate);
  let source = null;
  const buttonAt = target => buttons.find(button => button === target || button.contains(target));
  const distanceTo = (button, x, y) => {
    const rect = button.getBoundingClientRect();
    return Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
  };
  const magneticButton = event => buttons.find(button => button.hasAttribute('data-cursor-magnet') && distanceTo(button, event.clientX, event.clientY) <= 20);
  function clearSource() { source?.button.removeAttribute('data-key-pressed');source = null; }
  function cancel() {
    if (!source) return;
    gesture.cancel();source.canceled = true;
    source.button.removeAttribute('data-key-pressed');
  }
  function begin(button, detail) {
    cancel();source = { button, ...detail };
    button.setAttribute('data-key-pressed', '');
    gesture.begin(Number(button.dataset.oledAction), Number(button.dataset.oledHold));
  }
  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey) return;
    const button = buttonAt(event.target) || (event.pointerType === 'mouse' ? magneticButton(event) : null);
    if (!button || button.disabled) { cancel();return; }
    if (event.pointerType === 'touch') event.preventDefault();
    begin(button, { pointerId: event.pointerId, x: event.clientX, y: event.clientY, type: event.pointerType });
  }, true);
  document.addEventListener('pointermove', event => {
    if (!source || source.canceled || source.pointerId !== event.pointerId) return;
    const drift = Math.hypot(event.clientX - source.x, event.clientY - source.y);
    const margin = source.type === 'mouse' && source.button.hasAttribute('data-cursor-magnet') ? 20 : 8;
    // Test the current pointer too: the cursor's attachment updates on the next frame.
    if ((source.type !== 'mouse' && drift > 12) || distanceTo(source.button, event.clientX, event.clientY) > margin) cancel();
  }, { passive: true });
  document.addEventListener('pointerup', event => {
    if (source?.pointerId !== event.pointerId) return;
    gesture.finish();clearSource();
  });
  document.addEventListener('pointercancel', () => { cancel();clearSource(); }, { passive: true });
  document.addEventListener('adaptive-cursor-change', event => {
    if (source?.type === 'mouse' && event.detail.previous === source.button && event.detail.target !== source.button) cancel();
  });
  document.addEventListener('contextmenu', event => { if ((source && !source.canceled) || buttonAt(event.target)) event.preventDefault(); });
  buttons.forEach(button => {
    button.addEventListener('click', () => { if (!source) gesture.click(Number(button.dataset.oledAction)); });
    button.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      if (!event.repeat && !button.disabled) begin(button, { key: event.key });
    });
    button.addEventListener('keyup', event => {
      if (source?.button !== button || source.key !== event.key) return;
      event.preventDefault();gesture.finish();clearSource();
    });
    button.addEventListener('blur', () => { if (source?.button === button && source.key) cancel(); });
  });
  addEventListener('blur', cancel);
  addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { cancel };
}
