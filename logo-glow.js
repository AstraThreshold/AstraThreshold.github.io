// Blend both the wide aura and the wordmark's close glow before dithering once.
// CSS blur layers would quantize the close glow again after that final step.
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

function blurAlpha(source, width, height, sigma) {
  const reach = Math.ceil(sigma * 3.5), kernel = new Float32Array(reach * 2 + 1);
  let total = 0;
  for (let i = -reach; i <= reach; i++) total += kernel[i + reach] = Math.exp(-i * i / (2 * sigma * sigma));
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
  const temporary = new Float32Array(source.length), result = new Float32Array(source.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const first = Math.max(-reach, -x), last = Math.min(reach, width - 1 - x);
    let value = 0;
    for (let i = first; i <= last; i++) value += source[y * width + x + i] * kernel[i + reach];
    temporary[y * width + x] = value;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const first = Math.max(-reach, -y), last = Math.min(reach, height - 1 - y);
    let value = 0;
    for (let i = first; i <= last; i++) value += temporary[(y + i) * width + x] * kernel[i + reach];
    result[y * width + x] = value;
  }
  return result;
}

function wordmarkGlow(logo, dpr) {
  const padding = 48, size = [logo.clientWidth + padding * 2, logo.clientHeight + padding * 2];
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(size[0] * dpr); canvas.height = Math.ceil(size[1] * dpr);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(logo, padding * dpr, padding * dpr, logo.clientWidth * dpr, logo.clientHeight * dpr);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = Float32Array.from({ length: canvas.width * canvas.height }, (_, i) => pixels[i * 4 + 3] / 255);
  const masks = [3, 12].map(sigma => blurAlpha(alpha, canvas.width, canvas.height, sigma * dpr));
  const texture = new Uint8Array(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) for (let layer = 0; layer < 2; layer++) {
    const value = Math.round(masks[layer][i] * 65535);
    texture[i * 4 + layer * 2] = value >> 8; texture[i * 4 + layer * 2 + 1] = value & 255;
  }
  return { size, width: canvas.width, height: canvas.height, masks, texture };
}

function maskAt(mask, width, height, x, y) {
  const left = Math.floor(x), top = Math.floor(y), dx = x - left, dy = y - top;
  if (left < 0 || top < 0 || left + 1 >= width || top + 1 >= height) return 0;
  const i = top * width + left;
  return (mask[i] * (1 - dx) + mask[i + 1] * dx) * (1 - dy)
    + (mask[i + width] * (1 - dx) + mask[i + width + 1] * dx) * dy;
}

