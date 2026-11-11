export function initGallery(getLanguage) {
  const links = [...document.querySelectorAll('.photo-link')];
  const viewer = document.getElementById('photo-viewer');
  const image = document.getElementById('photo-viewer-image');
  const caption = document.getElementById('photo-viewer-caption');
  const position = document.getElementById('photo-viewer-count');
  let current = 0;
  let origin = null;

  const description = link => getLanguage() === 'en' ? link.dataset.captionEn : link.dataset.captionZh;

  function updateLanguage() {
    links.forEach(link => {
      const label = description(link);
      link.querySelector('img').alt = label;
      link.setAttribute('aria-label', getLanguage() === 'en' ? `View photo: ${label}` : `查看照片：${label}`);
    });
    if (viewer?.open) {
      caption.textContent = description(links[current]);
      image.alt = description(links[current]);
    }
  }

  function show(index) {
    current = (index + links.length) % links.length;
    const link = links[current];
    image.width = Number(link.dataset.width);
    image.height = Number(link.dataset.height);
    image.src = link.href;
    image.alt = description(link);
    caption.textContent = description(link);
    position.textContent = `${current + 1} / ${links.length}`;
  }

  if (links.length && viewer && image && caption && position && typeof viewer.showModal === 'function') {
    links.forEach((link, index) => {
      link.setAttribute('aria-haspopup', 'dialog');
      link.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        origin = link;
        show(index);
        viewer.showModal();
        document.documentElement.classList.add('photo-viewer-open');
      });
    });
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
      origin?.focus({ preventScroll: true });
    });
  }
  return { updateLanguage };
}
