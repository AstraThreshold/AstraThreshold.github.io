import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createOledEngine, liteRefreshRate } from '../oled-playground.js';
import { OledFrameClock } from '../oled-clock.js';
import { fitCoreWidth, boardWidthMm, boardHeightMm, oledAreaMm } from '../oled-grid.js';
import { OledKeyGesture } from '../oled-keys.js';
import { pcbPreviewBounds } from '../simulator/tools/pcb-preview.mjs';

const root = new URL('../', import.meta.url);
async function fresh(name) {
  const engine = await createOledEngine(await readFile(new URL(`assets/simulator/${name}.wasm`, root)));
  const rate = name === 'lite' ? liteRefreshRate : 60;
  let time = 0;
  const step = (frames = 220) => { for (let i = 0; i < frames; i++) engine.sim_step(Math.round(time += 1000 / rate)); };
  const input = action => { engine.sim_input(action);step(); };
  const frame = () => Buffer.from(new Uint8Array(engine.memory.buffer, engine.sim_buffer(), 1024));
  const label = () => {
    const view = new Uint8Array(engine.memory.buffer, engine.sim_label(), 100);
    return new TextDecoder().decode(view.subarray(0, view.indexOf(0)));
  };
  step(440);
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

test('the 240 Hz Astra and 120 Hz Lite clocks keep their cadence across display refresh rates', () => {
  for (const rate of [liteRefreshRate,240]) for (const refresh of [30,60,90,120,144,240]) {
    const clock = new OledFrameClock(rate);clock.reset(0);
    let steps = 0, elapsed = 0;
    for (let frame = 1; frame <= refresh; frame++) clock.advance(frame * 1000 / refresh, ms => { steps++;elapsed += ms; });
    assert.equal(steps,rate, `${rate} Hz UI on ${refresh} Hz display`);
    assert.ok(Math.abs(elapsed - 1000) < .001, `${refresh} Hz must represent a real second`);
  }
});

test('changing engine cadence clears fractional work and cannot inherit a paused backlog', () => {
  const clock=new OledFrameClock(240);clock.reset(0);clock.advance(6,()=>{});
  clock.setRate(liteRefreshRate);let steps=0;
  assert.equal(clock.advance(4000,()=>steps++),0);
  assert.equal(clock.advance(4000+1000/liteRefreshRate,()=>steps++),1);
  assert.equal(steps,1);
});

test('the original star/title boot is visible, finite, replayable on reset and skippable by input', async () => {
  const binary=await readFile(new URL('assets/simulator/modern.wasm',root));
  for(let attempt=0;attempt<2;attempt++) {
    const engine=await createOledEngine(binary);let time=0;const frames=new Set();
    assert.equal(engine.sim_flags()&8,8);
    while((engine.sim_flags()&8)&&time<4000) {
      engine.sim_step(Math.round(time+=1000/240));
      if(time>400&&time<1300)frames.add(Buffer.from(new Uint8Array(engine.memory.buffer,engine.sim_buffer(),1024)).toString('hex'));
    }
    assert.ok(time>1800&&time<2700,`boot took ${time} ms`);
    assert.ok(frames.size>25,'boot must present intermediate original star/text frames');
    assert.equal(engine.sim_flags()&12,0);
  }
  const quick=await createOledEngine(binary);quick.sim_input(1);quick.sim_step(17);
  assert.equal(quick.sim_flags()&8,0,'a control may skip the boot without losing its action');
  assert.equal(quick.sim_selected(),1);
});

test('every home tile has a white field with a dark cut-out motif', async () => {
  const demo=await fresh('modern');
  for(let tile=0;tile<3;tile++) {
    const frame=demo.frame();let white=0;
    for(let y=8;y<38;y++)for(let x=49;x<79;x++)white+=!!(frame[x+(y>>3)*128]&(1<<(y%8)));
    assert.ok(white>600&&white<870,`tile ${tile} white pixels: ${white}`);
    demo.input(1);
  }
});

test('Lite retains its slower hourglass transition and the complete staged copyright page, then rests', async () => {
  const engine=await createOledEngine(await readFile(new URL('assets/simulator/lite.wasm',root)));
  let time=0;const step=()=>engine.sim_step(Math.round(time+=1000/liteRefreshRate));
  const advance=ms=>{const end=time+ms;while(time<end)step();};
  const frame=()=>Buffer.from(new Uint8Array(engine.memory.buffer,engine.sim_buffer(),1024));
  advance(3000);engine.sim_input(0);advance(800);engine.sim_input(3);
  const entered=time;assert.equal(engine.sim_flags()&16,16);
  while((engine.sim_flags()&16)&&time-entered<2000)step();
  assert.ok(time-entered>650&&time-entered<1200,`hourglass took ${time-entered} ms`);
  assert.equal(engine.sim_flags()&4,4,'copyright stages must continue after the mask exits');
  const arriving=frame();advance(1200);const middle=frame();
  assert.notDeepEqual(arriving,middle);
  advance(3000);const settled=frame();assert.equal(engine.sim_flags()&4,0);
  advance(1000);assert.deepEqual(frame(),settled,'the final copyright card must stop changing');
  engine.sim_input(2);advance(1800);assert.equal(engine.sim_flags()&20,0);
  engine.sim_input(3);advance(4800);assert.deepEqual(frame(),settled,'reentry resets and replays the same final card');
});

test('the measured assembly fits the responsive profile slot at its physical proportions', () => {
  for (const [width,height] of [[244,183],[218,163],[164,123],[98,73]]) {
    const fitted = fitCoreWidth(width,height);
    assert.ok(fitted > 0 && fitted <= width - 10);
    assert.ok(fitted * boardHeightMm / boardWidthMm <= height - 8 + 1e-7);
  }
  assert.equal(fitCoreWidth(0,138),0);
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

test('the 128 by 64 screen area remains within the measured assembly', () => {
  const {left,top,width,height} = oledAreaMm;
  assert.equal(width,height*2);
  assert.ok(left > 0 && left + width < boardWidthMm);
  assert.ok(top > 0 && top + height < boardHeightMm);
});

test('the embedded gray PCB keeps the full mesh envelope and 1.6 mm substrate', async () => {
  const mesh = await readFile(new URL('assets/simulator/astra-core-mesh.bin', root));
  const preview = pcbPreviewBounds(mesh);
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < mesh.readUInt32LE(4); index++) {
    for (let axis = 0; axis < 3; axis++) {
      const coordinate = mesh.readInt16LE(24 + index * 10 + axis * 2);
      low[axis] = Math.min(low[axis], coordinate);
      high[axis] = Math.max(high[axis], coordinate);
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    assert.equal(Math.min(...preview.map(box => box[axis])), low[axis]);
    assert.equal(Math.max(...preview.map(box => box[axis + 3])), high[axis]);
  }
  const board = preview.find(box => box[3] - box[0] === boardWidthMm * 100
    && box[4] - box[1] === boardHeightMm * 100);
  assert.ok(board);
  assert.equal(board[5] - board[2], 160);
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
