(function(){
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const startBtn = document.getElementById('startBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  function render(steps){
    listEl.innerHTML = '';
    if (!Array.isArray(steps) || steps.length === 0) {
      emptyEl.style.display = 'block';
      startBtn.disabled = false; // allow start if no steps configured
      return;
    }
    emptyEl.style.display = 'none';
    steps.forEach((s, idx) => {
      const item = document.createElement('label');
      item.className = 'item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `step_${idx}`;
      const span = document.createElement('span');
      span.textContent = s;
      item.appendChild(cb);
      item.appendChild(span);
      listEl.appendChild(item);
    });
    updateEnabled();
    listEl.addEventListener('change', updateEnabled);
  }

  function updateEnabled(){
    const boxes = listEl.querySelectorAll('input[type="checkbox"]');
    let allChecked = boxes.length === 0 ? true : true;
    boxes.forEach(cb => { if (!cb.checked) allChecked = false; });
    startBtn.disabled = !allChecked;
  }

  async function load(){
    const { deepWorkSteps = [] } = await chrome.storage.sync.get({ deepWorkSteps: [] });
    const steps = Array.isArray(deepWorkSteps) ? deepWorkSteps.filter(Boolean) : [];
    render(steps);
  }

  startBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'deepWorkApproved' }, () => {
      window.close();
    });
  });
  cancelBtn.addEventListener('click', () => window.close());

  load();
})();
