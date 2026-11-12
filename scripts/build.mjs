import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validGithubSnapshot } from '../github-stats.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const required = ['index.html', 'styles.css', 'script.js', 'github-stats.js', 'rolling-counter.js', 'gallery.js'];
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
  } else if (info.isFile() && (assetExtensions.has(path.extname(relative).toLowerCase()) || ['assets/data/bilibili.json', 'assets/data/github.json', 'assets/fonts/pingfang.css', 'assets/fonts/latin.css', 'assets/fonts/CASCADIA-LICENSE.txt'].includes(relative.split(path.sep).join('/')))) {
    await copy(source, path.join(output, relative));
  }
}
if (await exists(path.join(root, 'assets'))) await copyAssets('assets');
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
await writeFile(indexPath, index);
console.log(`Built ${count} public files into dist/.`);
