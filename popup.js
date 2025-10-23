// DOM elements
const timerDisplay = document.getElementById('timerDisplay');
const status = document.getElementById('status');
const progressFill = document.getElementById('progressFill');
const sessionCounter = document.getElementById('sessionCounter');
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const blockCurrentBtn = document.getElementById('blockCurrentBtn');
const currentSiteDiv = document.getElementById('currentSite');
const focusTimeInput = document.getElementById('focusTime');
const breakTimeInput = document.getElementById('breakTime');
const longBreakTimeInput = document.getElementById('longBreakTime');
const soundEnabledInput = document.getElementById('soundEnabled');
const soundChoiceSelect = document.getElementById('soundChoice');
const testSoundBtn = document.getElementById('testSoundBtn');
const soundVolumeInput = document.getElementById('soundVolume');
const soundVolumeValue = document.getElementById('soundVolumeValue');
const openLogBtn = document.getElementById('openLogBtn');
const openManageBtn = document.getElementById('openManageBtn');
const openStatsBtn = document.getElementById('openStatsBtn');
const deepWorkEnabledInput = document.getElementById('deepWorkEnabled');
const deepWorkStepsRow = document.getElementById('deepWorkStepsRow');
const deepWorkStepsList = document.getElementById('deepWorkStepsList');
const addDeepWorkStepBtn = document.getElementById('addDeepWorkStepBtn');

function createStepInput(value = '') {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '6px';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'deep-step-input';
  input.placeholder = 'Step description';
  input.value = value;
  input.style.cssText = 'flex:1; padding:8px; border:none; border-radius:8px; background: rgba(255,255,255,0.18); color:#fff; font-size:12px; outline:none;';
  input.addEventListener('change', saveSettings);

  const delBtn = document.createElement('button');
  delBtn.textContent = '🗑️';
  delBtn.title = 'Remove step';
  delBtn.style.cssText = 'width:auto; padding:6px 8px; border-radius:8px; font-size:12px;';
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

let currentTabUrl = '';

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateDisplay();
  await getCurrentSite();
  // Wire nav buttons
  openLogBtn?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('reflection-log.html');
    chrome.tabs.create({ url });
  });
  openManageBtn?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('manage-blocked.html');
    chrome.tabs.create({ url });
  });
  openStatsBtn?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('stats.html');
    chrome.tabs.create({ url });
  });
});

// Get current site information
async function getCurrentSite() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url) {
      currentTabUrl = tabs[0].url;
      const url = new URL(currentTabUrl);
      const domain = url.hostname.replace('www.', '');
      
      if (domain && !domain.startsWith('chrome') && !domain.startsWith('moz-extension')) {
        currentSiteDiv.textContent = `Current site: ${domain}`;
        blockCurrentBtn.style.display = 'block';
      } else {
        currentSiteDiv.textContent = 'Cannot block this page';
        blockCurrentBtn.style.display = 'none';
      }
    } else {
      currentSiteDiv.textContent = 'No active tab';
      blockCurrentBtn.style.display = 'none';
    }
  } catch (error) {
    currentSiteDiv.textContent = 'Cannot access current site';
    blockCurrentBtn.style.display = 'none';
  }
}

// Block current site
async function blockCurrentSite() {
  try {
    if (!currentTabUrl) {
      showNotification('No active tab found', 'error');
      return;
    }
    
    const url = new URL(currentTabUrl);
    const domain = url.hostname.replace('www.', '');
    
    if (!domain || domain.startsWith('chrome') || domain.startsWith('moz-extension')) {
      showNotification('Cannot block this type of page', 'error');
      return;
    }
    
    // Get current blocked sites
    const result = await chrome.storage.sync.get(['blockedSites']);
    const blockedSites = result.blockedSites || [];
    
    if (blockedSites.includes(domain)) {
      showNotification(`${domain} is already blocked`, 'error');
      return;
    }
    
    // Add to blocked sites
    blockedSites.push(domain);
    await chrome.storage.sync.set({ blockedSites });
    
    showNotification(`${domain} has been blocked!`, 'success');
    
    // Close current tab after a short delay
    setTimeout(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.remove(tabs[0].id);
        }
      });
    }, 1000);
    
  } catch (error) {
    console.error('Error blocking site:', error);
    showNotification('Failed to block site', 'error');
  }
}

