function getStorage(cb) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({ reflectionLog: [] }, (res) => {
      cb(Array.isArray(res.reflectionLog) ? res.reflectionLog : []);
    });
  } else {
    const raw = localStorage.getItem('reflectionLog');
    const list = raw ? JSON.parse(raw) : [];
    cb(list);
  }
}

function setStorage(list, cb) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ reflectionLog: list }, () => cb && cb());
    } else {
      localStorage.setItem('reflectionLog', JSON.stringify(list));
      cb && cb();
    }
  } catch (e) {
    console.log('Could not set storage:', e);
    cb && cb();
  }
}

function render(list) {
  const logList = document.getElementById('logList');
  const emptyState = document.getElementById('emptyState');
  const logCount = document.getElementById('logCount');
  logList.innerHTML = '';

  // Sort newest first
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (!list.length) {
    emptyState.style.display = 'block';
    logCount.textContent = '0 reflections';
    return;
  }

  emptyState.style.display = 'none';
  logCount.textContent = `${list.length} reflection${list.length === 1 ? '' : 's'}`;

  list.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'log-card';

    const meta = document.createElement('div');
    meta.className = 'log-meta';
    const ts = new Date(item.timestamp).toLocaleString();
    const reason = item.reason || '—';
    meta.innerHTML = `<span class="log-reason">${reason}</span><span>${ts}</span>`;

    const text = document.createElement('div');
    text.className = 'log-text';
    text.textContent = item.reflection || '';

    card.appendChild(meta);
    card.appendChild(text);
    logList.appendChild(card);
  });
}

function refresh() {
  getStorage(render);
}

function clearAll() {
  if (!confirm('Delete all reflections? This cannot be undone.')) return;
  setStorage([], refresh);
}

function init() {
  document.getElementById('refreshBtn')?.addEventListener('click', refresh);
  document.getElementById('clearBtn')?.addEventListener('click', clearAll);
  document.getElementById('backBtn')?.addEventListener('click', () => history.back());
  refresh();
}

document.addEventListener('DOMContentLoaded', init);
