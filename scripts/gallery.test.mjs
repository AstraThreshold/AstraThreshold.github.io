import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initGallery } from '../gallery.js';

// A small DOM adapter keeps these interaction checks dependency-free.
// Layout, compositor animation and native dialog behavior need browser review.
function fixture({ dialogSupported = true, reduce = false, hover = true } = {}) {
  const animations = [];
  class Element extends EventTarget {
    constructor(tag = 'div') {
      super(); this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map();
      this.style = { setProperty(name, value) { this[name] = value; }, getPropertyValue(name) { return this[name] || ''; } };
      this.className = ''; this.parent = null; this.hidden = false;
      this.bounds = { left: 1140, top: 200, width: 120, height: 100, right: 1260, bottom: 300 };
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        add: name => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
        remove: name => { this.className = this.className.split(' ').filter(item => item !== name).join(' '); },
        toggle: (name, value) => { this.classList[value ? 'add' : 'remove'](name); }
      };
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    matches(selector) {
      if (selector === ':focus-visible') return Boolean(this.focusVisible);
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('[')) return this.attributes.has(selector.slice(1, -1));
      return this.tagName === selector;
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
    contains(element) { return Boolean(element && (element === this || this.children.some(child => child.contains(element)))); }
    append(...children) {
      children.forEach(child => { child.remove(); this.children.push(child); child.parent = this; });
    }
    replaceChildren(...children) { this.children.forEach(child => { child.parent = null; }); this.children = []; this.append(...children); }
    replaceWith(element) {
      const parent = this.parent, index = parent.children.indexOf(this);
      element.remove(); parent.children.splice(index, 1, element); element.parent = parent; this.parent = null;
    }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    cloneNode(deep) {
      const clone = new Element(this.tagName);
      Object.assign(clone, { className: this.className, dataset: { ...this.dataset }, attributes: new Map(this.attributes), href: this.href, src: this.src });
      Object.assign(clone.style, this.style);
      if (deep) clone.append(...this.children.map(child => child.cloneNode(true)));
      return clone;
    }
    get isConnected() { return this === body || Boolean(this.parent?.isConnected); }
    getBoundingClientRect() { return this.className === 'photo-group' ? { ...this.bounds, height: this.children.length * 108 } : this.bounds; }
    focus(options) { this.focusOptions = options; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    animate(frames, options) {
      let finish;
      const animation = { frames, options, finished: new Promise(resolve => { finish = resolve; }), cancel() { this.cancelled = true; }, finish() { finish(); } };
      animations.push(animation); return animation;
    }
  }
  const body = new Element('body');
  const root = new Element('html');
  root.append(body);
  const gallery = new Element();
  const wall = new Element();
  wall.setAttribute('data-photo-wall', ''); wall.clientWidth = 260;
  const openButton = new Element('button');
  openButton.setAttribute('data-gallery-open', ''); openButton.hidden = true;
  gallery.append(openButton, wall); body.append(gallery);
  const links = Array.from({ length: 7 }, (_, index) => {
    const link = new Element('a');
    link.className = 'photo-link'; link.href = `https://example.test/photo-${index}.webp`;
    link.dataset = { photoIndex: String(index), width: '1600', height: '1200' };
    const thumbnail = new Element('img'); thumbnail.src = `https://example.test/thumb-${index}.webp`;
    link.append(thumbnail); return link;
  });
  wall.append(...links);
  const viewer = new Element('dialog');
  if (!dialogSupported) viewer.showModal = undefined;
  for (const name of ['close', 'previous', 'next']) {
    const button = new Element('button'); button.setAttribute(`data-photo-${name}`, ''); viewer.append(button);
  }
  const image = new Element('img'); image.id = 'photo-viewer-image'; image.className = 'photo-viewer-image'; const count = new Element();
  viewer.append(image, count); body.append(viewer);
  const ids = { gallery, 'photo-viewer': viewer, 'photo-viewer-image': image, 'photo-viewer-count': count };
  const created = [];
  const doc = Object.assign(new EventTarget(), { getElementById: id => ids[id], createElement: tag => { const element = new Element(tag); created.push(element); return element; }, body, documentElement: root, hidden: false });
  const reduced = Object.assign(new EventTarget(), { matches: reduce });
  const timers = new Map(); const frames = new Map(); let sequence = 0;
  const win = Object.assign(new EventTarget(), {
    innerWidth: 1280, innerHeight: 800,
    matchMedia: query => query.includes('reduced-motion') ? reduced : { matches: hover },
    getComputedStyle: element => ({ transform: element.style.transform || 'none' }),
    setTimeout: callback => { const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { const id = ++sequence; frames.set(id, callback); return id; }
  });
  globalThis.window = win; globalThis.document = doc;
  let language = 'zh';
  const controller = initGallery(() => language);
  return { body, root, gallery, wall, links, viewer, get image() { return viewer.querySelector('img'); }, count, openButton, win, doc, reduced, animations, created,
    translate(value) { language = value; controller.updateLanguage(); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    resize(width) { wall.clientWidth = width; win.dispatchEvent(new Event('resize')); const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    async finishAnimations() {
      for (let pass = 0; pass < 5; pass++) {
        animations.forEach(animation => animation.finish());
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      }
    }
  };
}

function fire(element, type, values = {}, target = element) {
  const event = Object.assign(new Event(type, { cancelable: true }), { button: 0, pointerType: 'mouse', ...values });
  Object.defineProperty(event, 'target', { value: target });
  element.dispatchEvent(event);
  return event;
}

test('responsive columns retain every photo and repeated copies stay out of keyboard navigation', () => {
  const f = fixture();
  assert.equal(f.wall.querySelectorAll('.photo-column').length, 2);
  assert.equal(f.wall.querySelectorAll('.photo-link').length, 14);
  for (const width of [720, 360, 260]) {
    f.resize(width);
    const originals = f.wall.querySelectorAll('.photo-link').filter(link => f.links.includes(link));
    assert.equal(new Set(originals).size, 7);
    assert.equal(f.wall.querySelectorAll('.photo-link').length, 14);
    assert.equal(f.wall.querySelectorAll('.photo-column').length, Math.min(6, Math.max(2, Math.round(width / 120))));
    f.wall.querySelectorAll('.photo-link').filter(link => !f.links.includes(link)).forEach(link => assert.equal(link.tabIndex, -1));
  }
});

test('hover pauses the wall, lifts outside its mask, then returns before resuming', async () => {
  const f = fixture();
  fire(f.wall, 'pointerenter');
  fire(f.wall, 'pointerover', {}, f.links[0].querySelector('img'));
  assert.equal(f.wall.classList.contains('is-paused'), true);
  const floating = f.body.querySelector('.photo-float');
  assert.ok(floating && !f.wall.contains(floating));
  assert.equal(f.links[0].classList.contains('is-lifted'), true);
  const transform = floating.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
  const [, x, , scale] = transform.map(Number);
  assert.ok(1200 + x + 60 * scale <= f.win.innerWidth - 16);
  fire(f.wall, 'pointerleave');
  assert.equal(f.wall.classList.contains('is-paused'), true);
  await f.finishAnimations();
  assert.equal(f.body.querySelector('.photo-float'), null);
  assert.equal(f.links[0].classList.contains('is-lifted'), false);
  f.flushTimers();
  assert.equal(f.wall.classList.contains('is-paused'), false);
});

test('fast pointer changes and reentry do not leave blank photos or resume underneath the pointer', async () => {
  const f = fixture();
  fire(f.wall, 'pointerover', {}, f.links[0]);
  fire(f.wall, 'pointerover', {}, f.links[1]);
  fire(f.wall, 'pointerover', {}, f.links[0]);
  await f.finishAnimations();
  assert.equal(f.body.querySelectorAll('.photo-float').length, 1);
  assert.equal(f.links[0].classList.contains('is-lifted'), true);
  assert.equal(f.links[1].classList.contains('is-lifted'), false);
  fire(f.wall, 'pointerleave');
  fire(f.wall, 'pointerenter');
  f.flushTimers();
  assert.equal(f.wall.classList.contains('is-paused'), true);
  await f.finishAnimations();
});

test('the source is revealed behind the returned copy before it fades away and the film resumes', async () => {
  const f = fixture();
  fire(f.wall, 'pointerover', {}, f.links[0]);
  fire(f.wall, 'pointerleave');
  const floating = f.body.querySelector('.photo-float');
  assert.equal(f.links[0].classList.contains('is-lifted'), true);
  f.animations.at(-1).finish();
  await Promise.resolve();
  assert.equal(f.links[0].classList.contains('is-lifted'), false);
  assert.equal(floating.isConnected, true);
  assert.equal(f.wall.classList.contains('is-paused'), true);
  await f.finishAnimations();
  assert.equal(floating.isConnected, false);
  assert.equal(f.wall.classList.contains('is-paused'), false);
});

test('clicking a repeated photo opens its thumbnail and upgrades to the correct original; navigation wraps', async () => {
  const f = fixture();
  const repeat = f.wall.querySelectorAll('.photo-link').find(link => !f.links.includes(link) && link.dataset.photoIndex === '6');
  assert.equal(f.image.src, undefined);
  assert.equal(fire(f.wall, 'click', { ctrlKey: true }, repeat).defaultPrevented, false);
  assert.equal(fire(f.wall, 'click', {}, repeat).defaultPrevented, true);
  assert.equal(f.viewer.open, true);
  assert.equal(f.image.src, f.links[6].querySelector('img').src);
  fire(f.created.at(-1), 'load');
  await Promise.resolve();
  assert.equal(f.image.src, f.links[6].href);
  assert.equal(f.count.textContent, '7 / 7');
  fire(f.viewer, 'keydown', { key: 'ArrowRight' });
  assert.equal(f.count.textContent, '1 / 7');
  fire(f.viewer.querySelector('[data-photo-previous]'), 'click');
  assert.equal(f.count.textContent, '7 / 7');
  f.translate('en');
  assert.equal(f.image.alt, 'Photo 7');
  assert.equal(repeat.attributes.get('aria-label'), 'View photo 7 of 7');
  fire(f.viewer.querySelector('[data-photo-close]'), 'click');
  assert.equal(f.viewer.open, true);
  await f.finishAnimations();
  assert.equal(f.root.classList.contains('photo-viewer-open'), false);
  assert.deepEqual(repeat.focusOptions, { preventScroll: true });
});

test('late completions and failed large images preserve the currently selected preview', async () => {
  const f = fixture();
  fire(f.wall, 'click', {}, f.links[0]);
  const first = f.image, firstRequest = f.created.at(-1);
  f.viewer.close();
  fire(f.wall, 'click', {}, f.links[1]);
  const second = f.image, secondRequest = f.created.at(-1);
  assert.notEqual(second, first);
  fire(firstRequest, 'load');
  await Promise.resolve();
  assert.equal(f.image, second);
  assert.equal(f.image.src, f.links[1].querySelector('img').src);
  assert.equal(f.viewer.attributes.get('aria-busy'), 'true');
  fire(secondRequest, 'error');
  assert.equal(f.image.src, f.links[1].querySelector('img').src);
  assert.equal(f.viewer.attributes.get('aria-busy'), 'false');
});

test('an old decode finishing after navigation cannot overwrite the new photo', async () => {
  const f = fixture();
  fire(f.wall, 'click', {}, f.links[0]);
  const firstRequest = f.created.at(-1);
  let decoded;
  firstRequest.decode = () => new Promise(resolve => { decoded = resolve; });
  fire(firstRequest, 'load');
  fire(f.viewer.querySelector('[data-photo-next]'), 'click');
  const second = f.image;
  decoded(); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.image, second);
  assert.equal(f.image.src, f.links[1].querySelector('img').src);
  assert.equal(f.viewer.attributes.get('aria-busy'), 'true');
  const secondRequest = f.created.at(-1);
  fire(secondRequest, 'load'); await Promise.resolve();
  assert.equal(f.image.src, f.links[1].href);
  assert.equal(f.viewer.attributes.get('aria-busy'), 'false');
});

test('keyboard entry, reduced motion, touch and background changes preserve usable photo access', () => {
  const f = fixture({ reduce: true });
  f.openButton.focusVisible = true;
  fire(f.gallery, 'focusin', {}, f.openButton);
  assert.equal(f.wall.classList.contains('is-paused'), true);
  fire(f.openButton, 'click');
  assert.equal(f.image.src, f.links[0].querySelector('img').src);
  f.viewer.close();
  assert.deepEqual(f.openButton.focusOptions, { preventScroll: true });
  fire(f.wall, 'pointerover', { pointerType: 'touch' }, f.links[0]);
  assert.equal(f.body.querySelector('.photo-float'), null);
  fire(f.wall, 'pointerover', {}, f.links[1]);
  assert.equal(f.animations.length, 0);
  fire(f.wall, 'scroll');
  assert.equal(f.body.querySelector('.photo-float'), null);
  f.doc.hidden = true; fire(f.doc, 'visibilitychange');
  assert.equal(f.wall.classList.contains('is-paused'), true);
});

test('unsupported dialogs preserve native image links', () => {
  const f = fixture({ dialogSupported: false });
  assert.equal(f.openButton.hidden, true);
  assert.equal(fire(f.wall, 'click', {}, f.links[0]).defaultPrevented, false);
  assert.equal(f.links[0].tabIndex, undefined);
  delete globalThis.window; delete globalThis.document;
});
