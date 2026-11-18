// SPDX-License-Identifier: GPL-3.0-or-later
// The MCU's easing runs per loop, independently of the browser's display refresh.
export class OledFrameClock {
  constructor(rate = 240) {
    this.setRate(rate);
  }
  setRate(rate) {
    this.quantum = 1000 / rate;
    this.reset();
  }
  reset(now = null) {
    this.previous = now;
    this.accumulator = 0;
    this.elapsed = 0;
  }
  advance(now, step) {
    this.elapsed = this.previous === null ? 0 : Math.max(0, Math.min(50, now - this.previous));
    this.previous = now;
    this.accumulator += this.elapsed;
    const count = Math.min(12, Math.floor((this.accumulator + 1e-7) / this.quantum));
    for (let i = 0; i < count; i++) step(this.quantum);
    this.accumulator = Math.max(0, this.accumulator - count * this.quantum);
    return count;
  }
}
