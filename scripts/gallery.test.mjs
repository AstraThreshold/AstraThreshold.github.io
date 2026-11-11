import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initGallery } from '../gallery.js';

// Exercise the event handlers without a browser or network requests.
class Element extends EventTarget {
  attributes = new Map();
  children = new Map();
  dataset = {};
  setAttribute(name, value) { this.attributes.set(name, value); }
  querySelector(selector) { return this.children.get(selector); }
  focus(options) { this.focusOptions = options; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  getBoundingClientRect() { return { left: 20, right: 980, top: 20, bottom: 700 }; }
}

function fixture({ dialogSupported = true } = {}) {
  const ids = Object.fromEntries(['photo-viewer', 'photo-viewer-image', 'photo-viewer-caption', 'photo-viewer-count'].map(id => [id, new Element()]));
  const viewer = ids['photo-viewer'];
  if (!dialogSupported) viewer.showModal = undefined;
  for (const name of ['close', 'previous', 'next']) viewer.children.set(`[data-photo-${name}]`, new Element());
  const links = ['相机', '工作台', '电路板'].map((captionZh, index) => {
    const link = new Element();
    link.href = `https://example.test/photo-${index}.webp`;
    link.dataset = { captionZh, captionEn: ['Camera', 'Workbench', 'Circuit board'][index], width: '1600', height: '1200' };
    link.children.set('img', new Element());
    return link;
  });
  const classes = new Set();
  globalThis.document = {
    querySelectorAll: () => links,
    getElementById: id => ids[id],
    documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } }
  };
  let language = 'zh';
  const gallery = initGallery(() => language);
  return { links, viewer, image: ids['photo-viewer-image'], caption: ids['photo-viewer-caption'], count: ids['photo-viewer-count'], classes,
    translate(value) { language = value; gallery.updateLanguage(); } };
}

function fire(element, type, values = {}) {
  const event = Object.assign(new Event(type, { cancelable: true }), { button: 0, ...values });
  element.dispatchEvent(event);
  return event;
}

test('photos load on demand and navigation wraps in both directions', () => {
  const f = fixture();
  assert.equal(f.image.src, undefined);
  assert.equal(fire(f.links[0], 'click').defaultPrevented, true);
  assert.equal(f.viewer.open, true);
  assert.equal(f.image.src, f.links[0].href);
  assert.equal(f.count.textContent, '1 / 3');
  assert.deepEqual([f.image.width, f.image.height], [1600, 1200]);
  fire(f.viewer.querySelector('[data-photo-previous]'), 'click');
  assert.equal(f.image.src, f.links[2].href);
  fire(f.viewer, 'keydown', { key: 'ArrowRight' });
  assert.equal(f.count.textContent, '1 / 3');
  fire(f.viewer.querySelector('[data-photo-next]'), 'click');
  assert.equal(f.count.textContent, '2 / 3');
  fire(f.viewer, 'keydown', { key: 'ArrowLeft' });
  assert.equal(f.count.textContent, '1 / 3');
  assert.equal(fire(f.viewer, 'keydown', { key: 'Tab' }).defaultPrevented, false);
});

test('language changes update thumbnail labels and the open photo', () => {
  const f = fixture();
  fire(f.links[1], 'click');
  assert.equal(f.caption.textContent, '工作台');
  f.translate('en');
  assert.equal(f.caption.textContent, 'Workbench');
  assert.equal(f.image.alt, 'Workbench');
  assert.equal(f.links[0].querySelector('img').alt, 'Camera');
  assert.equal(f.links[0].attributes.get('aria-label'), 'View photo: Camera');
  f.translate('zh');
  assert.equal(f.image.alt, '工作台');
});

test('close and backdrop clicks unlock scrolling and return focus', () => {
  const f = fixture();
  fire(f.links[2], 'click');
  assert.equal(f.classes.has('photo-viewer-open'), true);
  fire(f.viewer, 'click', { clientX: 100, clientY: 100 });
  assert.equal(f.viewer.open, true);
  fire(f.viewer, 'click', { clientX: 0, clientY: 0 });
  assert.equal(f.viewer.open, false);
  assert.equal(f.classes.size, 0);
  assert.deepEqual(f.links[2].focusOptions, { preventScroll: true });
  fire(f.links[0], 'click');
  fire(f.viewer.querySelector('[data-photo-close]'), 'click');
  assert.equal(f.viewer.open, false);
  assert.deepEqual(f.links[0].focusOptions, { preventScroll: true });
});

test('modified clicks and unsupported dialogs preserve ordinary image links', () => {
  const f = fixture();
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal(fire(f.links[0], 'click', modifier).defaultPrevented, false);
  }
  assert.equal(f.image.src, undefined);
  const fallback = fixture({ dialogSupported: false });
  assert.equal(fire(fallback.links[0], 'click').defaultPrevented, false);
  assert.equal(fallback.links[0].attributes.has('aria-haspopup'), false);
  fallback.translate('en');
  assert.equal(fallback.links[0].querySelector('img').alt, 'Camera');
  delete globalThis.document;
});
