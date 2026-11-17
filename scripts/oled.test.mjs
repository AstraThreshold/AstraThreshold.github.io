import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createOledEngine } from '../oled-playground.js';
import { OledFrameClock } from '../oled-clock.js';

const root = new URL('../', import.meta.url);
async function fresh(name) {
  const engine = await createOledEngine(await readFile(new URL(`assets/simulator/${name}.wasm`, root)));
  let time = 0;
  const step = (frames = 220) => { for (let i = 0; i < frames; i++) engine.sim_step(Math.round(time += 1000 / 60)); };
  const input = action => { engine.sim_input(action);step(); };
  const frame = () => Buffer.from(new Uint8Array(engine.memory.buffer, engine.sim_buffer(), 1024));
  const label = () => {
    const view = new Uint8Array(engine.memory.buffer, engine.sim_label(), 100);
    return new TextDecoder().decode(view.subarray(0, view.indexOf(0)));
  };
  step();
  return { engine, step, input, frame, label };
}

test('modern engine renders actual animated tiles, nested lists and scrolling', async () => {
  const { engine, input, step, frame, label } = await fresh('modern');
  assert.equal(label(), 'Explore');
  assert.ok(frame().some(byte => byte !== 0));
  const before = frame();engine.sim_input(1);step(1);
  const during = frame();step();const after = frame();
  assert.notDeepEqual(before, during);assert.notDeepEqual(during, after);
  input(0);input(3);assert.equal(label(), 'Nested menu >');
  input(3);assert.equal(label(), 'Hello, explorer!');
  input(2);assert.equal(label(), 'Nested menu >');
  for (let i = 0; i < 5; i++) input(1);
  assert.equal(label(), 'Back to the top');input(1);assert.equal(label(), 'Nested menu >');
  input(2);assert.equal(label(), 'Explore');
});

test('modern native checkboxes control the board LED and OLED inversion', async () => {
  const { engine, input, label } = await fresh('modern');
  input(1);input(3);assert.equal(label(), 'Status LED');
  assert.equal(engine.sim_flags() & 1, 1);input(3);assert.equal(engine.sim_flags() & 1, 0);
  input(1);assert.equal(label(), 'Invert OLED');input(3);assert.equal(engine.sim_flags() & 2, 2);
});

test('Lite uses its native switch, slider commit/cancel and custom-page transitions', async () => {
  const { engine, input, label } = await fresh('lite');
  assert.equal(label(), 'Board settings');input(3);assert.equal(label(), 'Status LED');
  input(3);assert.equal(engine.sim_flags() & 1, 0);
  input(1);input(3);assert.equal(engine.sim_flags() & 2, 2);
  input(1);assert.equal(label(), 'Brightness');
  input(3);input(1);assert.equal((engine.sim_flags() >> 8) & 255, 85);
  input(2);assert.equal((engine.sim_flags() >> 8) & 255, 80);
  input(3);input(0);input(3);assert.equal((engine.sim_flags() >> 8) & 255, 75);
  input(2);input(1);assert.equal(label(), 'Hello, world...');
  input(3);input(2);assert.equal(label(), 'Hello, world...');
  input(0);assert.equal(label(), 'Board settings');
  input(0);assert.equal(label(), 'About Lite...');input(3);input(2);input(2);
  assert.equal(label(), 'About Lite...'); // Back at root must keep a live display.
});

test('both engines settle, remain independent, and keep a fixed memory ceiling through repeated input', async () => {
  const a = await fresh('modern'), b = await fresh('lite');
  const original = a.frame();b.input(1);assert.deepEqual(a.frame(), original);
  for (const demo of [a,b]) {
    const memory = demo.engine.memory.buffer.byteLength;
    assert.equal(memory, 2 * 1024 * 1024);
    assert.throws(() => demo.engine.memory.grow(1));
    let seed = 1823;
    for (let i = 0; i < 1800; i++) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      demo.engine.sim_input((seed >>> 16) % 4);demo.step(6);
    }
    assert.equal(demo.engine.memory.buffer.byteLength, memory);
    demo.step(220);const stopped = demo.frame();demo.step(40);
    assert.deepEqual(demo.frame(), stopped);
  }
});

test('upstream source and declared patches match pinned hashes; shipped WASM matches its manifest', async () => {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const provenance = JSON.parse(await readFile(new URL('simulator/upstream.json', root), 'utf8'));
  const binaries = JSON.parse(await readFile(new URL('assets/simulator/engines.json', root), 'utf8'));
  for (const [name, info] of Object.entries(provenance)) {
    for (const [file, sha] of Object.entries(info.files)) {
      const bytes = await readFile(new URL(`simulator/vendor/${name}/${file}`, root));
      assert.equal(hash(bytes), info.patches?.[file]?.sha256 ?? sha, `${name}/${file}`);
    }
    const wasm = await readFile(new URL(`assets/simulator/${name}.wasm`, root));
    assert.equal(hash(wasm), binaries[name].sha256);
    assert.equal(wasm.length, binaries[name].bytes);
  }
});

test('UI time advances equally at 30, 60, 90, 120, 144 and 240 Hz without a display-frame gate', () => {
  for (const refresh of [30,60,90,120,144,240]) {
    const clock = new OledFrameClock();clock.reset(0);
    let steps = 0, elapsed = 0;
    for (let frame = 1; frame <= refresh; frame++) clock.advance(frame * 1000 / refresh, ms => { steps++;elapsed += ms; });
    assert.equal(steps,240, `${refresh} Hz`);
    assert.ok(Math.abs(elapsed - 1000) < .001, `${refresh} Hz must represent a real second`);
  }
});

test('a paused or stalled clock cannot burst through a background backlog', () => {
  const clock = new OledFrameClock();clock.reset(0);
  let calls = 0;
  assert.equal(clock.advance(5000,()=>calls++),12);
  assert.equal(calls,12);
  clock.reset();assert.equal(clock.advance(10000,()=>calls++),0);
  assert.equal(calls,12);
  clock.reset(12000);assert.equal(clock.advance(12000+1000/60,()=>calls++),4);
});

test('real Astra animation settles within 800 ms and matches across display refresh rates', async () => {
  let expected;
  for (const refresh of [60,90,120,144,240]) {
    const demo = await fresh('modern');demo.engine.sim_input(1);
    const clock = new OledFrameClock();clock.reset(0);
    let simulated = 4000, before = demo.frame(), changedFrames = 0;
    for (let frame = 1; frame <= refresh; frame++) {
      clock.advance(frame * 1000 / refresh, ms => demo.engine.sim_step(Math.round(simulated += ms)));
      const next = demo.frame();if (!before.equals(next)) changedFrames++;before = next;
      if (frame === Math.ceil(refresh * .8)) expected ??= next;
    }
    assert.ok(changedFrames >= 12, `${refresh} Hz must present intermediate frames`);
    assert.deepEqual(demo.frame(),expected, `${refresh} Hz must have the same settled UI`);
    assert.equal(demo.label(),'Controls');
  }
});