// Show notification
function showNotification(message, type) {
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 15px;
    border-radius: 5px;
    font-size: 12px;
    z-index: 1000;
    ${type === 'success' ? 'background: rgba(76, 175, 80, 0.9);' : 'background: rgba(244, 67, 54, 0.9);'}
    color: white;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 2000);
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.sync.get({
    focusTime: 25,
    breakTime: 5,
    longBreakTime: 15,
    soundEnabled: true,
    soundChoice: 'Chime.mp3',
    soundVolume: 1,
    deepWorkEnabled: false,
    deepWorkSteps: []
  });
  
  focusTimeInput.value = result.focusTime;
  breakTimeInput.value = result.breakTime;
  longBreakTimeInput.value = result.longBreakTime;
  if (soundEnabledInput) soundEnabledInput.checked = !!result.soundEnabled;
  if (soundChoiceSelect) soundChoiceSelect.value = result.soundChoice;
  if (soundVolumeInput) {
    const volPct = Math.round((result.soundVolume ?? 1) * 100);
    soundVolumeInput.value = String(volPct);
    if (soundVolumeValue) soundVolumeValue.textContent = `${volPct}%`;
  }
  if (deepWorkEnabledInput) {
    deepWorkEnabledInput.checked = !!result.deepWorkEnabled;
    if (deepWorkStepsRow) deepWorkStepsRow.style.display = result.deepWorkEnabled ? 'flex' : 'none';
  }
  renderDeepWorkSteps(result.deepWorkSteps);
}

// Save settings to storage and notify background script
async function saveSettings() {
  await chrome.storage.sync.set({
    focusTime: parseInt(focusTimeInput.value),
    breakTime: parseInt(breakTimeInput.value),
    longBreakTime: parseInt(longBreakTimeInput.value),
    soundEnabled: !!(soundEnabledInput && soundEnabledInput.checked),
    soundChoice: soundChoiceSelect ? soundChoiceSelect.value : 'Chime.mp3',
    soundVolume: soundVolumeInput ? (Number(soundVolumeInput.value) / 100) : 1,
    deepWorkEnabled: !!(deepWorkEnabledInput && deepWorkEnabledInput.checked),
    deepWorkSteps: getDeepWorkStepsFromDOM()
  });
  
  // Notify background script that settings have changed
  sendMessage('updateSettings');
}

// Update display with current timer state
async function updateDisplay() {
  const state = await getTimerState();
  
  // Update timer display
  const minutes = Math.floor(state.timeLeft / 60);
  const seconds = state.timeLeft % 60;
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Update play/pause button text
  playPauseBtn.textContent = state.isRunning ? 'Pause' : 'Start';
  
  // Update status
  let statusText = 'Ready to focus!';
  if (state.isRunning) {
    statusText = state.mode === 'focus' ? 'Focus time! 🎯' : 'Break time! ☕';
  } else if (state.mode !== 'focus') {
    statusText = state.mode === 'break' ? 'Break time! ☕' : 'Long break! 🎉';
  }
  status.textContent = statusText;
  
  // Update progress bar
  const totalTime = state.mode === 'focus' ? state.settings.focusTime * 60 :
                   state.mode === 'break' ? state.settings.breakTime * 60 :
                   state.settings.longBreakTime * 60;
  const progress = ((totalTime - state.timeLeft) / totalTime) * 100;
  progressFill.style.width = `${Math.max(0, progress)}%`;
  
  // Update session counter
  sessionCounter.textContent = `Session: ${state.completedSessions}`;
}

// Get timer state from background script
async function getTimerState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => {
      resolve(response);
    });
  });
}

// Send message to background script
function sendMessage(action, data = {}) {
  chrome.runtime.sendMessage({ action, ...data });
}

