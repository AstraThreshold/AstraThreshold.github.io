// SPDX-License-Identifier: GPL-3.0-or-later
import { boardWidthMm, boardHeightMm, cameraDistanceMm, oledAreaMm } from './oled-grid.js';

const vertexSource = `
attribute vec3 position, normal, tint, material;
uniform mat4 pose;
uniform vec2 projection, pressed;
uniform float camera, centerY;
varying vec3 world, local, localNormal, direction, color, finish;
varying vec2 uv;
void main() {
  local = position * 0.01;
  if (material.z == 1.0) local.z -= pressed.x * 0.16;
  if (material.z == 2.0) local.z -= pressed.y * 0.16;
  vec3 p = (pose * vec4(local, 1.0)).xyz;
  float depth = camera - p.z;
  gl_Position = vec4(p.x * projection.x, -p.y * projection.y + centerY * depth,
    camera / 34.0 * depth - (camera * camera - 1156.0) / 34.0, depth);
  world = p;
  localNormal = normal;
  direction = mat3(pose) * normal;
  color = tint;
  finish = material;
  uv = vec2((material.x == 2.0 ? -local.x : local.x) / ${boardWidthMm} + 0.5,
    local.y / ${boardHeightMm} + 0.5);
}`;

const fragmentSource = `
precision highp float;
uniform sampler2D frontFace, backFace, oledPixels;
uniform float camera, oledOn;
uniform vec3 ledLevels;
uniform vec2 keyHover;
varying vec3 world, local, localNormal, direction, color, finish;
varying vec2 uv;
const vec3 heartbeatColor = vec3(0.69, 0.90, 1.0);
const vec3 blueColor = vec3(0.44, 0.86, 1.0);
const vec3 amberColor = vec3(1.0, 0.59, 0.28);

float ledSpill(float y, float z, vec3 normal) {
  vec3 ray = vec3(16.49, y, z) - local;
  float range = length(ray);
  float facing = max(dot(normal, ray) / max(range, 0.15), 0.0);
  float falloff = 1.0 - smoothstep(0.45, 4.8, range);
  return falloff * (0.19 + 0.65 * facing) / (1.0 + 0.48 * range * range);
}

void main() {
  vec3 base = color;
  float surface = floor(finish.x + 0.5);
  if (surface == 2.0) base = texture2D(backFace, uv).rgb;
  else if (surface == 1.0) base = texture2D(frontFace, uv).rgb;
  vec3 n = normalize(direction);
  vec3 toKey = vec3(-31.0, -54.0, 82.0) - world;
  vec3 light = normalize(toKey);
  vec3 view = normalize(vec3(0.0, 0.0, camera) - world);
  float diffuse = max(dot(n, light), 0.0);
  float keyPower = 1.32 / (1.0 + 0.000048 * dot(toKey, toKey));
  float bounce = max(dot(n, normalize(vec3(0.57, 0.35, 0.75))), 0.0);
  vec3 warmKey = vec3(1.0, 0.94, 0.85);
  vec3 coolFill = vec3(0.57, 0.73, 0.89);
  vec3 illumination = vec3(0.22, 0.23, 0.26) + warmKey * (keyPower * diffuse)
    + coolFill * (0.21 * bounce);
  float polish = finish.y / 255.0;
  float sheen = pow(max(dot(n, normalize(light + view)), 0.0), mix(14.0, 64.0, polish));
  float viewCosine = clamp(dot(n, view), 0.0, 1.0);
  float rim = 1.0 - viewCosine;
  float grazing = rim * rim * rim;
  float grain = fract(sin(dot(floor(local * 80.0), vec3(12.9898, 78.233, 37.719))) * 437.58);
  vec3 reflected = warmKey * sheen * mix(0.014, 0.24, polish * polish) * keyPower
    + coolFill * grazing * (0.011 + 0.024 * polish);

  // Light from the LED packages falls on the nearby board and solder in board space.
  vec3 spill = vec3(0.0);
  if (surface < 4.0 && local.z >= -1.221 && local.x > 11.6 && local.y > 2.3
      && any(greaterThan(ledLevels, vec3(0.0)))) {
    vec3 receiver = normalize(localNormal);
    spill = heartbeatColor * ledLevels.x * ledSpill(7.115, -0.57, receiver)
      + blueColor * ledLevels.y * ledSpill(8.513, -0.57, receiver)
      + amberColor * ledLevels.z * ledSpill(10.164, -0.37, receiver);
  }
  // Accumulate reflected light before converting back to display intensity.
  vec3 radiance = base * base * (illumination + (grain - 0.5) * 0.018)
    + reflected + spill * (0.19 + 0.41 * base);
  vec3 lit = sqrt(max(radiance, vec3(0.0)));
  if (surface == 3.0) {
    // Keep the OLED glass dark, with a broad highlight from the overhead light.
    lit = base + vec3(0.027, 0.030, 0.036) * sheen
      + vec3(0.008, 0.011, 0.016) * grazing + spill * 0.075;
    vec2 pixel = (local.xy - vec2(${oledAreaMm.left - boardWidthMm / 2}, ${oledAreaMm.top - boardHeightMm / 2}))
      / vec2(${oledAreaMm.width}, ${oledAreaMm.height});
    if (oledOn > 0.0 && all(greaterThanEqual(pixel, vec2(0.0))) && all(lessThan(pixel, vec2(1.0)))) {
      float luma = texture2D(oledPixels, pixel).r;
      lit = mix(lit, vec3(0.98, 0.99, 1.0), luma * oledOn);
    }
  }
  float opacity = 1.0;
  if (surface >= 4.0) {
    bool resin = surface <= 7.0;
    float lamp = resin ? surface : surface - 4.0;
    vec3 hue = lamp == 4.0 ? heartbeatColor : lamp == 5.0 ? blueColor : amberColor;
    float power = lamp == 4.0 ? ledLevels.x : lamp == 5.0 ? ledLevels.y : lamp == 6.0 ? ledLevels.z : 0.0;
    if (resin) {
      if (viewCosine <= 0.0) discard;
      float edge = rim * rim;
      float center = lamp == 4.0 ? 7.115 : lamp == 5.0 ? 8.513 : 10.164;
      vec2 radius = lamp == 6.0 ? vec2(0.63, 0.59) : vec2(0.50, 0.39);
      vec2 offset = (local.xy - vec2(16.49, center)) / radius;
      float core = exp(-1.55 * dot(offset, offset));
      vec3 emission = mix(hue, vec3(1.0), 0.16 + 0.46 * core) * (1.05 + 0.28 * core);
      lit = mix(lit, emission, power * (0.69 + 0.31 * core));
      opacity = min(0.98, 0.21 + 0.31 * edge + power * (0.25 + 0.55 * core));
    } else lit = mix(lit, mix(hue, vec3(1.0), 0.74) * 1.12, power);
  }
  // The stamped covers of the two front switches pick up a warm highlight.
  if (surface == 0.0 && abs(finish.y - 212.0) < 0.5 && abs(local.x - 11.8585) < 1.56) {
    vec2 distanceToKey = abs(vec2(local.y) - vec2(8.1949, 11.2442));
    float bezelHover = dot(keyHover, vec2(1.0) - step(vec2(1.28), distanceToKey));
    vec3 warmMetal = lit * vec3(1.30, 0.99, 0.65) + vec3(0.095, 0.035, 0.0);
    lit = mix(lit, warmMetal, 0.8 * bezelHover);
  }
  float capHover = finish.z == 1.0 ? keyHover.x : finish.z == 2.0 ? keyHover.y : 0.0;
  lit *= 1.0 - 0.58 * capHover;
  gl_FragColor = vec4(lit, opacity);
}`;

