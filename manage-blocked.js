function normalizeDomain(input) {
  try {
    let s = (input || '').trim().toLowerCase();
    if (!s) return '';
    if (s.startsWith('http://') || s.startsWith('https://')) {
      s = new URL(s).hostname;
    }
    if (s.startsWith('www.')) s = s.slice(4);
    return s;
  } catch (e) {
    return '';
  }
}

async function getBlockedSites() {
  const res = await chrome.storage.sync.get(['blockedSites']);
  return res.blockedSites || [];
}

async function setBlockedSites(list) {
  await chrome.storage.sync.set({ blockedSites: list });
}

function render(list) {
  const container = document.getElementById('list');
  const count = document.getElementById('count');
  container.innerHTML = '';
  count.textContent = `${list.length} site${list.length === 1 ? '' : 's'} blocked`;

  if (!list.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No sites blocked.';
    empty.style.opacity = '0.9';
    container.appendChild(empty);
    return;
  }

  list.forEach(site => {
    const row = document.createElement('div');
    row.className = 'site-row';
    const left = document.createElement('div');
    left.className = 'site';
    left.textContent = site;

    const actions = document.createElement('div');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'nav-button danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      const updated = (await getBlockedSites()).filter(s => s !== site);
      await setBlockedSites(updated);
      render(updated);
    });

    actions.appendChild(removeBtn);
    row.appendChild(left);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

async function addSite() {
  const input = document.getElementById('siteInput');
  const normalized = normalizeDomain(input.value);
  if (!normalized) return;
  const list = await getBlockedSites();
  if (list.includes(normalized)) return;
  list.push(normalized);
  await setBlockedSites(list);
  input.value = '';
  render(list);
}

async function clearAll() {
  if (!confirm('Clear all blocked sites?')) return;
  await setBlockedSites([]);
  render([]);
}

async function testRules() {
  chrome.runtime.sendMessage({ action: 'testBlocking' }, (res) => {
    alert(res && res.success ? `Active dynamic rules: ${res.rulesCount}` : 'Failed to query rules');
  });
}

function init() {
  document.getElementById('addBtn')?.addEventListener('click', addSite);
  document.getElementById('siteInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSite(); });
  document.getElementById('clearBtn')?.addEventListener('click', clearAll);
  document.getElementById('backBtn')?.addEventListener('click', () => history.back());
  getBlockedSites().then(render);
}

document.addEventListener('DOMContentLoaded', init);
