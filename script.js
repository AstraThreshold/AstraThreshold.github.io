import { fetchGithubSnapshot, validGithubSnapshot, githubUsername } from './github-stats.js';
import { RollingCounter } from './rolling-counter.js';
import { initGallery } from './gallery.js';
import { initLogoGlow } from './logo-glow.js';

initLogoGlow();

/* Both languages remain in the HTML, including the no-JavaScript default. */
const translations = [...document.querySelectorAll('[data-en]')].map(element => ({
  element, zh: element.innerHTML, en: element.dataset.en
}));
const countElement = document.getElementById('follower-count');
const statusElement = document.getElementById('follower-status');
const refreshButton = document.getElementById('refresh-followers');
const cacheKey = 'wooolab-bilibili-snapshot';
const githubElement = document.getElementById('github-stars');
const githubStatus = document.getElementById('github-status');
const githubCacheKey = 'wooolab-github-snapshot';
let githubSnapshot = null;
let githubFetching = false;
let githubFailed = false;
let githubMode = 'snapshot';
let nextGithubLiveRead = 0;
let manualRefreshing = false;
let language = 'zh';
const gallery = initGallery(() => language);
let snapshot = null;
let fetching = false;
let refreshFailed = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const followerReels = new RollingCounter(countElement, reducedMotion);
const githubReels = new RollingCounter(githubElement, reducedMotion);

function validSnapshot(value) {
  return value?.mid === 43483079 && Number.isSafeInteger(value.followers) && value.followers >= 0
    && Number.isFinite(Date.parse(value.updated_at)) && Date.parse(value.updated_at) <= Date.now() + 120000;
}

const initialSnapshot = { mid: 43483079, followers: Number(countElement?.textContent.replaceAll(',', '')), updated_at: countElement?.dataset.updatedAt };
if (validSnapshot(initialSnapshot)) snapshot = initialSnapshot;
const initialGithub = {
  username: githubUsername, stars: Number(githubElement?.textContent.replaceAll(',', '')),
  repository_count: Number(githubElement?.dataset.repositoryCount), updated_at: githubElement?.dataset.updatedAt
};
if (validGithubSnapshot(initialGithub)) githubSnapshot = initialGithub;

function renderCount(animate) {
  const target = snapshot.followers;
  const format = new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'zh-CN');
  const finalText = format.format(target);
  countElement.closest('a')?.setAttribute('aria-label', `${finalText} ${language === 'en' ? 'Bilibili followers' : 'Bilibili 关注者'}`);
  followerReels.render(target, { animate });
}

function renderFollowers({ animate = false } = {}) {
  if (!snapshot || !countElement || !statusElement) return;
  const locale = language === 'en' ? 'en-GB' : 'zh-CN';
  renderCount(animate);
  const updated = new Date(snapshot.updated_at);
  const stale = refreshFailed || Date.now() - updated.getTime() > 2 * 60 * 60 * 1000;
  const label = language === 'en' ? (stale ? 'Last available' : 'Updated') : (stale ? '最近可用' : '更新于');
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(updated);
  statusElement.textContent = `${label} ${time} (UTC+8)`;
  statusElement.title = language === 'en'
    ? `Read at ${updated.toISOString()}. Collected about every 15 minutes; this page checks every minute. Scheduling and caching may delay updates.`
    : `实际读取时间：${updated.toISOString()}。约每 15 分钟采集一次，页面每分钟检查更新；任务调度与缓存可能造成延迟。`;
}

function renderGithub({ animate = false } = {}) {
  if (!githubSnapshot || !githubElement || !githubStatus) return;
  const format = new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'zh-CN');
  githubReels.render(githubSnapshot.stars, { animate });
  githubElement.closest('a')?.setAttribute('aria-label', `${format.format(githubSnapshot.stars)} GitHub stars`);
  const updated = new Date(githubSnapshot.updated_at);
  const stale = githubFailed || Date.now() - updated.getTime() > 2 * 60 * 60 * 1000;
  const label = language === 'en' ? (stale ? 'Last available' : 'Updated') : (stale ? '最近可用' : '更新于');
  const time = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(updated);
  githubStatus.textContent = `${label} ${time} (UTC+8)`;
  githubStatus.dataset.mode = githubMode;
  githubStatus.title = language === 'en'
    ? `Stars received by ${githubSnapshot.repository_count} public repositories owned by ${githubUsername}. Read at ${updated.toISOString()}.`
    : `${githubUsername} 名下 ${githubSnapshot.repository_count} 个公开仓库的 stars 合计。实际读取时间：${updated.toISOString()}。`;
  if (githubSnapshot.repositories) {
    document.querySelectorAll('.project-stars[data-repo]').forEach(link => {
      const stars = githubSnapshot.repositories[link.dataset.repo];
      if (stars === undefined) return;
      link.querySelector('strong').textContent = format.format(stars);
      link.setAttribute('aria-label', `${format.format(stars)} GitHub stars`);
    });
    const dateLabel = document.getElementById('project-stats-date');
    if (dateLabel) dateLabel.textContent = language === 'en' ? `GitHub figures updated ${time} (UTC+8).` : `GitHub 数据更新于 ${time} (UTC+8)。`;
  }
}

