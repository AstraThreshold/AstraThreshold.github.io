/* Both languages remain in the HTML, including the no-JavaScript default. */
const translations = [...document.querySelectorAll('[data-en]')].map(element => ({
  element, zh: element.innerHTML, en: element.dataset.en
}));
const countElement = document.getElementById('follower-count');
const statusElement = document.getElementById('follower-status');
const refreshButton = document.getElementById('refresh-followers');
const cacheKey = 'wooolab-bilibili-snapshot';
let language = 'zh';
let snapshot = null;
let fetching = false;
let refreshFailed = false;

function validSnapshot(value) {
  return value?.mid === 43483079 && Number.isSafeInteger(value.followers) && value.followers >= 0
    && Number.isFinite(Date.parse(value.updated_at)) && Date.parse(value.updated_at) <= Date.now() + 120000;
}

const initialSnapshot = { mid: 43483079, followers: Number(countElement?.textContent.replaceAll(',', '')), updated_at: countElement?.dataset.updatedAt };
if (validSnapshot(initialSnapshot)) snapshot = initialSnapshot;

function renderFollowers() {
  if (!snapshot || !countElement || !statusElement) return;
  const locale = language === 'en' ? 'en-GB' : 'zh-CN';
  countElement.textContent = new Intl.NumberFormat(locale).format(snapshot.followers);
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
  if (refreshButton) refreshButton.title = language === 'en' ? 'Check the latest published count' : '检查最新发布的粉丝数';
}

function setLanguage(value) {
  language = value === 'en' ? 'en' : 'zh';
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  // These fragments are trusted, repository-owned translations, never remote data.
  translations.forEach(item => { item.element.innerHTML = item[language]; });
  document.querySelectorAll('[data-language]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  });
  document.querySelector('meta[name="description"]').content = language === 'en'
    ? 'Heng Zhang / AstraThreshold. ROAS PhD student at HKUST(GZ), Electronic Hardware Intern at BrainCo. Hardware, embedded systems, and open source.'
    : 'Heng Zhang / AstraThreshold 的个人主页。港科广 ROAS 博士生、强脑科技电子硬件实习生，关注硬件、嵌入式系统与开源开发。';
  try { localStorage.setItem('wooolab-language', language); } catch { /* Storage is optional. */ }
  renderFollowers();
}

async function refreshFollowers() {
  if (fetching || !countElement) return;
  fetching = true;
  if (refreshButton) refreshButton.disabled = true;
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
    if (refreshButton) refreshButton.disabled = false;
    renderFollowers();
  }
}

document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
let preferredLanguage;
try {
  preferredLanguage = localStorage.getItem('wooolab-language');
  const cached = JSON.parse(localStorage.getItem(cacheKey));
  if (validSnapshot(cached) && (!snapshot || Date.parse(cached.updated_at) > Date.parse(snapshot.updated_at))) snapshot = cached;
} catch { /* Use the static content and browser locale. */ }
if (!['zh', 'en'].includes(preferredLanguage)) preferredLanguage = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
setLanguage(preferredLanguage);
refreshButton?.addEventListener('click', refreshFollowers);
refreshFollowers();
setInterval(() => { if (!document.hidden) refreshFollowers(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFollowers(); });

// Image previews remain keyboard accessible and can be dismissed with Escape.
document.querySelectorAll('.project-title').forEach(title => {
  title.addEventListener('mouseleave', () => title.classList.remove('preview-dismissed'));
  title.addEventListener('focusout', () => title.classList.remove('preview-dismissed'));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.project-title').forEach(title => title.classList.add('preview-dismissed'));
});
