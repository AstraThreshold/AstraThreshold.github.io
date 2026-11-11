// Each place value is a clipped vertical reel, rather than a changing text node.
export class RollingCounter {
  constructor(element, motionPreference) {
    this.element = element;
    this.motionPreference = motionPreference;
    this.target = null;
    this.animations = [];
    this.generation = 0;
    element?.classList.add('rolling-counter');
    element?.setAttribute('aria-hidden', 'true');
  }

  render(value, { animate = false } = {}) {
    if (!this.element || !Number.isSafeInteger(value) || value < 0) return;
    this.target = value;
    this.element.dataset.value = String(value);
    if (this.motionPreference.matches || document.hidden) return this.finish();
    if (animate) return this.roll(0, value);
    // A fetch may finish during the opening roll. Let it settle before retargeting.
    if (this.animations.length) return;
    this.show(value);
  }

  show(value) {
    this.element.textContent = value.toLocaleString('en-US');
    this.element.dataset.rolling = 'false';
  }

  finish() {
    this.generation++;
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    if (this.target !== null) this.show(this.target);
  }

  roll(from, to, short = false) {
    this.finish();
    const generation = this.generation;
    const formatted = to.toLocaleString('en-US');
    const digits = String(from).padStart(String(to).length, '0').slice(-String(to).length);
    const fragment = document.createDocumentFragment();
    const reels = [];
    let place = 0;

    for (const character of formatted) {
      if (character === ',') {
        const separator = document.createElement('span');
        separator.className = 'counter-separator';
        separator.textContent = character;
        fragment.append(separator);
        continue;
      }
      const start = Number(digits[place] || 0);
      const destination = Number(character);
      const steps = (short ? 10 : 20) + (destination - start + 10) % 10;
      const reel = document.createElement('span');
      reel.className = 'counter-reel';
      const track = document.createElement('span');
      track.className = 'counter-track';
      for (let step = 0; step <= steps; step++) {
        const digit = document.createElement('span');
        digit.className = 'counter-digit';
        digit.textContent = String((start + step) % 10);
        track.append(digit);
      }
      reel.append(track);
      fragment.append(reel);
      reels.push({ track, steps, place: place++ });
    }
    this.element.replaceChildren(fragment);
    this.element.dataset.rolling = 'true';
    try {
      this.animations = reels.map(({ track, steps, place }) => track.animate([
        { transform: 'translateY(0)' },
        { transform: `translateY(-${steps * 1.2}em)` }
      ], {
        duration: short ? 650 : 1250,
        delay: place * (short ? 35 : 85),
        easing: 'cubic-bezier(.16,.68,.22,1)',
        fill: 'both'
      }));
      Promise.all(this.animations.map(animation => animation.finished)).then(() => {
        if (generation !== this.generation) return;
        if (this.target !== to && !this.motionPreference.matches && !document.hidden) {
          this.roll(to, this.target, true);
        } else this.finish();
      }).catch(() => { /* Cancellation is expected on replay or reduced motion. */ });
    } catch {
      // Older browsers retain the verified reading without an animation.
      this.finish();
    }
  }
}