function makeProgram(gl) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  return program;
}

function boardTexture(gl, image, side, shadows) {
  const texture = gl.createTexture();
  const paper = document.createElement('canvas');
  paper.width = 512;
  paper.height = 370;
  const ctx = paper.getContext('2d', { alpha: false });
  ctx.fillStyle = side === 1 ? '#1b6757' : '#1a6d60';
  ctx.fillRect(0, 0, paper.width, paper.height);
  ctx.drawImage(image, 0, 0, paper.width, paper.height);
  ctx.scale(paper.width / boardWidthMm, paper.height / boardHeightMm);
  // Bake small contact shadows; they rotate with the parts and cost no extra draw pass.
  for (let i = 0; i < shadows.length; i += 6) {
    const [face, x, y, w, h, angle] = shadows.subarray(i, i + 6);
    if (face !== side) continue;
    ctx.save();
    ctx.translate(x + .12, y + .20);
    ctx.rotate(angle * Math.PI / 180);
    ctx.scale(w / 2 + .24, h / 2 + .24);
    const shadow = ctx.createRadialGradient(0, 0, .48, 0, 0, 1.34);
    shadow.addColorStop(0, '#00141098');
    shadow.addColorStop(.68, '#00141066');
    shadow.addColorStop(.90, '#00141022');
    shadow.addColorStop(1, '#00141000');
    ctx.fillStyle = shadow;
    ctx.fillRect(-1.34, -1.34, 2.68, 2.68);
    ctx.restore();
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper);
  paper.width = paper.height = 1;
  return texture;
}

