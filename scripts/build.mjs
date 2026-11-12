import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validGithubSnapshot } from '../github-stats.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const required = ['index.html', 'styles.css', 'script.js', 'github-stats.js', 'rolling-counter.js', 'gallery.js', 'logo-glow.js'];
const optional = ['404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest', '.nojekyll'];
const assetExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2']);
let count = 0;

// Keep every authored CJK character in the embedded fonts when content changes.
const fontCoverage = JSON.parse(await readFile(path.join(root, 'assets/fonts/coverage.json'), 'utf8'));
const coveredCharacters = new Set(fontCoverage.characters);
const latinCoverage = JSON.parse(await readFile(path.join(root, 'assets/fonts/latin-coverage.json'), 'utf8'));
const coveredLatin = new Set(latinCoverage.characters);
const fontSources = [...required, ...optional].filter(file => /\.(html|css|js)$/.test(file));
const cjkPattern = /[\u2e80-\u9fff\uf900-\ufaff\ufe10-\ufe1f\ufe30-\ufe4f\uff00-\uffef\u{20000}-\u{323af}]/gu;
for (const file of [...fontSources, 'scripts/build.mjs']) {
  const source = await readFile(path.join(root, file), 'utf8').catch(error => {
    if (optional.includes(file) && error.code === 'ENOENT') return '';
    throw error;
  });
  const missing = [...new Set(source.match(cjkPattern))].filter(character => !coveredCharacters.has(character));
  if (missing.length) throw new Error(`Embedded PingFang lacks ${missing.join('')} in ${file}; regenerate with scripts/prepare-pingfang.py.`);
  const cjkCharacters = new Set(source.match(cjkPattern));
  const missingLatin = [...new Set(source)].filter(character => character.codePointAt(0) >= 0x20 && !cjkCharacters.has(character) && !coveredLatin.has(character));
  if (missingLatin.length) throw new Error(`Embedded Latin fonts lack ${missingLatin.join('')} in ${file}; regenerate with scripts/prepare-latin-fonts.py.`);
}
for (const face of fontCoverage.faces) {
  if (!/^pingfang-sc-(light|regular|semibold)\.[a-f0-9]{12}\.woff2$/.test(face.file)) throw new Error('Invalid webfont asset.');
  await readFile(path.join(root, 'assets/fonts', face.file));
}
for (const face of latinCoverage.faces) {
  if (!/^(serif|mono|sans|symbols)-(regular|bold|italic|bold-italic)\.[a-f0-9]{12}\.woff2$/.test(face.file)) throw new Error('Invalid Latin webfont asset.');
  await readFile(path.join(root, 'assets/fonts', face.file));
}

