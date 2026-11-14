const storageKey = 'wooolab-theme';
const duration = 360;

export function initTheme(getLanguage) {
  const root = document.documentElement, button = document.querySelector('[data-theme-toggle]');
  const system = matchMedia('(prefers-color-scheme: dark)'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let preference, desired = root.dataset.theme || (system.matches ? 'dark' : 'light');
  let transition, timer, sequence = 0;
  try { preference = localStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
  if (!['light', 'dark'].includes(preference)) preference = null;
  root.style.removeProperty('background-color'); root.style.removeProperty('color-scheme');

  function updateLabel() {
    if (!button) return;
    const dark = root.dataset.theme === 'dark', english = getLanguage() === 'en';
    button.setAttribute('aria-label', english ? 'Toggle color theme' : '切换深浅色模式');
    button.setAttribute('aria-pressed', String(dark));
    button.title = english ? `Switch to ${dark ? 'light' : 'dark'} mode` : `切换为${dark ? '浅' : '深'}色模式`;
  }

  function updateMeta() {
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => { meta.content = paper; meta.removeAttribute('media'); });
  }

  function change(next) {
    if (next === desired && root.dataset.theme === next) return;
    desired = next;
    const id = ++sequence, animate = !reduced.matches && !document.hidden;
    const crossfade = animate && typeof document.startViewTransition === 'function';
    transition?.skipTransition(); clearTimeout(timer); root.classList.remove('theme-changing');
    const apply = () => {
      if (id !== sequence) return;
      document.dispatchEvent(new Event('site-theme-before-change'));
      if (animate && !crossfade) {
        root.classList.add('theme-changing');
        getComputedStyle(document.body).backgroundColor;
      }
      root.dataset.theme = next;
      updateLabel(); updateMeta();
      document.dispatchEvent(new CustomEvent('site-theme-change', { detail: { duration: animate && !crossfade ? duration : 0 } }));
      if (animate && !crossfade) timer = setTimeout(() => root.classList.remove('theme-changing'), duration + 50);
    };
    if (crossfade) {
      transition = document.startViewTransition(apply);
      transition.finished.catch(() => {});
    } else apply();
  }

  button?.addEventListener('click', () => {
    preference = desired === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(storageKey, preference); } catch { /* Storage is optional. */ }
    change(preference);
  });
  system.addEventListener('change', () => { if (!preference) change(system.matches ? 'dark' : 'light'); });
  addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
    change(preference || (system.matches ? 'dark' : 'light'));
  });
  updateLabel(); updateMeta();
  if (button) button.hidden = false;
  return { updateLabel };
}
