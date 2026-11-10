import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fetchGithubSnapshot, validGithubSnapshot } from '../github-stats.js';

const output = new URL('../assets/data/github.json', import.meta.url);
let snapshot;
try {
  const previous = JSON.parse(await readFile(output, 'utf8'));
  if (validGithubSnapshot(previous)) snapshot = previous;
} catch { /* The first run can obtain a fresh snapshot. */ }

try {
  const response = await fetch('https://astrathreshold.github.io/assets/data/github.json', {
    headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(12000), redirect: 'error'
  });
  if (response.ok) {
    const previous = await response.json();
    if (validGithubSnapshot(previous) && (!snapshot || Date.parse(previous.updated_at) > Date.parse(snapshot.updated_at))) snapshot = previous;
  }
} catch { console.log('Previous GitHub snapshot unavailable; using the local fallback.'); }

try {
  // The workflow supplies its own short-lived token; it never reaches the website.
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  snapshot = await fetchGithubSnapshot({ headers });
  console.log(`GitHub: ${snapshot.stars} stars across ${snapshot.repository_count} public repositories, read at ${snapshot.updated_at}.`);
} catch (error) {
  if (!snapshot) throw new Error('No verified GitHub snapshot is available.', { cause: error });
  console.warn(`GitHub refresh failed (${error.message}); retaining the reading from ${snapshot.updated_at}.`);
}
await mkdir(new URL('../assets/data/', import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n');
