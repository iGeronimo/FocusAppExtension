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

// Keep chart instances to destroy before re-rendering
let sessionsChartInstance = null;
let distractionsChartInstance = null;
let currentWindow = 'monthly';

// Visible boot log and error capture to aid debugging in the Stats page
try { console.log('[Stats] script loaded'); } catch {}
try {
  window.addEventListener('error', (e) => {
    try { console.error('[Stats] Uncaught error:', e?.error || e?.message || e); } catch {}
  });
} catch {}

// Plugin to render value labels above bars for the focus minutes chart
const valueLabelPlugin = {
  id: 'valueLabelPlugin',
  afterDatasetsDraw(chart, args, pluginOptions) {
    try {
      const canvasId = chart?.canvas?.id;
      if (canvasId !== 'sessionsChart') return; // only label focus chart
      const { ctx } = chart;
      ctx.save();
  ctx.fillStyle = '#fff';
      ctx.font = '12px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
      const dataset = chart.data?.datasets?.[0];
      const meta = chart.getDatasetMeta(0);
      if (!dataset || !meta?.data) return;
      for (let i = 0; i < meta.data.length; i++) {
        const bar = meta.data[i];
        const raw = dataset.data?.[i] ?? 0;
        if (!bar || !isFinite(raw) || raw <= 0) continue;
        const pos = bar.tooltipPosition();
        const label = `${raw}m`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const y = Math.min(pos.y - 6, bar.y - 6);
        ctx.fillText(label, pos.x, y);
      }
      ctx.restore();
    } catch {}
  }
};

