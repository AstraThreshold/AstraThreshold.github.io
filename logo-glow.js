// Draw and dither the final backdrop colors, rather than quantizing a translucent
// gradient first. This also avoids visible rings while the light fades in.
const stops = [0, .36, .63, 1];
const clamp = value => Math.max(0, Math.min(1, value));

function color(value) {
  value = value.trim();
  if (value.startsWith('#')) return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).concat(1);
  const values = value.match(/[\d.]+/g).map(Number);
  return values.slice(0, 3).map(channel => channel / 255).concat(values[3] ?? 1);
}

function slopes(values) {
  const h = stops.slice(1).map((x, i) => x - stops[i]);
  const d = h.map((step, i) => (values[i + 1] - values[i]) / step);
  return [0, ...[1, 2].map(i => {
    if (d[i - 1] * d[i] <= 0) return 0;
    const a = 2 * h[i] + h[i - 1], b = h[i] + 2 * h[i - 1];
    return (a + b) / (a / d[i - 1] + b / d[i]);
  }), 0];
}

function sample(radius, values, tangent) {
  if (radius >= 1) return 0;
  const i = radius <= stops[1] ? 0 : radius <= stops[2] ? 1 : 2;
  const h = stops[i + 1] - stops[i], t = (radius - stops[i]) / h;
  const a = t * t, b = a * t;
  return (2 * b - 3 * a + 1) * values[i] + (b - 2 * a + t) * h * tangent[i]
    + (-2 * b + 3 * a) * values[i + 1] + (b - a) * h * tangent[i + 1];
}

const fragment = `
precision highp float;
uniform vec2 resolution, size, center, radius;
uniform vec3 paper, d0, d1, d2, m1, m2;
uniform float energy;
vec3 hermite(vec3 a,vec3 b,vec3 ma,vec3 mb,float t,float h){
  float t2=t*t,t3=t2*t;
  return (2.0*t3-3.0*t2+1.0)*a+(t3-2.0*t2+t)*h*ma
    +(-2.0*t3+3.0*t2)*b+(t3-t2)*h*mb;
}
float noise(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
void main(){
  vec2 p=vec2(gl_FragCoord.x/resolution.x,1.0-gl_FragCoord.y/resolution.y)*size;
  float r=length((p-center)/radius);
  vec3 delta=vec3(0.0);
  if(r<=.36) delta=hermite(d0,d1,vec3(0.0),m1,r/.36,.36);
  else if(r<=.63) delta=hermite(d1,d2,m1,m2,(r-.36)/.27,.27);
  else if(r<1.0) delta=hermite(d2,vec3(0.0),m2,vec3(0.0),(r-.63)/.37,.37);
  delta*=energy;
  float signal=max(max(abs(delta.r),abs(delta.g)),abs(delta.b));
  float gain=min(1.0,sqrt(signal*255.0));
  float grain=(noise(gl_FragCoord.xy)-noise(gl_FragCoord.xy+vec2(19.19,73.73)))*gain/255.0;
  gl_FragColor=vec4(clamp(paper+delta+grain,0.0,1.0),1.0);
}`;

function gpuRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const shader = (type, code) => {
    const result = gl.createShader(type); gl.shaderSource(result, code); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Glow shader unavailable.');
    return result;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Glow program unavailable.');
  gl.useProgram(program); gl.disable(gl.DITHER);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const locations = Object.fromEntries(['resolution','size','center','radius','paper','d0','d1','d2','m1','m2','energy'].map(name => [name, gl.getUniformLocation(program, name)]));
  return {
    kind: 'webgl',
    configure(config) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      for (const [name, values] of Object.entries({ resolution: [canvas.width, canvas.height], size: config.size, center: config.center, radius: config.radius })) gl.uniform2fv(locations[name], values);
      gl.uniform3fv(locations.paper, config.paper);
      for (let i = 0; i < 3; i++) gl.uniform3fv(locations['d' + i], config.delta.map(channel => channel[i]));
      for (const i of [1, 2]) gl.uniform3fv(locations['m' + i], config.tangent.map(channel => channel[i]));
    },
    draw(energy) { gl.uniform1f(locations.energy, energy); gl.drawArrays(gl.TRIANGLES, 0, 6); }
  };
}

