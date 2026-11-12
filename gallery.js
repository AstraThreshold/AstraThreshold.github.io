const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function initGallery(getLanguage) {
  const gallery = document.getElementById('gallery');
  const wall = gallery?.querySelector('[data-photo-wall]');
  const links = [...(wall?.querySelectorAll('.photo-link') || [])]
    .sort((a, b) => Number(a.dataset.photoIndex) - Number(b.dataset.photoIndex));
  const openButton = gallery?.querySelector('[data-gallery-open]');
  const viewer = document.getElementById('photo-viewer');
  const image = document.getElementById('photo-viewer-image');
  const position = document.getElementById('photo-viewer-count');
  const dialogReady = links.length && viewer && image && position && typeof viewer.showModal === 'function';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let current = 0;
  let origin = null;
  let pointerInside = false;
  let keyboardInside = false;
  let resizeFrame = null;
  let columnCount = 0;
  let active = null;
  const returning = new Set();

  const label = index => getLanguage() === 'en'
    ? `View photo ${index + 1} of ${links.length}` : `查看照片 ${index + 1} / ${links.length}`;

  function updateLanguage() {
    gallery?.setAttribute('aria-label', getLanguage() === 'en' ? 'Photos' : '照片墙');
    viewer?.setAttribute('aria-label', getLanguage() === 'en' ? 'Photo viewer' : '照片');
    wall?.querySelectorAll('.photo-link').forEach(link => {
      link.setAttribute('aria-label', label(Number(link.dataset.photoIndex)));
    });
    if (viewer?.open) image.alt = getLanguage() === 'en' ? `Photo ${current + 1}` : `照片 ${current + 1}`;
  }

  function syncMotion() {
    wall?.classList.toggle('is-paused', pointerInside || keyboardInside || returning.size > 0 || Boolean(viewer?.open) || document.hidden);
  }

  function returnPhoto(immediate = false) {
    if (immediate) {
      for (const previous of [...returning]) previous.finish();
    }
    if (!active) return;
    const previous = active;
    active = null;
    previous.phase = 'shrinking';
    returning.add(previous);
    const sourceIsLifted = () => active?.link === previous.link
      || [...returning].some(other => other !== previous && other.link === previous.link && other.phase === 'shrinking');
    const finish = () => {
      if (previous.finished) return;
      previous.finished = true;
      returning.delete(previous);
      previous.animation?.cancel();
      if (!sourceIsLifted()) previous.link.classList.remove('is-lifted');
      previous.floating.remove();
      syncMotion();
    };
    previous.finish = finish;
    if (immediate || reducedMotion.matches || typeof previous.floating.animate !== 'function') {
      previous.animation?.cancel();
      finish();
      return;
    }
    const transform = window.getComputedStyle(previous.floating).transform;
    previous.animation?.cancel();
    const retreat = previous.floating.animate([
      { transform, opacity: 1 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, outlineColor: 'transparent', boxShadow: '0 0 0 0 transparent' }
    ], { duration: 180, easing: 'cubic-bezier(.3,0,.3,1)', fill: 'forwards' });
    previous.animation = retreat;
    retreat.finished.then(() => {
      if (previous.finished) return;
      // Match the source geometry first, then reveal it behind the fading copy.
      // This also blends into the wall's edge mask instead of switching masks.
      previous.phase = 'handoff';
      if (!sourceIsLifted()) previous.link.classList.remove('is-lifted');
      Object.assign(previous.floating.style, { transform: 'translate(0px, 0px) scale(1)', outlineColor: 'transparent', boxShadow: 'none' });
      retreat.cancel();
      const handoff = previous.floating.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 80, easing: 'linear', fill: 'forwards'
      });
      previous.animation = handoff;
      return handoff.finished;
    }).then(finish, finish);
  }

  function liftPhoto(link) {
    if (active?.link === link || viewer?.open) return;
    returnPhoto();
    const bounds = link.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const source = link.querySelector('img');
    const floating = document.createElement('img');
    floating.className = 'photo-float';
    floating.src = source.currentSrc || source.src;
    floating.alt = '';
    floating.setAttribute('aria-hidden', 'true');
    Object.assign(floating.style, {
      left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`,
      objectPosition: link.style.getPropertyValue('--photo-focus') || 'center'
    });
    document.body.append(floating);
    const scale = Math.min(2.1, (window.innerWidth - 32) / bounds.width, (window.innerHeight - 40) / bounds.height);
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const halfWidth = bounds.width * scale / 2;
    const halfHeight = bounds.height * scale / 2;
    const x = clamp(centerX, 16 + halfWidth, window.innerWidth - 16 - halfWidth) - centerX;
    const y = clamp(centerY, 20 + halfHeight, window.innerHeight - 20 - halfHeight) - centerY;
    const transform = `translate(${x}px, ${y}px) scale(${scale})`;
    floating.style.transform = transform;
    link.classList.add('is-lifted');
    const animation = !reducedMotion.matches && typeof floating.animate === 'function'
      ? floating.animate([
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform, opacity: 1 }
      ], { duration: 270, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' }) : null;
    active = { link, floating, animation };
  }

  function show(index) {
    current = (index + links.length) % links.length;
    const link = links[current];
    image.width = Number(link.dataset.width);
    image.height = Number(link.dataset.height);
    image.src = link.href;
    image.alt = getLanguage() === 'en' ? `Photo ${current + 1}` : `照片 ${current + 1}`;
    position.textContent = `${current + 1} / ${links.length}`;
  }

  function openPhoto(index, trigger) {
    if (!dialogReady) return false;
    returnPhoto(true);
    origin = trigger;
    show(index);
    viewer.showModal();
    document.documentElement.classList.add('photo-viewer-open');
    syncMotion();
    return true;
  }

  function setDurations() {
    wall.querySelectorAll('.photo-track').forEach(track => {
      // One complete group plus its following gap is exactly one loop.
      const distance = track.querySelector('.photo-group').getBoundingClientRect().height + 8;
      track.style.setProperty('--photo-duration', `${Math.max(30, distance / 11)}s`);
    });
  }

  function buildColumns() {
    const count = clamp(Math.round(wall.clientWidth / 120), 2, 6);
    if (count === columnCount) { setDurations(); return; }
    returnPhoto(true);
    columnCount = count;
    const columns = Array.from({ length: count }, (_, columnIndex) => {
      const column = document.createElement('div');
      const track = document.createElement('div');
      const group = document.createElement('div');
      column.className = 'photo-column';
      track.className = 'photo-track';
      group.className = 'photo-group';
      links.forEach((link, index) => { if (index % count === columnIndex) group.append(link); });
      const repeat = group.cloneNode(true);
      repeat.dataset.photoClone = '';
      repeat.setAttribute('aria-hidden', 'true');
      repeat.querySelectorAll('a').forEach(link => { link.tabIndex = -1; });
      track.append(group, repeat);
      column.append(track);
      return column;
    });
    wall.style.setProperty('--photo-columns', String(count));
    wall.replaceChildren(...columns);
    wall.classList.add('is-ready');
    setDurations();
    syncMotion();
  }

  if (wall && links.length) {
    if (dialogReady && openButton) {
      openButton.hidden = false;
      links.forEach(link => { link.tabIndex = -1; });
      openButton.addEventListener('click', () => openPhoto(current, openButton));
    }
    buildColumns();
    const resize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        returnPhoto(true);
        buildColumns();
      });
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(wall);
    window.addEventListener('resize', resize);
    wall.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch' || !hoverPointer.matches) return;
      pointerInside = true;
      syncMotion();
    });
    const pointToPhoto = event => {
      if (event.pointerType === 'touch' || !hoverPointer.matches) return;
      pointerInside = true;
      syncMotion();
      const link = event.target.closest('.photo-link');
      if (link && wall.contains(link)) liftPhoto(link);
      else returnPhoto();
    };
    wall.addEventListener('pointerover', pointToPhoto);
    wall.addEventListener('pointermove', pointToPhoto);
    wall.addEventListener('pointerleave', () => {
      pointerInside = false;
      returnPhoto();
      syncMotion();
    });
    gallery.addEventListener('focusin', event => {
      if (!event.target.matches(':focus-visible')) return;
      keyboardInside = true;
      syncMotion();
    });
    gallery.addEventListener('focusout', event => {
      if (gallery.contains(event.relatedTarget)) return;
      keyboardInside = false;
      syncMotion();
    });
    wall.addEventListener('click', event => {
      const link = event.target.closest('.photo-link');
      if (!link || !wall.contains(link) || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (openPhoto(Number(link.dataset.photoIndex), link)) event.preventDefault();
    });
    window.addEventListener('scroll', () => returnPhoto(true), { passive: true });
    wall.addEventListener('scroll', () => returnPhoto(true), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pointerInside = false; returnPhoto(true); }
      syncMotion();
    });
    reducedMotion.addEventListener('change', () => { returnPhoto(true); syncMotion(); });
  }

  if (dialogReady) {
    viewer.querySelector('[data-photo-close]').addEventListener('click', () => viewer.close());
    viewer.querySelector('[data-photo-previous]').addEventListener('click', () => show(current - 1));
    viewer.querySelector('[data-photo-next]').addEventListener('click', () => show(current + 1));
    viewer.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      show(current + (event.key === 'ArrowRight' ? 1 : -1));
    });
    viewer.addEventListener('click', event => {
      if (event.target !== viewer) return;
      const bounds = viewer.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) viewer.close();
    });
    viewer.addEventListener('close', () => {
      document.documentElement.classList.remove('photo-viewer-open');
      (origin?.isConnected ? origin : openButton)?.focus({ preventScroll: true });
      syncMotion();
    });
  }
  return { updateLanguage };
}