function acceptGithub(next, mode) {
  if (!validGithubSnapshot(next)) throw new Error('Invalid GitHub snapshot');
  if (!githubSnapshot || Date.parse(next.updated_at) >= Date.parse(githubSnapshot.updated_at)) {
    githubSnapshot = next;
    githubMode = mode;
    try { localStorage.setItem(githubCacheKey, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  }
}

async function refreshGithub({ forceLive = false } = {}) {
  if (githubFetching || !githubElement) return;
  githubFetching = true;
  let received = false;
  try {
    try {
      const response = await fetch('assets/data/github.json', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('GitHub snapshot unavailable');
      acceptGithub(await response.json(), 'snapshot');
      received = true;
      githubFailed = false;
      renderGithub();
    } catch { /* A cached reading or the public API can still be used. */ }
    if (forceLive || Date.now() >= nextGithubLiveRead) {
      try {
        acceptGithub(await fetchGithubSnapshot(), 'live');
        received = true;
        nextGithubLiveRead = Date.now() + 5 * 60 * 1000;
      } catch {
        // Anonymous API quotas vary by visitor. Keep using the scheduled reading.
        nextGithubLiveRead = Date.now() + 15 * 60 * 1000;
      }
    }
    githubFailed = !received;
  } finally {
    githubFetching = false;
    renderGithub();
  }
}

async function refreshStatistics({ animate = false, forceLive = false } = {}) {
  if (manualRefreshing) return;
  manualRefreshing = true;
  if (refreshButton) refreshButton.disabled = true;
  if (animate) {
    renderFollowers({ animate: true });
    renderGithub({ animate: true });
  }
  try { await Promise.all([refreshFollowers(), refreshGithub({ forceLive })]); }
  finally {
    manualRefreshing = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

function setLanguage(value) {
  language = value === 'en' ? 'en' : 'zh';
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  // These fragments are trusted, repository-owned translations, never remote data.
  translations.forEach(item => { item.element.innerHTML = item[language]; });
  gallery.updateLanguage();
  document.querySelectorAll('[data-language]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  });
  document.querySelector('meta[name="description"]').content = language === 'en'
    ? 'Heng Zhang / AstraThreshold. ROAS PhD student at HKUST(GZ), Electronic Hardware Intern at BrainCo. Hardware, embedded systems, and open source.'
    : 'Heng Zhang / AstraThreshold 的个人主页。港科广 ROAS 博士生、强脑科技电子硬件实习生，关注硬件、嵌入式系统与开源开发。';
  try { localStorage.setItem('wooolab-language', language); } catch { /* Storage is optional. */ }
  renderFollowers();
  renderGithub();
  if (refreshButton) refreshButton.title = language === 'en' ? 'Refresh public statistics' : '刷新公开统计';
}

async function refreshFollowers() {
  if (fetching || !countElement) return;
  fetching = true;
  try {
    const response = await fetch('assets/data/bilibili.json', {
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Count unavailable');
    const next = await response.json();
    if (!validSnapshot(next)) throw new Error('Invalid count');
    if (!snapshot || Date.parse(next.updated_at) >= Date.parse(snapshot.updated_at)) {
      snapshot = next;
      try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Storage is optional. */ }
    }
    refreshFailed = false;
  } catch { refreshFailed = true; }
  finally {
    fetching = false;
    renderFollowers();
  }
}

document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
let preferredLanguage;
try {
  preferredLanguage = localStorage.getItem('wooolab-language');
  const cached = JSON.parse(localStorage.getItem(cacheKey));
  if (validSnapshot(cached) && (!snapshot || Date.parse(cached.updated_at) > Date.parse(snapshot.updated_at))) snapshot = cached;
  const githubCached = JSON.parse(localStorage.getItem(githubCacheKey));
  if (validGithubSnapshot(githubCached)) acceptGithub(githubCached, 'cached');
} catch { /* Use the static content and browser locale. */ }
if (!['zh', 'en'].includes(preferredLanguage)) preferredLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
setLanguage(preferredLanguage);
renderFollowers({ animate: true });
renderGithub({ animate: true });
refreshButton?.addEventListener('click', () => refreshStatistics({ animate: true, forceLive: true }));
refreshStatistics();
setInterval(() => {
  if (!document.hidden) {
    refreshFollowers();
    refreshGithub();
  }
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    refreshFollowers();
    refreshGithub();
  }
  else {
    followerReels.finish();
    githubReels.finish();
  }
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    followerReels.finish();
    githubReels.finish();
  }
});

// Image previews remain keyboard accessible and can be dismissed with Escape.
document.querySelectorAll('.project-title').forEach(title => {
  title.addEventListener('mouseleave', () => title.classList.remove('preview-dismissed'));
  title.addEventListener('focusout', () => title.classList.remove('preview-dismissed'));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.project-title').forEach(title => title.classList.add('preview-dismissed'));
});