async function exists(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Only replace this checkout's literal dist directory, never a linked target.
const previous = await exists(output);
if (previous) {
  if (previous.isSymbolicLink() || !previous.isDirectory()) throw new Error('dist must be a regular directory.');
  const [actualRoot, actualOutput] = await Promise.all([realpath(root), realpath(output)]);
  if (path.relative(actualRoot, actualOutput) !== 'dist') throw new Error('Refusing to replace dist outside this checkout.');
}
for (const file of required) {
  const info = await exists(path.join(root, file));
  if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`Missing regular source file: ${file}`);
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

async function copy(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Unsupported source: ${source}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  count++;
}
for (const file of required) await copy(path.join(root, file), path.join(output, file));
for (const file of optional) {
  if (await exists(path.join(root, file))) await copy(path.join(root, file), path.join(output, file));
}

async function copyAssets(relative) {
  const source = path.join(root, relative);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Linked assets are not supported: ${relative}`);
  if (info.isDirectory()) {
    for (const item of await readdir(source)) {
      if (!item.startsWith('.')) await copyAssets(path.join(relative, item));
    }
  } else if (info.isFile() && (assetExtensions.has(path.extname(relative).toLowerCase()) || ['assets/data/bilibili.json', 'assets/data/github.json', 'assets/fonts/pingfang.css', 'assets/fonts/latin.css', 'assets/fonts/CASCADIA-LICENSE.txt', 'assets/icons/LICENSE-octicons.txt', 'assets/icons/LICENSE-simple-icons.txt', 'assets/icons/LICENSE-heroicons.txt'].includes(relative.split(path.sep).join('/')))) {
    await copy(source, path.join(output, relative));
  }
}
if (await exists(path.join(root, 'assets'))) await copyAssets('assets');

// Keep the entry module and its imports on the same fresh source version.
const modules = required.filter(file => file.endsWith('.js'));
const moduleContents = await Promise.all(modules.map(file => readFile(path.join(output, file), 'utf8')));
const moduleVersion = createHash('sha256').update(moduleContents.join('\0')).digest('hex').slice(0, 12);
for (let i = 0; i < modules.length; i++) {
  const code = moduleContents[i].replace(/(\bfrom\s*)(['"])(\.\/[^'"?]+\.js)\2/g, (_match, before, quote, file) => `${before}${quote}${file}?v=${moduleVersion}${quote}`);
  await writeFile(path.join(output, modules[i]), code);
}

// A changed stylesheet gets a new URL, even while older CSS is cached.
const stylesheetVersions = new Map();
function preloadFonts(markup, errorPage = false) {
  const faces = [
    ...fontCoverage.faces.filter(face => face.weight === 400 || (!errorPage && face.weight === 600)),
    ...latinCoverage.faces.filter(face => ['regular', 'bold'].includes(face.style)
      && (face.family === 'WoooLAB Serif' || (!errorPage && face.family === 'WoooLAB Mono')))
  ];
  const prefix = errorPage ? '/' : '';
  const links = faces.map(face => `<link rel="preload" href="${prefix}assets/fonts/${face.file}" as="font" type="font/woff2" crossorigin>`);
  return markup.replace('<!-- font-preloads -->', links.join('\n  '));
}
async function versionStylesheets(markup) {
  for (const match of markup.matchAll(/<link\b[^>]*>/g)) {
    const tag = match[0];
    if (!/\brel="stylesheet"/.test(tag)) continue;
    const href = tag.match(/\bhref="([^"]+)"/)?.[1];
    if (!href || /^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    const relative = href.split(/[?#]/, 1)[0].replace(/^\/+/, '');
    const file = path.resolve(output, relative);
    if (path.relative(output, file).startsWith('..')) throw new Error('Stylesheet must stay inside dist.');
    if (!stylesheetVersions.has(relative)) {
      stylesheetVersions.set(relative, createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 12));
    }
    const versionedHref = `${href.startsWith('/') ? '/' : ''}${relative}?v=${stylesheetVersions.get(relative)}`;
    markup = markup.replace(tag, tag.replace(`href="${href}"`, `href="${versionedHref}"`));
  }
  return markup;
}
// Keep the initial HTML reading useful even before JavaScript or if a request fails.
const stats = JSON.parse(await readFile(path.join(root, 'assets/data/bilibili.json'), 'utf8'));
if (stats.mid !== 43483079 || !Number.isSafeInteger(stats.followers) || stats.followers < 0 || !Number.isFinite(Date.parse(stats.updated_at))) {
  throw new Error('A verified Bilibili snapshot is required.');
}
const indexPath = path.join(output, 'index.html');
const initialTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(stats.updated_at));
const github = JSON.parse(await readFile(path.join(root, 'assets/data/github.json'), 'utf8'));
if (!validGithubSnapshot(github)) throw new Error('A verified GitHub snapshot is required.');
const githubTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(github.updated_at));
let index = (await readFile(indexPath, 'utf8'))
  .replace(/<strong id="follower-count"[^>]*>[^<]*<\/strong>/, `<strong id="follower-count" data-updated-at="${new Date(stats.updated_at).toISOString()}">${stats.followers.toLocaleString('en-US')}</strong>`)
  .replace(/(id="follower-status"[^>]*>)[^<]*/, `$1最近读取：${initialTime} (UTC+8)`)
  .replace(/<strong id="github-stars"[^>]*>[^<]*<\/strong>/, `<strong id="github-stars" data-updated-at="${new Date(github.updated_at).toISOString()}" data-repository-count="${github.repository_count}">${github.stars.toLocaleString('en-US')}</strong>`)
  .replace(/(id="github-status"[^>]*>)[^<]*/, `$1最近读取：${githubTime} (UTC+8)`);
index = index.replace(/(<a class="project-stars" data-repo="([^"]+)"[^>]*aria-label=")[^"]*("[^>]*><strong>)[^<]*(<\/strong>)/g, (match, before, repo, middle, after) => {
  const stars = github.repositories?.[repo];
  return stars === undefined ? match : `${before}${stars.toLocaleString('en-US')} GitHub stars${middle}${stars.toLocaleString('en-US')}${after}`;
});
index = index.replace('src="script.js"', `src="script.js?v=${moduleVersion}"`);
await writeFile(indexPath, await versionStylesheets(preloadFonts(index)));
const errorPage = path.join(output, '404.html');
if (await exists(errorPage)) await writeFile(errorPage, await versionStylesheets(preloadFonts(await readFile(errorPage, 'utf8'), true)));
console.log(`Built ${count} public files into dist/.`);
