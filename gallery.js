const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function initGallery(getLanguage) {
  const gallery = document.getElementById('gallery');
  const wall = gallery?.querySelector('[data-photo-wall]');
  const links = [...(wall?.querySelectorAll('.photo-link') || [])]
    .sort((a, b) => Number(a.dataset.photoIndex) - Number(b.dataset.photoIndex));
  const openButton = gallery?.querySelector('[data-gallery-open]');
  const viewer = document.getElementById('photo-viewer');
  let image = document.getElementById('photo-viewer-image');
  const position = document.getElementById('photo-viewer-count');
  const dialogReady = links.length && viewer && image && position && typeof viewer.showModal === 'function';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let current = 0;
  let imageRequest = 0;
  let motionVersion = 0, viewerMotions = [], closing = false;
  let origin = null;
  let pointerInside = false;
  let keyboardInside = false;
  let resizeFrame = null;
  let columnCount = 0;
  let active = null;
  let pointer = null;
  const returning = new Set();
  const magneticPhoto = () => wall?.querySelector('.photo-link[data-cursor-magnet]');

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
    wall?.classList.toggle('is-paused', pointerInside || keyboardInside || Boolean(magneticPhoto()) || returning.size > 0 || Boolean(viewer?.open) || document.hidden);
  }

  function returnPhoto(immediate = false) {
    if (immediate) {
      for (const previous of [...returning]) previous.finish();
    }
    if (!active) return;
    const previous = active;
    active = null;
    previous.phase = 'shrinking';
    previous.floating.style.translate = '0px 0px';
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
    movePhoto();
  }

  function movePhoto() {
    if (!active || !pointer || reducedMotion.matches || viewer?.open) return;
    const box = active.link.getBoundingClientRect();
    const x = clamp((pointer.x - box.left - box.width / 2) * .035, -3, 3);
    const y = clamp((pointer.y - box.top - box.height / 2) * .035, -3, 3);
    active.floating.style.translate = `${x}px ${y}px`;
  }

  function show(index) {
    stopViewerMotion();
    current = (index + links.length) % links.length;
    const request = ++imageRequest;
    const link = links[current];
    const thumbnail = link.querySelector('img');
    // A reused img can keep painting its old bitmap while a new URL loads.
    // Start with a fresh element and the requested photo's existing thumbnail.
    const preview = document.createElement('img');
    Object.assign(preview, {
      id: image.id, className: image.className, decoding: 'async',
      width: Number(link.dataset.width), height: Number(link.dataset.height),
      alt: getLanguage() === 'en' ? `Photo ${current + 1}` : `照片 ${current + 1}`
    });
    preview.style.width = `${preview.width}px`;
    preview.style.aspectRatio = `${preview.width} / ${preview.height}`;
    preview.src = thumbnail?.currentSrc || thumbnail?.src || link.href;
    image.replaceWith(preview);
    image = preview;
    position.textContent = `${current + 1} / ${links.length}`;
    viewer.setAttribute('aria-busy', 'true');
    const isCurrent = () => request === imageRequest && image === preview && viewer.open;
    const settle = () => { if (isCurrent()) viewer.setAttribute('aria-busy', 'false'); };
    const full = document.createElement('img');
    full.decoding = 'async';
    full.addEventListener('load', async () => {
      try { if (typeof full.decode === 'function') await full.decode(); }
      catch { settle(); return; }
      if (isCurrent()) preview.src = link.href;
      settle();
    }, { once: true });
    full.addEventListener('error', settle, { once: true });
    full.src = link.href;
  }

  function openPhoto(index, trigger) {
    if (!dialogReady) return false;
    const start = active?.link === trigger ? active.floating.getBoundingClientRect() : photoBox(trigger);
    viewer.style.setProperty('--viewer-backdrop-start', backdropClip(start));
    returnPhoto(true);
    origin = trigger;
    show(index);
    if (!viewer.open) viewer.showModal();
    viewer.style.setProperty('--viewer-panel-start', panelTransform(start));
    document.documentElement.classList.add('photo-viewer-open');
    syncMotion();
    animateViewer(start, false);
    return true;
  }

  function stopViewerMotion() {
    motionVersion++;
    viewerMotions.forEach(animation => animation.cancel()); viewerMotions = [];
    closing = false;
    viewer?.classList.remove('is-closing', 'is-animating');
  }

  function photoBox(link) {
    if (!link?.matches('.photo-link') || !link.isConnected) return null;
    const box = link.getBoundingClientRect(), clip = wall.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.right > Math.max(0, clip.left) && box.left < Math.min(window.innerWidth, clip.right)
      && box.bottom > Math.max(0, clip.top) && box.top < Math.min(window.innerHeight, clip.bottom) ? box : null;
  }

  function pictureBox() {
    const box = image.getBoundingClientRect();
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    const scale = Math.min(box.width / width, box.height / height);
    return { left: box.left + (box.width - width * scale) / 2, top: box.top + (box.height - height * scale) / 2,
      width: width * scale, height: height * scale };
  }

  function photoTransform(target) {
    if (!target) return 'scale(.94)';
    const box = pictureBox();
    const scale = Math.max(.04, Math.min(target.width / box.width, target.height / box.height));
    return `translate(${target.left + target.width / 2 - box.left - box.width / 2}px, ${target.top + target.height / 2 - box.top - box.height / 2}px) scale(${scale})`;
  }

  function backdropClip(box) {
    if (!box) return 'inset(3% 3% 3% 3% round 8px)';
    const top = clamp(box.top, 0, window.innerHeight), left = clamp(box.left, 0, window.innerWidth);
    const right = Math.max(0, window.innerWidth - box.left - box.width), bottom = Math.max(0, window.innerHeight - box.top - box.height);
    return `inset(${top}px ${right}px ${bottom}px ${left}px round 4px)`;
  }

  function panelTransform(target) {
    if (!target) return 'scale(.94)';
    const box = viewer.getBoundingClientRect();
    return `translate(${target.left + target.width / 2 - box.left - box.width / 2}px, ${target.top + target.height / 2 - box.top - box.height / 2}px) scale(${target.width / box.width}, ${target.height / box.height})`;
  }

  function animateViewer(target, retreat, from = 'none', chromeOpacity) {
    const version = motionVersion;
    if (reducedMotion.matches || typeof image.animate !== 'function') { if (retreat) viewer.close(); return; }
    const duration = retreat ? 220 : 300, easing = 'cubic-bezier(.2,.75,.25,1)';
    viewer.classList.add('is-animating');
    const transform = photoTransform(target);
    const motion = image.animate(retreat ? [{ transform: from, opacity: 1 }, { transform, opacity: 0 }]
      : [{ transform, opacity: 1 }, { transform: 'none', opacity: 1 }], { duration, easing, fill: 'both' });
    viewerMotions = [motion];
    for (const element of [viewer.querySelector('.photo-viewer-bar'), viewer.querySelector('.photo-viewer-footer')].filter(Boolean)) {
      viewerMotions.push(element.animate([{ opacity: retreat ? (chromeOpacity?.get(element) ?? 1) : 0 }, { opacity: retreat ? 0 : 1 }], { duration, easing, fill: 'both' }));
    }
    motion.finished.then(() => {
      if (version !== motionVersion) return;
      if (retreat && viewer.open) viewer.close();
      else stopViewerMotion();
    }, () => {});
  }

  function closePhoto() {
    if (!viewer.open || closing) return;
    const from = window.getComputedStyle(image).transform || 'none';
    const shade = window.getComputedStyle(viewer, '::backdrop');
    const backdrop = shade.backgroundColor || '#100d0be6';
    const clip = shade.clipPath;
    const panel = window.getComputedStyle(viewer, '::before'), panelCurrent = panel.transform || 'none', panelOpacity = panel.opacity || '1';
    const chromeOpacity = new Map([viewer.querySelector('.photo-viewer-bar'), viewer.querySelector('.photo-viewer-footer')].filter(Boolean).map(element => [element, Number(window.getComputedStyle(element).opacity)]));
    stopViewerMotion(); closing = true; imageRequest++;
    viewer.style.setProperty('--viewer-backdrop-from', backdrop);
    viewer.style.setProperty('--viewer-backdrop-current', clip && clip !== 'none' ? clip : 'inset(0px 0px 0px 0px round 0px)');
    viewer.style.setProperty('--viewer-panel-current', panelCurrent);
    viewer.style.setProperty('--viewer-panel-opacity', panelOpacity);
    const link = origin?.matches('.photo-link') && Number(origin.dataset.photoIndex) === current ? origin
      : [...wall.querySelectorAll('.photo-link')].find(link => Number(link.dataset.photoIndex) === current && photoBox(link));
    viewer.style.setProperty('--viewer-backdrop-end', backdropClip(photoBox(link)));
    viewer.style.setProperty('--viewer-panel-end', panelTransform(photoBox(link)));
    viewer.classList.add('is-closing');
    animateViewer(photoBox(link), true, from, chromeOpacity);
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
      const link = document.documentElement.classList.contains('has-adaptive-cursor') ? magneticPhoto() : event.target.closest('.photo-link');
      if (link && wall.contains(link)) liftPhoto(link);
      else returnPhoto();
    };
    wall.addEventListener('pointerover', pointToPhoto);
    wall.addEventListener('pointermove', pointToPhoto);
    document.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || !hoverPointer.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      movePhoto();
    }, { passive: true });
    wall.addEventListener('pointerleave', () => {
      pointerInside = false;
      if (!magneticPhoto()) returnPhoto();
      syncMotion();
    });
    document.addEventListener('adaptive-cursor-change', () => {
      if (!viewer?.open) {
        const link = magneticPhoto() || (!document.documentElement.classList.contains('has-adaptive-cursor') && wall.querySelector('.photo-link:hover'));
        if (link) liftPhoto(link);
        else returnPhoto();
      }
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
    reducedMotion.addEventListener('change', () => {
      returnPhoto(true);
      if (reducedMotion.matches) { const finish = closing; stopViewerMotion(); if (finish && viewer?.open) viewer.close(); }
      syncMotion();
    });
  }

  if (dialogReady) {
    viewer.querySelector('[data-photo-close]').addEventListener('click', closePhoto);
    viewer.querySelector('[data-photo-previous]').addEventListener('click', () => { if (!closing) show(current - 1); });
    viewer.querySelector('[data-photo-next]').addEventListener('click', () => { if (!closing) show(current + 1); });
    viewer.addEventListener('cancel', event => { event.preventDefault(); closePhoto(); });
    viewer.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      if (!closing) show(current + (event.key === 'ArrowRight' ? 1 : -1));
    });
    viewer.addEventListener('click', event => {
      if (event.target === image) {
        const box = pictureBox();
        if (event.clientX >= box.left && event.clientX <= box.left + box.width && event.clientY >= box.top && event.clientY <= box.top + box.height) return;
      } else if (!event.target.matches('.photo-viewer, .photo-viewer-bar, .photo-viewer-footer, .photo-viewer-controls')) return;
      closePhoto();
    });
    viewer.addEventListener('close', () => {
      // A queued close event may arrive after another photo has reopened it.
      if (viewer.open) return;
      stopViewerMotion();
      imageRequest++;
      viewer.setAttribute('aria-busy', 'false');
      document.documentElement.classList.remove('photo-viewer-open');
      (origin?.isConnected ? origin : openButton)?.focus({ preventScroll: true });
      syncMotion();
    });
  }
  return { updateLanguage };
}
