export const githubUsername = 'AstraThreshold';
export const githubReposURL = `https://api.github.com/users/${githubUsername}/repos?type=owner&per_page=100&sort=full_name&direction=asc`;

export function validGithubSnapshot(value) {
  if (value?.username !== githubUsername || !Number.isSafeInteger(value.stars) || value.stars < 0
    || !Number.isSafeInteger(value.repository_count) || value.repository_count < 0
    || !Number.isFinite(Date.parse(value.updated_at)) || Date.parse(value.updated_at) > Date.now() + 120000) return false;
  if (value.repositories !== undefined) {
    if (!value.repositories || typeof value.repositories !== 'object' || Array.isArray(value.repositories)) return false;
    const counts = Object.values(value.repositories);
    return counts.length === value.repository_count && counts.every(n => Number.isSafeInteger(n) && n >= 0)
      && counts.reduce((sum, n) => sum + n, 0) === value.stars;
  }
  return true;
}

// Aggregate every public repository owned by the account, including forks.
// Never publish a partial sum if a later page fails.
export async function fetchGithubSnapshot({ fetchImpl = fetch, headers = {}, signal = AbortSignal.timeout(12000) } = {}) {
  const repositories = new Map();
  for (let page = 1; page <= 10; page++) {
    const response = await fetchImpl(`${githubReposURL}&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', ...headers },
      credentials: 'omit', cache: 'no-store', signal
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error('Invalid GitHub repository list');
    for (const item of items) {
      if (item.owner?.login?.toLowerCase() !== githubUsername.toLowerCase() || item.private !== false
        || typeof item.name !== 'string' || !Number.isSafeInteger(item.stargazers_count) || item.stargazers_count < 0) {
        throw new Error('Invalid GitHub repository data');
      }
      repositories.set(item.name, item.stargazers_count);
    }
    if (items.length < 100) {
      return {
        username: githubUsername,
        stars: [...repositories.values()].reduce((sum, n) => sum + n, 0),
        repository_count: repositories.size,
        repositories: Object.fromEntries(repositories),
        updated_at: new Date().toISOString(),
        source: githubReposURL
      };
    }
  }
  throw new Error('Repository pagination limit reached; refusing a partial total');
}
