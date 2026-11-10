import { copyFile, lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const required = ['index.html', 'styles.css', 'script.js'];
const optional = ['404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest', '.nojekyll'];
const assetExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2']);
let count = 0;

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
  } else if (info.isFile() && assetExtensions.has(path.extname(relative).toLowerCase())) {
    await copy(source, path.join(output, relative));
  }
}
if (await exists(path.join(root, 'assets'))) await copyAssets('assets');
console.log(`Built ${count} public files into dist/.`);
