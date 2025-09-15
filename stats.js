function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeek(d = new Date()) {
  const day = d.getDay(); // 0 Sun - 6 Sat
  const diff = d.getDate() - day; // start Sunday
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
function toISODate(d) { return d.toISOString().slice(0,10); }

function sum(arr) { return arr.reduce((a,b) => a + b, 0); }

function getStorage(key, area = 'local') {
  return new Promise((resolve) => {
    const api = chrome.storage[area];
    api.get(key, (res) => resolve(res[key] || (Array.isArray(key) ? {} : (key === 'focusHistory' ? [] : []))));
  });
}

function setStorage(obj, area = 'local') {
  return new Promise((resolve) => {
    const api = chrome.storage[area];
    api.set(obj, resolve);
  });
}

async function loadData() {
  const [focusHistory, distractionAnalytics] = await Promise.all([
    getStorage('focusHistory', 'local'),
    getStorage('distractionAnalytics', 'local').catch(() => [])
  ]);

  let analytics = distractionAnalytics;
  if (!Array.isArray(analytics)) {
    try { analytics = JSON.parse(localStorage.getItem('distractionAnalytics') || '[]'); } catch {}
  }

  return { focusHistory: Array.isArray(focusHistory) ? focusHistory : [], analytics: Array.isArray(analytics) ? analytics : [] };
}

function bucketByDate(entries, accessor) {
  const map = new Map();
  entries.forEach(e => {
    const d = toISODate(new Date(accessor(e)));
    map.set(d, (map.get(d) || 0) + 1);
  });
  return map;
}

function bucketSumByDate(entries, accessor, sumAccessor) {
  const map = new Map();
  entries.forEach(e => {
    const d = toISODate(new Date(accessor(e)));
    map.set(d, (map.get(d) || 0) + sumAccessor(e));
  });
  return map;
}

function topReason(analytics, sinceDate) {
  const counts = new Map();
  analytics.filter(a => new Date(a.timestamp) >= sinceDate).forEach(a => {
    const reason = (a.reason || a.category || 'other').toString().toLowerCase();
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  let best = '-', bestCount = 0;
  counts.forEach((v,k) => { if (v > bestCount) { best = k; bestCount = v; } });
  return best === '-' ? '—' : best;
}

function fmtMinutes(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  return `${mins} min`;
}

async function render() {
  const { focusHistory, analytics } = await loadData();
  const now = new Date();
  const mStart = startOfMonth(now);
  const wStart = startOfWeek(now);

  const monthFocus = focusHistory.filter(s => new Date(s.endedAt) >= mStart);
  const monthFocusSeconds = sum(monthFocus.map(s => s.durationSec || 0));
  const monthSessions = monthFocus.length;

  const weekDistractions = analytics.filter(a => new Date(a.timestamp) >= wStart);

  document.getElementById('metricFocusThisMonth').textContent = fmtMinutes(monthFocusSeconds);
  document.getElementById('metricSessionsThisMonth').textContent = `${monthSessions}`;
  document.getElementById('metricDistractionsThisWeek').textContent = `${weekDistractions.length}`;
  document.getElementById('metricTopReason').textContent = topReason(analytics, new Date(Date.now() - 7*24*60*60*1000));

  // Sessions per day (last 14 days)
  const days = Array.from({length: 14}).map((_,i) => {
    const d = new Date(now); d.setDate(now.getDate() - (13 - i)); return toISODate(d);
  });
  const byDaySessions = bucketByDate(focusHistory.filter(s => new Date(s.endedAt) >= new Date(Date.now()-14*24*60*60*1000)), s => s.endedAt);
  const sessionsData = days.map(d => byDaySessions.get(d) || 0);
  const sessionsCanvas = document.getElementById('sessionsChart');
  const sessionsHasData = sessionsData.some(v => v > 0);
  if (!sessionsHasData) {
    const ctx = sessionsCanvas.getContext('2d');
    ctx.clearRect(0, 0, sessionsCanvas.width, sessionsCanvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    ctx.fillText('No focus sessions to display yet', sessionsCanvas.width / 2, sessionsCanvas.height / 2);
  } else {
    const ctx1 = sessionsCanvas.getContext('2d');
    new Chart(ctx1, { type: 'bar', data: { labels: days, datasets: [{ label: 'Sessions', data: sessionsData, backgroundColor: 'rgba(255, 255, 255, 0.6)' }]}, options: { scales: { x: { ticks: { color: '#fff' } }, y: { ticks: { color: '#fff' }, beginAtZero: true } }, plugins: { legend: { labels: { color: '#fff' } } } } });
  }

  // Distractions per day (last 14 days)
  const byDayDistractions = bucketByDate(analytics.filter(a => new Date(a.timestamp) >= new Date(Date.now()-14*24*60*60*1000)), a => a.timestamp);
  const distractData = days.map(d => byDayDistractions.get(d) || 0);
  const distractionsCanvas = document.getElementById('distractionsChart');
  const distractionsHasData = distractData.some(v => v > 0);
  if (!distractionsHasData) {
    const ctx = distractionsCanvas.getContext('2d');
    ctx.clearRect(0, 0, distractionsCanvas.width, distractionsCanvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    ctx.fillText('No distraction data to display yet', distractionsCanvas.width / 2, distractionsCanvas.height / 2);
  } else {
    const ctx2 = distractionsCanvas.getContext('2d');
    new Chart(ctx2, { type: 'line', data: { labels: days, datasets: [{ label: 'Distractions', data: distractData, borderColor: 'rgba(255, 215, 0, 0.9)', backgroundColor: 'rgba(255, 215, 0, 0.25)', fill: true, tension: 0.3 }]}, options: { scales: { x: { ticks: { color: '#fff' } }, y: { ticks: { color: '#fff' }, beginAtZero: true } }, plugins: { legend: { labels: { color: '#fff' } } } } });
  }
}

function clearFocusHistory() { setStorage({ focusHistory: [] }, 'local').then(render); }

function init() {
  document.getElementById('backBtn')?.addEventListener('click', () => history.back());
  document.getElementById('refreshBtn')?.addEventListener('click', render);
  document.getElementById('clearFocusHistoryBtn')?.addEventListener('click', clearFocusHistory);
  render();
}

document.addEventListener('DOMContentLoaded', init);
