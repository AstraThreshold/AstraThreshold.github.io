const controls = 'a[href], button, summary, [role="button"]';
const nativeControls = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (x, y, rect) => Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));

export function initAdaptiveCursor() {
  const root = document.documentElement;
  const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = matchMedia('(forced-colors: active)');
  let cursor, scope, candidates = [], dirty = true, active = false, target = null;
  let request = 0, previousTime = 0, initialized = false, pressed = false, down = null, modified = false;
  const pointer = { x: 0, y: 0 };
  const current = { x: 0, y: 0, width: 20, height: 20, radius: 10 };

  function markTarget(next) {
    if (next === target) return;
    target?.removeAttribute('data-cursor-magnet');
    target = next;
    target?.setAttribute('data-cursor-magnet', '');
  }

  function hide() {
    active = false; initialized = false; pressed = false; down = null;
    cancelAnimationFrame(request); request = 0; previousTime = 0;
    markTarget(null);
    cursor?.classList.remove('is-visible', 'is-pressed');
    root.classList.remove('has-adaptive-cursor');
  }

  function currentScope() {
    return [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  }

  function syncScope() {
    const next = currentScope();
    if (next !== scope) { scope = next; dirty = true; markTarget(null); }
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'adaptive-cursor';
      cursor.setAttribute('aria-hidden', 'true');
    }
    if (cursor.parentElement !== scope) scope.append(cursor);
    if (dirty) { candidates = [...scope.querySelectorAll(controls)]; dirty = false; }
  }

  function visibleRect(element) {
    if (!element.isConnected || element.matches('[disabled], [aria-disabled="true"]') || element.closest('[inert]')) return null;
    let nearest = null, best = Infinity;
    const wall = element.closest('.photo-wall');
    const clip = wall?.getBoundingClientRect();
    for (const rect of element.getClientRects()) {
      if (rect.width < 3 || rect.height < 3) continue;
      const left = Math.max(0, rect.left, clip?.left ?? 0), top = Math.max(0, rect.top, clip?.top ?? 0);
      const right = Math.min(root.clientWidth, rect.right, clip?.right ?? Infinity), bottom = Math.min(innerHeight, rect.bottom, clip?.bottom ?? Infinity);
      if (right <= left || bottom <= top) continue;
      const d = distance(pointer.x, pointer.y, { left, top, right, bottom });
      if (d < best) { best = d; nearest = { rect, distance: d }; }
    }
    if (!nearest) return null;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || style.pointerEvents === 'none') return null;
    return { ...nearest, style };
  }

  function pickTarget() {
    if (modified || (pressed && !down?.control)) return null;
    const hit = document.elementFromPoint(pointer.x, pointer.y)?.closest(controls);
    if (hit && scope.contains(hit)) {
      const info = visibleRect(hit);
      if (info) return { element: hit, ...info };
    }
    let chosen = null, best = Infinity;
    for (const element of candidates) {
      const info = visibleRect(element);
      const limit = element === target ? 20 : 14;
      if (!info || info.distance > limit) continue;
      const score = info.distance - (element === target ? 4 : 0);
      if (score < best) { best = score; chosen = { element, ...info }; }
    }
    return chosen;
  }

  function destination() {
    const choice = pickTarget();
    markTarget(choice?.element || null);
    if (!choice) return { x: pointer.x, y: pointer.y, width: 20, height: 20, radius: 10, mode: 'point', moving: false };
    let { rect } = choice;
    let moving = false;
    const media = target.matches('.photo-link');
    if (media && target.classList.contains('is-lifted')) {
      const source = target.querySelector('img');
      const floating = [...document.querySelectorAll('.photo-float')].reverse().find(image => image.src === (source?.currentSrc || source?.src));
      if (floating) {
        rect = floating.getBoundingClientRect();
        moving = floating.getAnimations().some(animation => animation.playState === 'running');
      }
    }
    const padding = media ? 5 : 6;
    const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
    const pullX = media ? 0 : clamp((pointer.x - centerX) * .035, -2, 2);
    const pullY = media ? 0 : clamp((pointer.y - centerY) * .035, -2, 2);
    const corner = parseFloat(choice.style.borderTopLeftRadius) || 0;
    return { x: centerX + pullX, y: centerY + pullY, width: rect.width + padding * 2, height: rect.height + padding * 2,
      radius: Math.min((rect.height + padding * 2) / 2, Math.max(7, corner + padding)), mode: media ? 'media' : 'target', moving };
  }

  function schedule() { if (active && !request) request = requestAnimationFrame(render); }

  function render(time) {
    request = 0;
    if (!active) return;
    syncScope();
    const goal = destination();
    if (!initialized) { Object.assign(current, { x: pointer.x, y: pointer.y, width: 20, height: 20, radius: 10 }); initialized = true; }
    const elapsed = previousTime ? clamp(time - previousTime, 1, 40) : 16;
    previousTime = time;
    let unsettled = false;
    for (const key of ['x', 'y', 'width', 'height', 'radius']) {
      const response = (key === 'x' || key === 'y') ? (target ? 52 : 24) : 56;
      const amount = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / response);
      const difference = goal[key] - current[key];
      current[key] = Math.abs(difference) < .08 ? goal[key] : current[key] + difference * amount;
      if (Math.abs(goal[key] - current[key]) > .08) unsettled = true;
    }
    Object.assign(cursor.style, { width: `${current.width}px`, height: `${current.height}px`, borderRadius: `${current.radius}px`,
      transform: `translate3d(${current.x - current.width / 2}px, ${current.y - current.height / 2}px, 0)` });
    cursor.dataset.mode = goal.mode;
    cursor.classList.toggle('is-pressed', pressed);
    cursor.classList.add('is-visible');
    root.classList.add('has-adaptive-cursor');
    if (unsettled || goal.moving) schedule(); else previousTime = 0;
  }

  function move(event) {
    if (event.pointerType !== 'mouse' || !finePointer.matches || forcedColors.matches) { hide(); return; }
    if (event.clientX < 0 || event.clientX >= root.clientWidth || event.clientY < 0 || event.clientY >= innerHeight || event.target.closest?.(nativeControls)) { hide(); return; }
    pointer.x = event.clientX; pointer.y = event.clientY;
    modified = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;
    active = true; schedule();
  }

  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    move(event);
    if (!active) return;
    syncScope();
    const choice = pickTarget();
    down = { x: event.clientX, y: event.clientY, control: choice?.element || null };
    pressed = true; schedule();
  }, { passive: true });
  document.addEventListener('pointerup', () => { pressed = false; schedule(); }, { passive: true });
  document.addEventListener('pointercancel', hide, { passive: true });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); }, { passive: true });
  document.addEventListener('dragstart', hide);
  document.addEventListener('contextmenu', hide);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key === 'Escape') hide();
    else if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) { modified = true; schedule(); }
  });
  document.addEventListener('keyup', event => { modified = event.ctrlKey || event.metaKey || event.altKey || event.shiftKey; schedule(); });

  // Keep the small magnetic margin clickable without changing native control hits,
  // modifier clicks, keyboard activation, or drag selection.
  document.addEventListener('click', event => {
    const press = down; down = null;
    if (!active || !press?.control || !event.isTrusted || !event.detail || event.defaultPrevented || event.button !== 0
      || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.target.closest?.(controls)
      || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4 || getSelection()?.type === 'Range') return;
    pointer.x = event.clientX; pointer.y = event.clientY;
    const info = visibleRect(press.control);
    if (!info || info.distance > 14 || !currentScope().contains(press.control)) return;
    event.preventDefault(); event.stopPropagation();
    press.control.click();
  }, true);

  const refresh = () => { dirty = true; schedule(); };
  new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'open', 'inert'] });
  document.addEventListener('scroll', schedule, { passive: true, capture: true });
  addEventListener('resize', refresh);
  addEventListener('blur', hide);
  addEventListener('pagehide', hide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  finePointer.addEventListener('change', () => { if (!finePointer.matches) hide(); });
  forcedColors.addEventListener('change', () => { if (forcedColors.matches) hide(); });
  reducedMotion.addEventListener('change', schedule);
  document.fonts.ready.then(refresh);
  document.addEventListener('site-fonts-ready', refresh);
}