// Event listeners
playPauseBtn.addEventListener('click', async () => {
  const state = await getTimerState();
  
  if (state.isRunning) {
    // Currently running, so pause
    sendMessage('pauseTimer');
  } else {
    // Currently paused/stopped, so start
    // Persist any in-UI changes (captures unsaved step inputs too)
    await saveSettings();
    // If deep work is enabled and we're about to start a focus session, open the deep work checklist window instead
    try {
      // Prefer current DOM state to avoid race with storage writes
      const deepWorkEnabled = !!(deepWorkEnabledInput && deepWorkEnabledInput.checked);
      if (!state.isRunning && state.mode === 'focus' && deepWorkEnabled) {
        chrome.runtime.sendMessage({ action: 'openDeepWorkWindow' });
      } else {
        sendMessage('startTimer');
      }
    } catch {
      sendMessage('startTimer');
    }
  }
  
  // Update display after a short delay to let background script process
  setTimeout(updateDisplay, 200);
});

resetBtn.addEventListener('click', () => {
  sendMessage('resetTimer');
  setTimeout(updateDisplay, 200);
});

blockCurrentBtn.addEventListener('click', blockCurrentSite);

// Settings change listeners - only save settings, don't automatically update running timer
[focusTimeInput, breakTimeInput, longBreakTimeInput].forEach(input => {
  input.addEventListener('change', saveSettings);
});

if (soundEnabledInput) {
  soundEnabledInput.addEventListener('change', saveSettings);
}
if (deepWorkEnabledInput) {
  deepWorkEnabledInput.addEventListener('change', async () => {
    if (deepWorkStepsRow) deepWorkStepsRow.style.display = deepWorkEnabledInput.checked ? 'flex' : 'none';
    await saveSettings();
  });
}
if (addDeepWorkStepBtn) {
  addDeepWorkStepBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!deepWorkStepsList) return;
    const el = createStepInput('');
    deepWorkStepsList.appendChild(el);
    const input = el.querySelector('input');
    input?.focus();
    await saveSettings();
  });
}
if (soundChoiceSelect) {
  soundChoiceSelect.addEventListener('change', saveSettings);
}

if (soundVolumeInput) {
  const updateVolumeLabel = () => {
    const vol = Number(soundVolumeInput.value);
    if (soundVolumeValue) soundVolumeValue.textContent = `${vol}%`;
  };
  soundVolumeInput.addEventListener('input', updateVolumeLabel);
  soundVolumeInput.addEventListener('change', async () => {
    updateVolumeLabel();
    await saveSettings();
  });
}

if (testSoundBtn) {
  testSoundBtn.addEventListener('click', async () => {
    const choice = soundChoiceSelect ? soundChoiceSelect.value : 'Chime.mp3';
    const vol = soundVolumeInput ? (Number(soundVolumeInput.value) / 100) : 1;
    console.log('[Popup] Test sound clicked', { choice, vol });
    // Play locally in popup to avoid offscreen dependency
    try {
      const url = chrome.runtime.getURL(`sound/${choice}`);
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, vol));
      await audio.play();
      console.log('[Popup] Local test playback started');
    } catch (e) {
      console.warn('[Popup] Local test playback error', e);
    }
    // Send a log-only message to background (no echo playback)
    chrome.runtime.sendMessage({ action: 'testSound', soundChoice: choice, soundVolume: vol, noEcho: true }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('[Popup] testSound sendMessage error:', err);
      } else {
        console.log('[Popup] testSound message sent');
      }
    });
  });
}

// Fallback: if background broadcasts play-sound and popup is open, play it here
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'play-sound') return;
  const payload = msg.payload || {};
  const vol = typeof payload.volume === 'number' ? Math.max(0, Math.min(1, payload.volume)) : 1;
  const url = payload.url || chrome.runtime.getURL('sound/Chime.mp3');
  try {
    const audio = new Audio(url);
    audio.volume = vol;
    audio.play().catch((e) => console.warn('[Popup] play-sound playback error', e));
  } catch (e) {
    console.warn('[Popup] play-sound error', e);
  }
});

// Update display every second when popup is open
setInterval(updateDisplay, 1000);