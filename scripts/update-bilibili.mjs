import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../assets/data/bilibili.json', import.meta.url);
const published = 'https://astrathreshold.github.io/assets/data/bilibili.json';
const source = 'https://api.bilibili.com/x/relation/stat?vmid=43483079';
const valid = value => value?.mid === 43483079 && Number.isSafeInteger(value.followers)
  && value.followers >= 0 && Number.isFinite(Date.parse(value.updated_at))
  && Date.parse(value.updated_at) <= Date.now() + 120000;

async function getJSON(url, headers = {}) {
  const response = await fetch(url, {
    headers, signal: AbortSignal.timeout(12000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

let snapshot;
try {
  const local = JSON.parse(await readFile(output, 'utf8'));
  if (valid(local)) snapshot = local;
} catch { /* A first build can fetch the initial snapshot. */ }

// Every workflow starts from source. Recover the last published reading before
// querying Bilibili, so upstream outages cannot roll the count back to git data.
try {
  const previous = await getJSON(published, { 'Cache-Control': 'no-cache' });
  if (valid(previous) && (!snapshot || Date.parse(previous.updated_at) > Date.parse(snapshot.updated_at))) snapshot = previous;
} catch { console.log('Previous deployment unavailable; using the local fallback.'); }

try {
  const result = await getJSON(source, {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Referer: 'https://space.bilibili.com/43483079',
    Accept: 'application/json'
  });
  if (result.code !== 0 || result.data?.mid !== 43483079 || !Number.isSafeInteger(result.data.follower) || result.data.follower < 0) {
    throw new Error('Bilibili returned an invalid response');
  }
  snapshot = { mid: 43483079, followers: result.data.follower, updated_at: new Date().toISOString(), source };
  console.log(`Bilibili: ${snapshot.followers} followers, read at ${snapshot.updated_at}.`);
} catch (error) {
  if (!snapshot) throw new Error('No verified Bilibili reading is available.', { cause: error });
  console.warn(`Bilibili refresh failed (${error.message}); retaining the reading from ${snapshot.updated_at}.`);
}

await mkdir(fileURLToPath(new URL('../assets/data/', import.meta.url)), { recursive: true });
await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n');