const fragment = `
precision highp float;
uniform vec2 resolution, size, center, radius;
uniform vec3 paper, d0, d1, d2, m1, m2;
uniform vec2 glowSize;
uniform vec4 glowCore, glowHalo;
uniform sampler2D glowMask;
uniform float spread;
vec3 hermite(vec3 a,vec3 b,vec3 ma,vec3 mb,float t,float h){
  float t2=t*t,t3=t2*t;
  return (2.0*t3-3.0*t2+1.0)*a+(t3-2.0*t2+t)*h*ma
    +(-2.0*t3+3.0*t2)*b+(t3-t2)*h*mb;
}
float noise(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
void main(){
  vec2 p=vec2(gl_FragCoord.x/resolution.x,1.0-gl_FragCoord.y/resolution.y)*size;
  float r=spread>0.0?length((p-center)/radius)/spread:2.0;
  vec3 delta=vec3(0.0);
  if(r<=.36) delta=hermite(d0,d1,vec3(0.0),m1,r/.36,.36);
  else if(r<=.63) delta=hermite(d1,d2,m1,m2,(r-.36)/.27,.27);
  else if(r<1.0) delta=hermite(d2,vec3(0.0),m2,vec3(0.0),(r-.63)/.37,.37);
  delta*=spread;
  vec2 uv=(p-center)/glowSize+.5;
  vec4 mask=texture2D(glowMask,uv);
  vec2 alpha=vec2(dot(mask.rg,vec2(256.0,1.0)/257.0),dot(mask.ba,vec2(256.0,1.0)/257.0));
  vec3 backdrop=paper+delta;
  backdrop=mix(backdrop,glowHalo.rgb,alpha.y*glowHalo.a*spread);
  backdrop=mix(backdrop,glowCore.rgb,alpha.x*glowCore.a*spread);
  delta=backdrop-paper;
  float signal=max(max(abs(delta.r),abs(delta.g)),abs(delta.b));
  float gain=min(1.0,sqrt(signal*255.0));
  float grain=(noise(gl_FragCoord.xy)-noise(gl_FragCoord.xy+vec2(19.19,73.73)))*gain*1.5/255.0;
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
  const locations = Object.fromEntries(['resolution','size','center','radius','paper','d0','d1','d2','m1','m2','spread','glowSize','glowCore','glowHalo','glowMask'].map(name => [name, gl.getUniformLocation(program, name)]));
  const texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const edge of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, edge, gl.CLAMP_TO_EDGE);
  for (const filter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, filter, gl.LINEAR);
  gl.uniform1i(locations.glowMask, 0);
  return {
    kind: 'webgl',
    configure(config) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      for (const [name, values] of Object.entries({ resolution: [canvas.width, canvas.height], size: config.size, center: config.center, radius: config.radius })) gl.uniform2fv(locations[name], values);
      gl.uniform3fv(locations.paper, config.paper);
      gl.uniform2fv(locations.glowSize, config.near.size);
      gl.uniform4fv(locations.glowCore, config.glowCore); gl.uniform4fv(locations.glowHalo, config.glowHalo);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, config.near.width, config.near.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, config.near.texture);
      for (let i = 0; i < 3; i++) gl.uniform3fv(locations['d' + i], config.delta.map(channel => channel[i]));
      for (const i of [1, 2]) gl.uniform3fv(locations['m' + i], config.tangent.map(channel => channel[i]));
    },
    draw(spread) { gl.uniform1f(locations.spread, spread); gl.drawArrays(gl.TRIANGLES, 0, 6); }
  };
}

function canvasRenderer(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const steps = 4096;
  let image, pixels, offsets, distances, grains, profile, paper, near, glowCore, glowHalo;
  return {
    kind: 'canvas2d',
    configure(config) {
      image = context.createImageData(canvas.width, canvas.height); pixels = image.data;
      paper = config.paper.map(channel => channel * 255);
      glowCore = config.glowCore.map((value, i) => i < 3 ? value * 255 : value);
      glowHalo = config.glowHalo.map((value, i) => i < 3 ? value * 255 : value);
      profile = new Float32Array((steps + 1) * 4);
      for (let i = 0; i <= steps; i++) {
        const delta = config.delta.map((channel, c) => sample(i / steps, channel, config.tangent[c]) * 255);
        profile.set([...delta, Math.max(...delta.map(Math.abs))], i * 4);
      }
      const index = [], radii = [], noise = [], local = [];
      let seed = 173;
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        for (let c = 0; c < 3; c++) pixels[offset + c] = paper[c]; pixels[offset + 3] = 255;
        const dx = ((x + .5) / canvas.width * config.size[0] - config.center[0]) / config.radius[0];
        const dy = ((y + .5) / canvas.height * config.size[1] - config.center[1]) / config.radius[1];
        const r = Math.hypot(dx, dy);
        if (r >= 1) continue;
        index.push(offset); radii.push(r); noise.push(random() - random());
        const mx = (dx * config.radius[0] / config.near.size[0] + .5) * config.near.width - .5;
        const my = (dy * config.radius[1] / config.near.size[1] + .5) * config.near.height - .5;
        for (const mask of config.near.masks) local.push(maskAt(mask, config.near.width, config.near.height, mx, my));
      }
      offsets = Uint32Array.from(index); distances = Float32Array.from(radii); grains = Float32Array.from(noise);
      near = Float32Array.from(local);
    },
    draw(spread) {
      for (let i = 0; i < offsets.length; i++) {
        const r = spread > 0 ? distances[i] / spread : 1;
        const position = Math.min(r, 1) * steps, before = Math.min(Math.floor(position), steps - 1) * 4, mix = position - before / 4;
        const core = near[i * 2] * glowCore[3] * spread, halo = near[i * 2 + 1] * glowHalo[3] * spread;
        let peak = 0;
        for (let c = 0; c < 3; c++) {
          const delta = profile[before + c] + (profile[before + c + 4] - profile[before + c]) * mix;
          const base = paper[c] + delta * spread;
          const blended = (base * (1 - halo) + glowHalo[c] * halo) * (1 - core) + glowCore[c] * core;
          peak = Math.max(peak, Math.abs(blended - paper[c]));
        }
        const grain = grains[i] * Math.min(1, Math.sqrt(peak)) * 1.5;
        for (let c = 0; c < 3; c++) {
          const delta = profile[before + c] + (profile[before + c + 4] - profile[before + c]) * mix;
          const base = paper[c] + delta * spread;
          pixels[offsets[i] + c] = (base * (1 - halo) + glowHalo[c] * halo) * (1 - core) + glowCore[c] * core + grain;
        }
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
  let request = 0, configuration = '', maskKey = '', near, startBrightness = 1, endBrightness = 1.18, unavailable = false, introComplete = false, themeSnapshot;
  const brightness = filter => Number(filter.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1);

  function configure() {
    const style = getComputedStyle(brand);
    const size = [canvas.clientWidth, canvas.clientHeight], dpr = Math.min(devicePixelRatio || 1, 2);
    if (!size[0] || !size[1] || !logo.complete || !logo.naturalWidth) return false;
    const paper = color(style.getPropertyValue('--paper')).slice(0, 3);
    const colors = ['core','mid','edge'].map(key => color(style.getPropertyValue('--brand-aura-' + key)));
    const glowCore = color(style.getPropertyValue('--brand-glow')), glowHalo = color(style.getPropertyValue('--brand-halo'));
    const radius = style.getPropertyValue('--brand-aura-radii').match(/[\d.]+/g).map(Number);
    canvas.style.transform = '';
    const box = canvas.getBoundingClientRect();
    const shift = [Math.round((box.x + scrollX) * dpr) / dpr - box.x - scrollX, Math.round((box.y + scrollY) * dpr) / dpr - box.y - scrollY];
    canvas.style.transform = `translate(calc(-50% + ${shift[0]}px), calc(-38% + ${shift[1]}px))`;
    const center = [size[0] / 2 - shift[0], size[1] * .38 - shift[1]];
    const sourceKey = JSON.stringify([logo.currentSrc, logo.clientWidth, logo.clientHeight, dpr]);
    if (sourceKey !== maskKey) { near = wordmarkGlow(logo, dpr); maskKey = sourceKey; }
    const key = JSON.stringify([size, dpr, paper, colors, radius, center, sourceKey, glowCore, glowHalo]);
    startBrightness = brightness(style.getPropertyValue('--logo-filter'));
    endBrightness = brightness(style.getPropertyValue('--header-logo-filter'));
    if (key !== configuration) {
      configuration = key; canvas.width = Math.round(size[0] * dpr); canvas.height = Math.round(size[1] * dpr);
      const delta = paper.map((base, c) => colors.map(value => (value[c] - base) * value[3]).concat(0));
      renderer.configure({ size, paper, center, radius, delta, tangent: delta.map(slopes), near, glowCore, glowHalo });
    }
    return true;
  }

  function draw() {
    request = 0;
    const spread = reducedMotion.matches || introComplete ? 1 : clamp((brightness(getComputedStyle(logo).filter) - startBrightness) / (endBrightness - startBrightness));
    renderer.draw(spread); brand.dataset.glowRenderer = renderer.kind;
    if (!reducedMotion.matches && logo.getAnimations().some(animation => animation.playState === 'running' || animation.pending)) request = requestAnimationFrame(draw);
  }
  function refresh() { if (!unavailable && configure() && !request) request = requestAnimationFrame(draw); }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); unavailable = true; cancelAnimationFrame(request); request = 0; delete brand.dataset.glowRenderer; });
  const observer = new ResizeObserver(refresh); observer.observe(brand);
  logo.addEventListener('load', refresh);
  scheme.addEventListener('change', refresh); reducedMotion.addEventListener('change', refresh);
  addEventListener('resize', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.fonts.ready.then(refresh);
  document.addEventListener('site-fonts-ready', refresh);
  document.addEventListener('site-theme-before-change', () => {
    const intro = logo.getAnimations().find(animation => animation.animationName === 'brand-glow-in');
    if (intro?.playState === 'finished') { introComplete = true; logo.style.animation = 'none'; }
  });
  document.addEventListener('site-theme-change', event => {
    const duration = event.detail?.duration || 0;
    if (duration && brand.dataset.glowRenderer) {
      const snapshot = canvas.cloneNode(), context = snapshot.getContext('2d');
      context.drawImage(canvas, 0, 0);
      if (themeSnapshot) {
        context.globalAlpha = Number(getComputedStyle(themeSnapshot).opacity);
        context.drawImage(themeSnapshot, 0, 0);
      }
      themeSnapshot?.remove(); themeSnapshot = snapshot; canvas.after(snapshot);
      snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }).finished.then(() => {
        snapshot.remove(); if (themeSnapshot === snapshot) themeSnapshot = null;
      }, () => snapshot.remove());
    } else { themeSnapshot?.remove(); themeSnapshot = null; }
    // View transitions pause rendering during the update callback: draw the new
    // palette now, so its snapshot cannot capture the previous theme's canvas.
    if (!unavailable && configure()) { cancelAnimationFrame(request); request = 0; draw(); }
  });
  refresh();
}