function canvasRenderer(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  let image, pixels, offsets, deltas, grains, peaks, paper;
  return {
    kind: 'canvas2d',
    configure(config) {
      image = context.createImageData(canvas.width, canvas.height); pixels = image.data;
      paper = config.paper.map(channel => channel * 255);
      const index = [], fields = [], noise = [], maxima = [];
      let seed = 173;
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        for (let c = 0; c < 3; c++) pixels[offset + c] = paper[c]; pixels[offset + 3] = 255;
        const dx = ((x + .5) / canvas.width * config.size[0] - config.center[0]) / config.radius[0];
        const dy = ((y + .5) / canvas.height * config.size[1] - config.center[1]) / config.radius[1];
        const r = Math.hypot(dx, dy);
        if (r >= 1) continue;
        const delta = config.delta.map((channel, c) => sample(r, channel, config.tangent[c]) * 255);
        index.push(offset); fields.push(...delta); noise.push(random() - random()); maxima.push(Math.max(...delta.map(Math.abs)));
      }
      offsets = Uint32Array.from(index); deltas = Float32Array.from(fields); grains = Float32Array.from(noise); peaks = Float32Array.from(maxima);
    },
    draw(energy) {
      for (let i = 0; i < offsets.length; i++) {
        const grain = grains[i] * Math.min(1, Math.sqrt(peaks[i] * energy));
        for (let c = 0; c < 3; c++) pixels[offsets[i] + c] = paper[c] + deltas[i * 3 + c] * energy + grain;
      }
      context.putImageData(image, 0, 0);
    }
  };
}

export function initLogoGlow() {
  const brand = document.querySelector('.site-header .brand');
  if (!brand) return;
  const logo = brand.querySelector('img');
  let canvas = document.createElement('canvas'), renderer;
  canvas.className = 'brand-aura-canvas'; canvas.setAttribute('aria-hidden', 'true'); brand.prepend(canvas);
  try { renderer = gpuRenderer(canvas); } catch { /* Use a fresh canvas for the 2D renderer. */ }
  if (!renderer) {
    canvas.replaceWith(canvas = canvas.cloneNode());
    renderer = canvasRenderer(canvas);
  }
  if (!renderer) { canvas.remove(); return; }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  let request = 0, configuration = '', startBrightness = 1, endBrightness = 1.18, unavailable = false;
  const brightness = filter => Number(filter.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1);

  function configure() {
    const style = getComputedStyle(brand);
    const size = [canvas.clientWidth, canvas.clientHeight], dpr = Math.min(devicePixelRatio || 1, 2);
    if (!size[0] || !size[1]) return false;
    const paper = color(style.getPropertyValue('--paper')).slice(0, 3);
    const colors = ['core','mid','edge'].map(key => color(style.getPropertyValue('--brand-aura-' + key)));
    const radius = style.getPropertyValue('--brand-aura-radii').match(/[\d.]+/g).map(Number);
    canvas.style.transform = '';
    const box = canvas.getBoundingClientRect();
    const shift = [Math.round((box.x + scrollX) * dpr) / dpr - box.x - scrollX, Math.round((box.y + scrollY) * dpr) / dpr - box.y - scrollY];
    canvas.style.transform = `translate(calc(-50% + ${shift[0]}px), calc(-38% + ${shift[1]}px))`;
    const center = [size[0] / 2 - shift[0], size[1] * .38 - shift[1]];
    const key = JSON.stringify([size, dpr, paper, colors, radius, center]);
    startBrightness = brightness(style.getPropertyValue('--logo-filter'));
    endBrightness = brightness(style.getPropertyValue('--header-logo-filter'));
    if (key !== configuration) {
      configuration = key; canvas.width = Math.round(size[0] * dpr); canvas.height = Math.round(size[1] * dpr);
      const delta = paper.map((base, c) => colors.map(value => (value[c] - base) * value[3]).concat(0));
      renderer.configure({ size, paper, center, radius, delta, tangent: delta.map(slopes) });
    }
    return true;
  }

  function draw() {
    request = 0;
    const energy = reducedMotion.matches ? 1 : clamp((brightness(getComputedStyle(logo).filter) - startBrightness) / (endBrightness - startBrightness));
    renderer.draw(energy); brand.dataset.glowRenderer = renderer.kind;
    if (!reducedMotion.matches && logo.getAnimations().some(animation => animation.playState === 'running' || animation.pending)) request = requestAnimationFrame(draw);
  }
  function refresh() { if (!unavailable && configure() && !request) request = requestAnimationFrame(draw); }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); unavailable = true; cancelAnimationFrame(request); request = 0; delete brand.dataset.glowRenderer; });
  const observer = new ResizeObserver(refresh); observer.observe(brand);
  scheme.addEventListener('change', refresh); reducedMotion.addEventListener('change', refresh);
  addEventListener('resize', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.fonts.ready.then(refresh);
  document.addEventListener('site-fonts-ready', refresh);
  refresh();
}