function pad2(n) { return String(n).padStart(2, '0'); }
function dayKeyLocal(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function monthKeyLocal(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }

function getSinceForWindow(win, now = new Date()) {
  switch (win) {
    case 'weekly': return new Date(now.getTime() - 7*24*60*60*1000);
    case 'monthly': return new Date(now.getTime() - 30*24*60*60*1000);
    case 'yearly': return new Date(now.getTime() - 365*24*60*60*1000);
    case 'all': default: return null;
  }
}

function buildFocusSeries(focusHistory, win, now = new Date()) {
  const data = Array.isArray(focusHistory) ? focusHistory : [];
  const dayMs = 24*60*60*1000;
  if (win === 'weekly' || win === 'monthly') {
    const len = (win === 'weekly') ? 7 : 30;
    const baseLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Array.from({ length: len }).map((_, i) => dayKeyLocal(new Date(baseLocal.getTime() - (len-1 - i)*dayMs)));
    const earliestLocal = new Date(baseLocal.getTime() - (len-1)*dayMs);
    const localMap = new Map();
    for (const s of data) {
      if (!s || (!s.endedAt && !s.startedAt)) continue;
      const dt = s.endedAt ? new Date(s.endedAt) : (s.startedAt ? new Date(s.startedAt) : null);
      if (!dt || isNaN(dt.getTime())) continue;
      if (dt < earliestLocal || dt > new Date(now.getTime() + 1)) continue;
      const key = dayKeyLocal(dt);
      localMap.set(key, (localMap.get(key) || 0) + Number(s.durationSec || 0));
    }
    const minutes = days.map(d => Math.round((localMap.get(d) || 0) / 60));
    return { labels: days, minutes };
  }
  // Monthly buckets for yearly/all-time
  // Determine month keys range
  let startDate;
  if (win === 'yearly') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  } else {
    // all-time
    let min = null;
    for (const s of data) {
      const dt = s?.endedAt ? new Date(s.endedAt) : (s?.startedAt ? new Date(s.startedAt) : null);
      if (!dt || isNaN(dt)) continue;
      if (!min || dt < min) min = dt;
    }
    startDate = min ? new Date(min.getFullYear(), min.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = [];
  const monthKeys = [];
  let cursor = new Date(startDate);
  // generate month labels from start to end inclusive
  while (cursor <= endDate) {
    monthKeys.push(monthKeyLocal(cursor));
    months.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    if (monthKeys.length > 240) break; // safety cap at 20 years
  }
  const map = new Map();
  for (const s of data) {
    if (!s || (!s.endedAt && !s.startedAt)) continue;
    const dt = s.endedAt ? new Date(s.endedAt) : (s.startedAt ? new Date(s.startedAt) : null);
    if (!dt || isNaN(dt.getTime())) continue;
    const key = monthKeyLocal(dt);
    map.set(key, (map.get(key) || 0) + Number(s.durationSec || 0));
  }
  const minutes = monthKeys.map(k => Math.round((map.get(k) || 0) / 60));
  return { labels: monthKeys, minutes };
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
  // If storage.local was empty, prefer localStorage data when present
  if (Array.isArray(analytics) && analytics.length === 0) {
    try {
      const ls = JSON.parse(localStorage.getItem('distractionAnalytics') || '[]');
      if (Array.isArray(ls) && ls.length > 0) analytics = ls;
    } catch {}
  }

  return { focusHistory: Array.isArray(focusHistory) ? focusHistory : [], analytics: Array.isArray(analytics) ? analytics : [] };
}

function bucketByDate(entries, accessor) {
  const map = new Map();
  entries.forEach(e => {
    const date = new Date(accessor(e));
    const utcKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0,10);
    const d = utcKey;
    map.set(d, (map.get(d) || 0) + 1);
  });
  return map;
}

function bucketSumByDate(entries, accessor, sumAccessor) {
  const map = new Map();
  entries.forEach(e => {
    const date = new Date(accessor(e));
    const utcKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0,10);
    const d = utcKey;
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
  try { console.log('[Stats] render() start'); } catch {}
  const { focusHistory, analytics } = await loadData();
  const now = new Date();
  const mStart = startOfMonth(now);
  const wStart = startOfWeek(now);

  const monthFocus = focusHistory.filter(s => new Date(s.endedAt) >= mStart);
  const monthFocusSeconds = sum(monthFocus.map(s => s.durationSec || 0));
  const monthSessions = monthFocus.length;

  const weekDistractions = analytics.filter(a => new Date(a.timestamp) >= wStart);

  try { console.log('[Stats] Loaded', { focusHistoryCount: Array.isArray(focusHistory) ? focusHistory.length : 0, monthFocusSeconds, monthSessions }); } catch {}
  document.getElementById('metricFocusThisMonth').textContent = fmtMinutes(monthFocusSeconds);
  document.getElementById('metricSessionsThisMonth').textContent = `${monthSessions}`;
  document.getElementById('metricDistractionsThisWeek').textContent = `${weekDistractions.length}`;
  document.getElementById('metricTopReason').textContent = topReason(analytics, new Date(Date.now() - 7*24*60*60*1000));

  // Build focus series based on selected window
  const series = buildFocusSeries(focusHistory, currentWindow, now);
  const days = series.labels;
  let minutesData = series.minutes;
  const sessionsCanvas = document.getElementById('sessionsChart');
  // Destroy any existing chart before drawing
  try { const existing = Chart.getChart(sessionsCanvas); if (existing) existing.destroy(); } catch {}
  if (sessionsChartInstance) { try { sessionsChartInstance.destroy(); } catch {} sessionsChartInstance = null; }
  const sessionsHasData = minutesData.some(v => v > 0);
  if (!sessionsHasData) {
    const ctx = sessionsCanvas.getContext('2d');
    ctx.clearRect(0, 0, sessionsCanvas.width, sessionsCanvas.height);
  ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    ctx.fillText('No focus time to display yet', sessionsCanvas.width / 2, sessionsCanvas.height / 2);
  } else {
    const ctx1 = sessionsCanvas.getContext('2d');
    try {
      // Ensure canvas has sufficient height and proper scaling
      sessionsCanvas.style.height = '180px';
      const dpr = window.devicePixelRatio || 1;
      sessionsCanvas.height = Math.max(sessionsCanvas.height, 180 * dpr);
    } catch {}
    // Ensure plugin is available; Chart.js v3 registers via config.plugins
    sessionsChartInstance = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          label: 'Focus minutes',
          data: minutesData,
          backgroundColor: '#fff',
          borderColor: '#fff',
          borderWidth: 1.5,
          hoverBackgroundColor: 'rgba(255,255,255,0.85)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#fff' } },
          y: { ticks: { color: '#fff', precision: 0, callback: (v) => `${v}m` }, beginAtZero: true }
        },
        plugins: { legend: { labels: { color: '#fff' } } }
      },
      parsing: false,
      plugins: [valueLabelPlugin]
    });
  }

  // Distractions by category based on selected window
  const since = getSinceForWindow(currentWindow, now);
  const recentDistractions = Array.isArray(analytics)
    ? analytics.filter(a => {
        const t = new Date(a.timestamp);
        return since ? (t >= since) : true;
      })
    : [];
  const catCounts = new Map();
  recentDistractions.forEach(a => {
    const k = (a.reason || a.category || 'other').toString().toLowerCase();
    catCounts.set(k, (catCounts.get(k) || 0) + 1);
  });
  const labels = Array.from(catCounts.keys());
  const values = labels.map(l => catCounts.get(l) || 0);
  const distractionsCanvas = document.getElementById('distractionsChart');
  // Destroy any existing chart before drawing
  try { const existing2 = Chart.getChart(distractionsCanvas); if (existing2) existing2.destroy(); } catch {}
  if (distractionsChartInstance) { try { distractionsChartInstance.destroy(); } catch {} distractionsChartInstance = null; }
  const distractionsHasData = values.some(v => v > 0);
  if (!distractionsHasData) {
    const ctx = distractionsCanvas.getContext('2d');
    ctx.clearRect(0, 0, distractionsCanvas.width, distractionsCanvas.height);
  ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '16px Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    ctx.fillText('No distraction categories to display yet', distractionsCanvas.width / 2, distractionsCanvas.height / 2);
  } else {
    const ctx2 = distractionsCanvas.getContext('2d');
    // Build a stable color per category using a palette + hash of the label
    const palette = [
      '#29B6F6', // light blue
      '#FF7043', // deep orange
      '#AB47BC', // purple
      '#26A69A', // teal
      '#FFCA28', // amber
      '#EC407A', // pink
      '#66BB6A', // green
      '#7E57C2', // deep purple
      '#FFA726', // orange
      '#EF5350', // red
      '#26C6DA', // cyan
      '#9CCC65'  // light green
    ];
    const hashString = (s = '') => {
      let h = 0;
      for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
      return Math.abs(h);
    };
    const bgColors = labels.map(l => palette[hashString(l) % palette.length]);
    const borderColors = bgColors;

    distractionsChartInstance = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Distractions',
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          hoverBackgroundColor: bgColors.map(c => c)
        }]
      },
      options: {
        indexAxis: 'x',
        scales: {
          x: { ticks: { color: '#fff' } },
          y: { ticks: { color: '#fff', precision: 0 }, beginAtZero: true }
        },
        plugins: { legend: { labels: { color: '#fff' } } }
      }
    });
  }
}

function clearFocusHistory() { setStorage({ focusHistory: [] }, 'local').then(render); }

function init() {
  try { console.log('[Stats] init()'); } catch {}
  // restore saved window
  try {
    getStorage('statsTimeWindow', 'local').then(val => {
      const saved = typeof val === 'string' ? val : (val?.statsTimeWindow || null);
      if (saved && ['weekly','monthly','yearly','all'].includes(saved)) {
        currentWindow = saved;
      }
      const sel = document.getElementById('timeWindow');
      if (sel) sel.value = currentWindow;
      render();
    });
  } catch { render(); }
  const sel = document.getElementById('timeWindow');
  if (sel) {
    sel.addEventListener('change', (e) => {
      currentWindow = e.target.value;
      setStorage({ statsTimeWindow: currentWindow }, 'local');
      render();
    });
  }
  document.getElementById('backBtn')?.addEventListener('click', () => history.back());
  document.getElementById('refreshBtn')?.addEventListener('click', render);
  document.getElementById('clearFocusHistoryBtn')?.addEventListener('click', clearFocusHistory);
  try { console.log('[Stats] scheduling initial render (deferred until window restore)'); } catch {}
}

document.addEventListener('DOMContentLoaded', init);
