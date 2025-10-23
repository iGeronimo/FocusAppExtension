// Settings page logic: manages sound + deep work settings
const soundEnabledInput = document.getElementById('soundEnabled');
const soundChoiceSelect = document.getElementById('soundChoice');
const testSoundBtn = document.getElementById('testSoundBtn');
const soundVolumeInput = document.getElementById('soundVolume');
const soundVolumeValue = document.getElementById('soundVolumeValue');
const deepWorkEnabledInput = document.getElementById('deepWorkEnabled');
const deepWorkStepsBlock = document.getElementById('deepWorkStepsBlock');
const deepWorkStepsList = document.getElementById('deepWorkStepsList');
const addDeepWorkStepBtn = document.getElementById('addDeepWorkStepBtn');
const closeBtn = document.getElementById('closeBtn');

function createStepInput(value = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'item';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'deep-step-input';
  input.placeholder = 'Step description';
  input.value = value;
  input.addEventListener('change', saveSettings);

  const delBtn = document.createElement('button');
  delBtn.textContent = '✕';
  delBtn.title = 'Remove step';
  delBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    wrapper.remove();
    await saveSettings();
  });

  wrapper.appendChild(input);
  wrapper.appendChild(delBtn);
  return wrapper;
}

function getDeepWorkStepsFromDOM() {
  const inputs = deepWorkStepsList?.querySelectorAll('.deep-step-input') || [];
  const steps = [];
  inputs.forEach((inp) => {
    const v = (inp.value || '').trim();
    if (v) steps.push(v);
  });
  return steps;
}

function renderDeepWorkSteps(steps = []) {
  if (!deepWorkStepsList) return;
  deepWorkStepsList.innerHTML = '';
  const list = Array.isArray(steps) ? steps : [];
  if (list.length === 0) {
    deepWorkStepsList.appendChild(createStepInput(''));
  } else {
    list.forEach(s => deepWorkStepsList.appendChild(createStepInput(s)));
  }
}

async function loadSettings() {
  const result = await chrome.storage.sync.get({
    soundEnabled: true,
    soundChoice: 'Chime.mp3',
    soundVolume: 1,
    deepWorkEnabled: false,
    deepWorkSteps: []
  });
  if (soundEnabledInput) soundEnabledInput.checked = !!result.soundEnabled;
  if (soundChoiceSelect) soundChoiceSelect.value = result.soundChoice;
  if (soundVolumeInput) {
    const volPct = Math.round((result.soundVolume ?? 1) * 100);
    soundVolumeInput.value = String(volPct);
    if (soundVolumeValue) soundVolumeValue.textContent = `${volPct}%`;
  }
  if (deepWorkEnabledInput) {
    deepWorkEnabledInput.checked = !!result.deepWorkEnabled;
    if (deepWorkStepsBlock) deepWorkStepsBlock.style.display = result.deepWorkEnabled ? 'block' : 'none';
  }
  renderDeepWorkSteps(result.deepWorkSteps);
}

async function saveSettings() {
  await chrome.storage.sync.set({
    soundEnabled: !!(soundEnabledInput && soundEnabledInput.checked),
    soundChoice: soundChoiceSelect ? soundChoiceSelect.value : 'Chime.mp3',
    soundVolume: soundVolumeInput ? (Number(soundVolumeInput.value) / 100) : 1,
    deepWorkEnabled: !!(deepWorkEnabledInput && deepWorkEnabledInput.checked),
    deepWorkSteps: getDeepWorkStepsFromDOM()
  });
}

function initEvents(){
  soundEnabledInput?.addEventListener('change', saveSettings);
  soundChoiceSelect?.addEventListener('change', saveSettings);
  if (soundVolumeInput) {
    const updateVol = () => { soundVolumeValue.textContent = `${Number(soundVolumeInput.value)}%`; };
    soundVolumeInput.addEventListener('input', updateVol);
    soundVolumeInput.addEventListener('change', async () => { updateVol(); await saveSettings(); });
  }
  testSoundBtn?.addEventListener('click', async () => {
    const choice = soundChoiceSelect ? soundChoiceSelect.value : 'Chime.mp3';
    const vol = soundVolumeInput ? (Number(soundVolumeInput.value) / 100) : 1;
    try {
      const url = chrome.runtime.getURL(`sound/${choice}`);
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, vol));
      await audio.play();
    } catch {}
    chrome.runtime.sendMessage({ action: 'testSound', soundChoice: choice, soundVolume: vol, noEcho: true }, () => void chrome.runtime.lastError);
  });
  deepWorkEnabledInput?.addEventListener('change', async () => {
    if (deepWorkStepsBlock) deepWorkStepsBlock.style.display = deepWorkEnabledInput.checked ? 'block' : 'none';
    await saveSettings();
  });
  addDeepWorkStepBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const el = createStepInput('');
    deepWorkStepsList.appendChild(el);
    el.querySelector('input')?.focus();
    await saveSettings();
  });
  closeBtn?.addEventListener('click', () => { window.close(); });
}

(document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', () => { loadSettings(); initEvents(); }) : (loadSettings(), initEvents());
