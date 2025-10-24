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

  // Focus time per day (last 14 days) using LOCAL day keys consistently
  const pad2 = (n) => String(n).padStart(2, '0');
  const dayKeyLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const baseLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(baseLocal.getTime() - (13 - i) * 24 * 60 * 60 * 1000);
    return dayKeyLocal(d);
  });
  const dayMs = 24 * 60 * 60 * 1000;
  const earliestLocal = new Date(baseLocal.getTime() - 13 * dayMs);
  const localMap = new Map();
  for (const s of Array.isArray(focusHistory) ? focusHistory : []) {
    if (!s || !s.endedAt) continue;
    const dt = new Date(s.endedAt);
    if (!(dt instanceof Date) || isNaN(dt.getTime())) continue;
    if (dt < earliestLocal || dt > new Date(now.getTime() + 1)) continue; // within visible 14-day window
    const key = dayKeyLocal(dt);
    localMap.set(key, (localMap.get(key) || 0) + Number(s.durationSec || 0));
  }
  let minutesData = days.map(d => Math.round((localMap.get(d) || 0) / 60));
  try { console.log('[Stats] Focus minutes pre-fallback', { days, minutesData }); } catch {}
  if (!minutesData.some(v => v > 0) && (Array.isArray(focusHistory) && focusHistory.length)) {
    // Try bucketing by startedAt as a fallback
    const startedMap = new Map();
    for (const s of focusHistory) {
      if (!s || !s.startedAt) continue;
      const ds = new Date(s.startedAt);
      if (!(ds instanceof Date) || isNaN(ds.getTime())) continue;
      if (ds < earliestLocal || ds > new Date(now.getTime() + 1)) continue;
      const keyS = dayKeyLocal(ds);
      startedMap.set(keyS, (startedMap.get(keyS) || 0) + Number(s.durationSec || 0));
    }
    const minutesByStart = days.map(d => Math.round((startedMap.get(d) || 0) / 60));
    let merged = false;
    if (minutesByStart.some(v => v > 0)) {
      for (let i = 0; i < days.length; i++) {
        if ((localMap.get(days[i]) || 0) === 0 && (startedMap.get(days[i]) || 0) > 0) {
          localMap.set(days[i], startedMap.get(days[i]));
          merged = true;
        }
      }
    }
    if (merged) {
      minutesData = days.map(d => Math.round((localMap.get(d) || 0) / 60));
    }
    try { console.log('[Stats] Focus minutes recompute attempt', { focusHistoryCount: Array.isArray(focusHistory) ? focusHistory.length : 0, lastDaySec: localMap.get(days[days.length-1]) || 0, minutesData }); } catch {}
  }
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

  // Distractions by category (last 14 days)
  const since = new Date(Date.now() - 14*24*60*60*1000);
  const recentDistractions = analytics.filter(a => new Date(a.timestamp) >= since);
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
          label: 'Distractions (14 days)',
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
  document.getElementById('backBtn')?.addEventListener('click', () => history.back());
  document.getElementById('refreshBtn')?.addEventListener('click', render);
  document.getElementById('clearFocusHistoryBtn')?.addEventListener('click', clearFocusHistory);
  try { console.log('[Stats] scheduling initial render'); } catch {}
  render();
}

document.addEventListener('DOMContentLoaded', init);
