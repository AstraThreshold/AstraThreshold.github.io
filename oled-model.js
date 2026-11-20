// SPDX-License-Identifier: GPL-3.0-or-later
import { boardWidthMm, cameraDistanceMm } from './oled-grid.js';

const vertexSource = `
attribute vec3 position, normal, tint, material;
uniform mat4 pose;
uniform vec2 projection, pressed;
uniform float camera, centerY;
varying vec3 world, local, direction, color, finish;
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
  direction = mat3(pose) * normal;
  color = tint;
  finish = material;
  uv = vec2((material.x == 2.0 ? -local.x : local.x) / ${boardWidthMm} + 0.5,
    local.y / 26.3 + 0.5);
}`;

const fragmentSource = `
precision highp float;
uniform sampler2D frontFace, backFace;
uniform float camera;
varying vec3 world, local, direction, color, finish;
varying vec2 uv;
void main() {
  vec3 base = color;
  if (finish.x > 1.5) base = texture2D(backFace, uv).rgb;
  else if (finish.x > 0.5) base = texture2D(frontFace, uv).rgb;
  vec3 n = normalize(direction);
  vec3 light = normalize(vec3(-26.0, -48.0, 64.0) - world);
  vec3 view = normalize(vec3(0.0, 0.0, camera) - world);
  float diffuse = max(dot(n, light), 0.0);
  float bounce = 0.10 * max(dot(n, normalize(vec3(0.55, 0.34, 0.29))), 0.0);
  float polish = finish.y / 255.0;
  float sheen = pow(max(dot(n, normalize(light + view)), 0.0), mix(12.0, 86.0, polish));
  float grain = fract(sin(dot(floor(local * 80.0), vec3(12.9898, 78.233, 37.719))) * 437.58);
  vec3 lit = base * (0.43 + 0.62 * diffuse + bounce + (grain - 0.5) * 0.024);
  lit += vec3(0.97, 0.99, 1.0) * sheen * polish * (0.36 * diffuse + 0.07);
  gl_FragColor = vec4(lit, 1.0);
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
  paper.width = 1024;
  paper.height = 740;
  const ctx = paper.getContext('2d', { alpha: false });
  ctx.fillStyle = side === 1 ? '#1b6757' : '#1a6d60';
  ctx.fillRect(0, 0, paper.width, paper.height);
  ctx.drawImage(image, 0, 0, paper.width, paper.height);
  ctx.scale(paper.width / boardWidthMm, paper.height / 26.3);
  // Bake small contact shadows; they rotate with the parts and cost no extra draw pass.
  for (let i = 0; i < shadows.length; i += 6) {
    const [face, x, y, w, h, angle] = shadows.subarray(i, i + 6);
    if (face !== side) continue;
    ctx.save();
    ctx.translate(x + .08, y + .13);
    ctx.rotate(angle * Math.PI / 180);
    ctx.scale(w / 2 + .24, h / 2 + .24);
    const shadow = ctx.createRadialGradient(0, 0, .45, 0, 0, 1.34);
    shadow.addColorStop(0, '#00191488');
    shadow.addColorStop(.72, '#00191458');
    shadow.addColorStop(1, '#00191400');
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
  if (header.getUint32(0, true) !== 0x31424350) throw new Error('Unrecognized PCB mesh');
  const vertices = header.getUint32(4, true), indices = header.getUint32(8, true);
  const indicesOffset = 16 + vertices * 16;
  const wide = vertices > 65535;
  const indexBytes = indices * (wide ? 4 : 2);
  const shadowOffset = Math.ceil((indicesOffset + indexBytes) / 4) * 4;
  const shadows = new Float32Array(bytes, shadowOffset, header.getUint32(12, true) * 6);
  if (!vertices || !indices || (wide && !gl.getExtension('OES_element_index_uint'))) {
    throw new Error('PCB mesh exceeds this graphics context');
  }
  const program = makeProgram(gl);
  const uniform = Object.fromEntries(['pose', 'projection', 'centerY', 'camera', 'pressed', 'frontFace', 'backFace']
    .map(name => [name, gl.getUniformLocation(program, name)]));
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(bytes, 16, vertices * 16), gl.STATIC_DRAW);
  for (const [name, size, type, offset, normalized] of [
    ['position', 3, gl.SHORT, 0, false], ['normal', 3, gl.BYTE, 6, true],
    ['tint', 3, gl.UNSIGNED_BYTE, 9, true], ['material', 3, gl.UNSIGNED_BYTE, 12, false]
  ]) {
    const location = gl.getAttribLocation(program, name);
    gl.vertexAttribPointer(location, size, type, normalized, 16, offset);
    gl.enableVertexAttribArray(location);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(bytes, indicesOffset, indexBytes), gl.STATIC_DRAW);
  gl.uniform1f(uniform.camera, cameraDistanceMm);
  gl.activeTexture(gl.TEXTURE0);
  boardTexture(gl, images[0], 1, shadows);
  gl.uniform1i(uniform.frontFace, 0);
  gl.activeTexture(gl.TEXTURE1);
  boardTexture(gl, images[1], 2, shadows);
  gl.uniform1i(uniform.backFace, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  return (matrix, width, height, scale, shift, upper, lower) => {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uniform.pose, false, matrix);
    gl.uniform2f(uniform.projection, 2 * cameraDistanceMm * scale / width, 2 * cameraDistanceMm * scale / height);
    gl.uniform1f(uniform.centerY, -2 * shift / height);
    gl.uniform2f(uniform.pressed, upper, lower);
    gl.drawElements(gl.TRIANGLES, indices, wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  };
}

export function mountPcbModel(scene, object) {
  const canvas = scene.querySelector('.pcb-model');
  const images = [object.querySelector('.pcb-artwork'), object.querySelector('.pcb-back img')];
  const buttons = [...object.querySelectorAll('.pcb-key')];
  let paint, attempted = false, available = false, moving = false, request = 0;

  async function load() {
    attempted = true;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) return;
    try {
      const url = new URL(canvas.dataset.mesh, import.meta.url);
      const [response] = await Promise.all([fetch(url, { signal: AbortSignal.timeout(12000) }), ...images.map(image => image.decode())]);
      if (!response.ok || gl.isContextLost()) return;
      paint = makePainter(gl, await response.arrayBuffer(), images);
      schedule();
    } catch { /* The lightweight DOM board is still usable if 3D assets fail. */ }
  }
  function schedule() {
    if (paint && available && !request) request = requestAnimationFrame(draw);
  }
  function draw() {
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
    paint(pose.toFloat32Array(), width, height, scale, parseFloat(style.top),
      Number(buttons[0].hasAttribute('data-key-pressed')), Number(buttons[1].hasAttribute('data-key-pressed')));
    if (scene.dataset.model !== 'ready') scene.dataset.model = 'ready';
    if (moving) schedule();
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    paint = null;
    delete scene.dataset.model;
    delete scene.dataset.facing;
    cancelAnimationFrame(request);request = 0;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    attempted = false;
    if (available) load();
  });
  new ResizeObserver(schedule).observe(object);
  const buttonObserver = new MutationObserver(schedule);
  for (const button of buttons) buttonObserver.observe(button, { attributes: true, attributeFilter: ['data-key-pressed'] });

  return (visible, animated) => {
    available = visible;
    moving = animated;
    if (!available) { cancelAnimationFrame(request);request = 0;return; }
    if (!attempted) load();
    schedule();
  };
}