function makePainter(gl, bytes, images) {
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== 0x33424350) throw new Error('Unrecognized PCB mesh');
  const vertices = header.getUint32(4, true), indices = header.getUint32(8, true);
  const opaqueIndices = header.getUint32(20, true);
  const headerSize = 24, vertexSize = 10, materialSize = 6;
  const indicesOffset = headerSize + vertices * vertexSize;
  const wide = vertices > 65535;
  const indexSize = wide ? 4 : 2, indexBytes = indices * indexSize;
  const paletteOffset = indicesOffset + indexBytes, paletteBytes = header.getUint32(16, true) * materialSize;
  const shadowOffset = Math.ceil((paletteOffset + paletteBytes) / 4) * 4;
  const shadows = new Float32Array(bytes, shadowOffset, header.getUint32(12, true) * 6);
  if (!vertices || !indices || (wide && !gl.getExtension('OES_element_index_uint'))) {
    throw new Error('PCB mesh exceeds this graphics context');
  }
  const program = makeProgram(gl);
  const uniform = Object.fromEntries(['pose', 'projection', 'centerY', 'camera', 'pressed', 'keyHover', 'frontFace', 'backFace', 'ledLevels', 'oledPixels', 'oledOn']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  const packed = new Uint8Array(bytes, headerSize, vertices * vertexSize);
  const palette = new Uint8Array(bytes, paletteOffset, paletteBytes);
  const materials = new Uint8Array(vertices * materialSize);
  for (let i = 0; i < vertices; i++) {
    const material = packed[i * vertexSize + 9] * materialSize;
    for (let channel = 0; channel < materialSize; channel++) {
      materials[i * materialSize + channel] = palette[material + channel];
    }
  }
  const attributes = (data, stride, list) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    for (const [name, type, offset, normalized] of list) {
      const location = gl.getAttribLocation(program, name);
      gl.vertexAttribPointer(location, 3, type, normalized, stride, offset);
      gl.enableVertexAttribArray(location);
    }
  };
  attributes(packed, vertexSize, [['position', gl.SHORT, 0, false], ['normal', gl.BYTE, 6, true]]);
  attributes(materials, materialSize, [['tint', gl.UNSIGNED_BYTE, 0, true], ['material', gl.UNSIGNED_BYTE, 3, false]]);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(bytes, indicesOffset, indexBytes), gl.STATIC_DRAW);
  gl.uniform1f(uniform.camera, cameraDistanceMm);
  gl.activeTexture(gl.TEXTURE0);
  boardTexture(gl, images[0], 1, shadows);
  gl.uniform1i(uniform.frontFace, 0);
  gl.activeTexture(gl.TEXTURE1);
  boardTexture(gl, images[1], 2, shadows);
  gl.uniform1i(uniform.backFace, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  // On the compact board several pixels may share one display sample.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.uniform1i(uniform.oledPixels, 2);
  gl.enable(gl.DEPTH_TEST);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return (matrix, width, height, scale, shift, pressed, hovered, heartbeat, power, screenOn, frame) => {
    if (frame) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, 64, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uniform.pose, false, matrix);
    gl.uniform2f(uniform.projection, 2 * cameraDistanceMm * scale / width, 2 * cameraDistanceMm * scale / height);
    gl.uniform1f(uniform.centerY, -2 * shift / height);
    gl.uniform2fv(uniform.pressed, pressed);
    gl.uniform2fv(uniform.keyHover, hovered);
    gl.uniform3f(uniform.ledLevels, heartbeat, power, power);
    gl.uniform1f(uniform.oledOn, screenOn ? power : 0);
    const indexType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.drawElements(gl.TRIANGLES, opaqueIndices, indexType, 0);
    // Clear resin is the only transparent pass. Internal dies and the board remain depth-tested.
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, indices - opaqueIndices, indexType, opaqueIndices * indexSize);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };
}

