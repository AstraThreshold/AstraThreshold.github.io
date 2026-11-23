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
  // These bounds contain the two front switch assemblies above the substrate.
  if (surface == 0.0 && local.z > -1.20 && abs(local.x - 11.8585) <= 2.29) {
    vec2 distanceToKey = abs(vec2(local.y) - vec2(8.1949, 11.2442));
    float highlight = dot(keyHover, vec2(1.0) - step(vec2(1.29), distanceToKey));
    float shade = clamp(dot(lit, vec3(0.30, 0.59, 0.11)), 0.0, 1.0);
    vec3 amber = mix(vec3(0.61, 0.32, 0.16), vec3(1.0, 0.82, 0.57), shade);
    lit = mix(lit, amber, 0.89 * highlight);
  }
  gl_FragColor = vec4(lit, opacity);
}`;

const previewFragmentSource = `
precision mediump float;
uniform float phase;
varying vec3 world, direction, color;
void main() {
  float light = max(dot(normalize(direction), normalize(vec3(-0.37, -0.54, 0.78))), 0.0);
  float gray = color.r * (0.55 + 0.53 * light);
  float sweep = abs(world.x + 0.60 * world.y - mix(-12.0, 12.0, phase));
  float shimmer = 1.0 - smoothstep(0.0, 3.7, sweep);
  gl_FragColor = vec4(vec3(mix(gray, 0.92, 0.48 * shimmer)), 1.0);
}`;

function makeProgram(gl, fragment = fragmentSource) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragment]]) {
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

function project(gl, uniform, matrix, width, height, scale, shift) {
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(uniform.pose, false, matrix);
  gl.uniform2f(uniform.projection, 2 * cameraDistanceMm * scale / width, 2 * cameraDistanceMm * scale / height);
  gl.uniform1f(uniform.centerY, -2 * shift / height);
}

function makePreviewPainter(gl, bounds) {
  const vertices = [];
  const face = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  for (const box of bounds) {
    for (const [axis, u, v] of [[0, 1, 2], [1, 0, 2], [2, 0, 1]]) {
      for (const side of [0, 1]) {
        const normal = [0, 0, 0];
        normal[axis] = side ? 1 : -1;
        for (const [s, t] of face) {
          const point = [0, 0, 0];
          point[axis] = box[axis + 3 * side];
          point[u] = box[u + 3 * s];
          point[v] = box[v + 3 * t];
          vertices.push(...point, ...normal, box[6] / 255);
        }
      }
    }
  }
  const program = makeProgram(gl, previewFragmentSource);
  const uniform = Object.fromEntries(['pose', 'projection', 'centerY', 'camera', 'phase']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  const attributes = [['position', 3, 0], ['normal', 3, 12], ['tint', 1, 24]]
    .map(([name, size, offset]) => [gl.getAttribLocation(program, name), size, offset]);
  const material = gl.getAttribLocation(program, 'material');
  const buffer = gl.createBuffer();
  const vertexCount = vertices.length / 7;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  return {
    draw(matrix, width, height, scale, shift, phase) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.disableVertexAttribArray(material);
      for (const [location, size, offset] of attributes) {
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 28, offset);
        gl.enableVertexAttribArray(location);
      }
      gl.uniform1f(uniform.camera, cameraDistanceMm);
      gl.uniform1f(uniform.phase, phase);
      project(gl, uniform, matrix, width, height, scale, shift);
      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    },
    release() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    }
  };
}

function paintBoardTexture(gl, texture, image, side, shadows, highResolution) {
  const paper = document.createElement('canvas');
  paper.width = highResolution ? 1024 : 512;
  paper.height = highResolution ? 1024 : 370;
  const ctx = paper.getContext('2d', { alpha: false });
  ctx.fillStyle = side === 1 ? '#1b6757' : '#1a6d60';
  ctx.fillRect(0, 0, paper.width, paper.height);
  if (image) ctx.drawImage(image, 0, 0, paper.width, paper.height);
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, highResolution ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper);
  if (highResolution) {
    gl.generateMipmap(gl.TEXTURE_2D);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy) {
      const samples = Math.min(4, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
      gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, samples);
    }
  }
  paper.width = paper.height = 1;
}

function makePainter(gl, bytes, images, highResolution) {
  const header = new DataView(bytes);
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
  const boardTextures = [gl.createTexture(), gl.createTexture()];
  function setArtwork(index, image) {
    gl.activeTexture(gl.TEXTURE0 + index);
    try { paintBoardTexture(gl, boardTextures[index], image, index + 1, shadows, highResolution); }
    finally { gl.activeTexture(gl.TEXTURE2); }
  }
  boardTextures.forEach((_, index) => setArtwork(index, images[index]));
  gl.uniform1i(uniform.frontFace, 0);
  gl.uniform1i(uniform.backFace, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  // Filter when shrinking the display and preserve individual pixels when enlarging it.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.uniform1i(uniform.oledPixels, 2);
  gl.enable(gl.DEPTH_TEST);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  function draw(matrix, width, height, scale, shift, pressed, hovered, heartbeat, power, screenOn, frame) {
    if (frame) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, 64, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    project(gl, uniform, matrix, width, height, scale, shift);
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
  }
  return { draw, setArtwork };
}

async function fetchMesh(path, compressed = false) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`PCB mesh request returned ${response.status}`);
  const body = compressed ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))) : response;
  const bytes = await body.arrayBuffer();
  if (bytes.byteLength < 24 || new DataView(bytes).getUint32(0, true) !== 0x33424350) {
    throw new Error('Unrecognized PCB mesh');
  }
  return bytes;
}

async function downloadMesh({ mesh, meshGzip }) {
  if (meshGzip && typeof DecompressionStream === 'function') {
    try { return await fetchMesh(meshGzip, true); }
    catch { /* The original binary can recover from a missing or invalid compressed response. */ }
  }
  return fetchMesh(mesh);
}

export function mountPcbModel(scene, object, onStateChange) {
  const canvas = scene.querySelector('.pcb-model');
  const board = object.querySelector('.pcb-board');
  const images = [object.querySelector('.pcb-artwork'), object.querySelector('.pcb-back img')];
  const buttons = [...object.querySelectorAll('.pcb-key')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const touchViewport = matchMedia('(pointer: coarse)');
  const artwork = [null, null];
  let gl, preview, painter, mesh, loading, artworkStarted = false;
  let available = false, moving = false, orbiting = false, request = 0, timer = 0;
  let screenFrame, screenDirty = false, mouseKey = null;
  let power = 0, powerFrom = 0, powerTarget = 0, powerAt = 0, pulseAt = null;

  async function loadArtwork(image, index) {
    image.loading = 'eager';
    try { await image.decode(); }
    catch {
      const retry = new URL(image.src);
      retry.searchParams.set('retry', '1');
      image.src = retry.href;
      await image.decode();
    }
    artwork[index] = image;
    if (painter && !gl.isContextLost()) {
      painter.setArtwork(index, image);
      schedule();
    }
  }
  function startArtwork() {
    if (artworkStarted) return;
    artworkStarted = true;
    images.forEach((image, index) => {
      loadArtwork(image, index).catch(() => { /* The mesh already has a base finish. */ });
    });
  }
  function showModel(state) {
    scene.dataset.model = state;
    object.inert = false;
    onStateChange();
  }
  async function load() {
    try {
      gl ??= canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!gl) {
        startArtwork();
        showModel('fallback');
        return;
      }
      if (gl.isContextLost()) return;
      if (!mesh) {
        if (!preview && canvas.dataset.preview) {
          preview = makePreviewPainter(gl, JSON.parse(canvas.dataset.preview));
          schedule();
        }
        const download = downloadMesh(canvas.dataset);
        startArtwork();
        try { mesh = await download; }
        catch {
          await new Promise(resolve => setTimeout(resolve, 1000));
          mesh = await downloadMesh(canvas.dataset);
        }
      }
      if (gl.isContextLost()) return;
      painter = makePainter(gl, mesh, artwork, touchViewport.matches);
      preview?.release();
      preview = null;
      screenDirty = Boolean(screenFrame);
      schedule();
    } catch {
      if (!gl?.isContextLost()) {
        scene.dataset.model = 'error';
        onStateChange();
        schedule();
      }
    }
  }
  function requestModel() {
    if (!available || painter || loading || scene.dataset.model !== 'loading') return;
    loading = load().finally(() => { loading = null; });
  }
  function retryModel() {
    if (scene.dataset.model !== 'error') return;
    scene.dataset.model = 'loading';
    onStateChange();
    requestModel();
    schedule();
  }
  function schedule() {
    if ((!painter && !preview) || !available || request) return;
    clearTimeout(timer);timer = 0;
    request = requestAnimationFrame(draw);
  }
  function cancelDraw() {
    cancelAnimationFrame(request);request = 0;
    clearTimeout(timer);timer = 0;
  }
  function draw(now) {
    request = 0;
    if (!available || (!painter && !preview) || gl.isContextLost()) return;
    const { width, height } = scene.getBoundingClientRect();
    if (!width || !height) return;
    const density = Math.min(devicePixelRatio || 1, touchViewport.matches ? 4 : 2);
    const bufferWidth = Math.round(width * density), bufferHeight = Math.round(height * density);
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
    const style = getComputedStyle(object);
    const scale = parseFloat(style.width) / boardWidthMm;
    const pose = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
    pose.m41 /= scale;
    pose.m42 /= scale;
    pose.m43 /= scale;
    const matrix = pose.toFloat32Array();
    const shift = parseFloat(style.top);
    if (!painter) {
      const shimmer = scene.dataset.model === 'loading' && !reduced.matches;
      preview.draw(matrix, width, height, scale, shift, shimmer ? (now % 2150) / 2150 : -1);
      if (shimmer) timer = setTimeout(schedule, 28);
      return;
    }
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
    painter.draw(matrix, width, height, scale, shift, pressed, hovered,
      heartbeat, power, board.dataset.screenReady === 'true', screenDirty ? screenFrame : null);
    screenDirty = false;
    if (scene.dataset.model !== 'ready') showModel('ready');
    if (moving && orbiting && !request) timer = setTimeout(schedule, 24);
    else if (moving || (powerFrom !== powerTarget && t < 1)) schedule();
    else if (pulseDelay) timer = setTimeout(schedule, pulseDelay);
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    preview = null;
    painter = null;
    object.inert = true;
    scene.dataset.model = 'loading';
    delete scene.dataset.facing;
    cancelDraw();
  });
  canvas.addEventListener('webglcontextrestored', requestModel);
  scene.querySelector('.pcb-model-retry').addEventListener('click', retryModel);
  window.addEventListener('online', retryModel);
  const resize = new ResizeObserver(schedule);
  resize.observe(scene);
  resize.observe(object);
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
  touchViewport.addEventListener('change', schedule);

  return {
    get ready() { return scene.dataset.model === 'ready' || scene.dataset.model === 'fallback'; },
    sync(visible, animated, idleOrbit) {
      available = visible;
      moving = animated;
      orbiting = idleOrbit;
      if (!available) { cancelDraw();return; }
      requestModel();
      schedule();
    },
    writeScreen(frame) {
      screenFrame = frame;
      screenDirty = true;
      schedule();
    }
  };
}
