import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createOledEngine } from '../oled-playground.js';
import { OledFrameClock } from '../oled-clock.js';
import { fitOledGrid } from '../oled-grid.js';
import { OledKeyGesture } from '../oled-keys.js';

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

test('the OLED pixel pitch and origin remain physical integers at fractional DPI and zoom', () => {
  const padding={left:8,right:8,top:8,bottom:8};
  for (const dpr of [1,1.25,1.5,2,3]) for(const width of [224,407.625,409]) for(const zoom of [1,1.3,2]) {
    const rect={left:512.375,top:313.71875,width,height:(width-16)/2+16};
    const viewport={scale:zoom,offsetLeft:37.5,offsetTop:19.25};
    const grid=fitOledGrid(rect,dpr,padding,viewport);
    const ratio=dpr*zoom;
    const left=(rect.left+grid.x-viewport.offsetLeft)*ratio;
    const top=(rect.top+grid.y-viewport.offsetTop)*ratio;
    assert.ok(Math.abs(left-Math.round(left))<1e-7);
    assert.ok(Math.abs(top-Math.round(top))<1e-7);
    assert.equal(grid.pitch,Math.round(grid.pitch));
    assert.ok(Math.abs(grid.scale*ratio-grid.pitch)<1e-7);
    assert.ok(128*grid.pitch<= (width-16)*ratio + 1e-7);
    assert.ok(64*grid.pitch<= (rect.height-16)*ratio + 1e-7);
  }
});

function fakeTimers() {
  let now=0,id=0;const jobs=new Map();
  return {
    setTimeout(callback,delay) { const key=++id;jobs.set(key,{at:now+delay,callback});return key; },
    clearTimeout(key) { jobs.delete(key); },
    advance(milliseconds) {
      const end=now+milliseconds;
      for(;;) {
        const next=[...jobs.entries()].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next)break;
        now=next[1].at;jobs.delete(next[0]);next[1].callback();
      }
      now=end;
    }
  };
}

test('short presses move once and suppress the following compatibility click', () => {
  const actions=[],timers=fakeTimers();const gesture=new OledKeyGesture(action=>actions.push(action),timers);
  gesture.begin(0,2);timers.advance(599);assert.deepEqual(actions,[]);gesture.finish();gesture.click(0);
  gesture.begin(1,3);timers.advance(100);gesture.finish();gesture.click(1);
  assert.deepEqual(actions,[0,1]);
});

test('holding the near/far key invokes back/enter once, without a short action on release', () => {
  for(const [short,held] of [[0,2],[1,3]]) {
    const actions=[],timers=fakeTimers();const gesture=new OledKeyGesture(action=>actions.push(action),timers);
    gesture.begin(short,held);timers.advance(600);timers.advance(3000);
    gesture.finish();gesture.click(short);gesture.click(short);
    assert.deepEqual(actions,[held]);
    timers.advance(351);gesture.click(short);assert.deepEqual(actions,[held,short]);
  }
});

test('canceling a drag or changing controls releases unfinished long presses', () => {
  const actions=[],timers=fakeTimers();const gesture=new OledKeyGesture(action=>actions.push(action),timers);
  gesture.begin(0,2);timers.advance(500);gesture.cancel();gesture.click(0);timers.advance(1000);
  assert.deepEqual(actions,[]);
  gesture.finish();gesture.click(0);assert.deepEqual(actions,[],'a delayed release after cancellation must not click');
  gesture.begin(0,2);timers.advance(350);gesture.begin(1,3);timers.advance(300);
  assert.deepEqual(actions,[]);timers.advance(300);gesture.finish();
  assert.deepEqual(actions,[3]);
});