export function mountPcbModel(scene, object) {
  const canvas = scene.querySelector('.pcb-model');
  const board = object.querySelector('.pcb-board');
  const images = [object.querySelector('.pcb-artwork'), object.querySelector('.pcb-back img')];
  const buttons = [...object.querySelectorAll('.pcb-key')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paint, attempted = false, available = false, moving = false, orbiting = false, request = 0, timer = 0;
  let screenFrame, screenDirty = false, mouseKey = null;
  let power = 0, powerFrom = 0, powerTarget = 0, powerAt = 0, pulseAt = null;

  async function load() {
    attempted = true;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) return;
    try {
      const url = new URL(canvas.dataset.mesh, import.meta.url);
      const [response] = await Promise.all([fetch(url, { signal: AbortSignal.timeout(12000) }), ...images.map(image => image.decode())]);
      if (!response.ok || gl.isContextLost()) return;
      paint = makePainter(gl, await response.arrayBuffer(), images);
      screenDirty = Boolean(screenFrame);
      schedule();
    } catch { /* The lightweight DOM board is still usable if 3D assets fail. */ }
  }
  function schedule() {
    if (!paint || !available || request) return;
    clearTimeout(timer);timer = 0;
    request = requestAnimationFrame(draw);
  }
  function cancelDraw() {
    cancelAnimationFrame(request);request = 0;
    clearTimeout(timer);timer = 0;
  }
  function draw(now) {
    request = 0;
    if (!available || !paint) return;
    const width = scene.clientWidth, height = scene.clientHeight;
    if (!width || !height) return;
    const density = Math.min(devicePixelRatio || 1, 2);
    const bufferWidth = Math.round(width * density), bufferHeight = Math.round(height * density);
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
    const style = getComputedStyle(object);
    const scale = parseFloat(style.width) / boardWidthMm;
    const pose = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
    pose.m41 /= scale;
    pose.m42 /= scale;
    pose.m43 /= scale;
    const face = pose.m33 > 0 ? 'front' : 'back';
    if (scene.dataset.facing !== face) scene.dataset.facing = face;
    const nextPower = board.dataset.power === 'on' ? 1 : 0;
    if (powerTarget !== nextPower) {
      powerFrom = power;powerTarget = nextPower;powerAt = now;
    }
    const t = reduced.matches ? 1 : Math.min(1, (now - powerAt) / 360);
    power = powerFrom + (powerTarget - powerFrom) * t * t * (3 - 2 * t);
    const statusOn = board.dataset.led === 'true';
    const pulsing = statusOn && board.dataset.heartbeat === 'true' && face === 'front';
    let heartbeat = statusOn ? power : 0, pulseDelay = 0;
    if (pulsing) {
      pulseAt ??= now;
      const phase = ((now - pulseAt) % 1600) / 1600;
      const pulse = (center, width) => {
        const p = Math.max(0, 1 - Math.abs(phase - center) / width);
        return p * p * (3 - 2 * p);
      };
      heartbeat *= pulse(.10, .10) + .8 * pulse(.32, .13);
      pulseDelay = phase > .46 ? (1 - phase) * 1600 : 42;
    } else pulseAt = null;
    const pressed = buttons.map(button => Number(button.hasAttribute('data-key-pressed')));
    const nativeCursor = !document.documentElement.classList.contains('has-adaptive-cursor');
    const hovered = buttons.map(button => Number(!button.disabled
      && (button.hasAttribute('data-cursor-magnet') || (nativeCursor && mouseKey === button))));
    paint(pose.toFloat32Array(), width, height, scale, parseFloat(style.top), pressed, hovered,
      heartbeat, power, board.dataset.screenReady === 'true', screenDirty ? screenFrame : null);
    screenDirty = false;
    if (scene.dataset.model !== 'ready') scene.dataset.model = 'ready';
    if (moving && orbiting) timer = setTimeout(schedule, 24);
    else if (moving || (powerFrom !== powerTarget && t < 1)) schedule();
    else if (pulseDelay) timer = setTimeout(schedule, pulseDelay);
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    paint = null;
    delete scene.dataset.model;
    delete scene.dataset.facing;
    cancelDraw();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    attempted = false;
    if (available) load();
  });
  new ResizeObserver(schedule).observe(object);
  window.addEventListener('resize', schedule, { passive: true });
  const stateObserver = new MutationObserver(schedule);
  for (const button of buttons) {
    stateObserver.observe(button, { attributes: true, attributeFilter: ['data-key-pressed', 'data-cursor-magnet', 'disabled'] });
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return;
      mouseKey = button;
      schedule();
    });
    button.addEventListener('pointerleave', () => {
      if (mouseKey !== button) return;
      mouseKey = null;
      schedule();
    });
  }
  stateObserver.observe(board, { attributes: true, attributeFilter: ['data-power', 'data-screen-ready', 'data-led', 'data-heartbeat'] });
  reduced.addEventListener('change', schedule);

  return {
    sync(visible, animated, idleOrbit) {
      available = visible;
      moving = animated;
      orbiting = idleOrbit;
      if (!available) { cancelDraw();return; }
      if (!attempted) load();
      schedule();
    },
    writeScreen(frame) {
      screenFrame = frame;
      screenDirty = true;
      schedule();
    }
  };
}
