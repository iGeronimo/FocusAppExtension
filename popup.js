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
const openLogBtn = document.getElementById('openLogBtn');
const openManageBtn = document.getElementById('openManageBtn');
const openStatsBtn = document.getElementById('openStatsBtn');

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
    longBreakTime: 15
  });
  
  focusTimeInput.value = result.focusTime;
  breakTimeInput.value = result.breakTime;
  longBreakTimeInput.value = result.longBreakTime;
}

// Save settings to storage and notify background script
async function saveSettings() {
  await chrome.storage.sync.set({
    focusTime: parseInt(focusTimeInput.value),
    breakTime: parseInt(breakTimeInput.value),
    longBreakTime: parseInt(longBreakTimeInput.value)
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
    // Save settings before starting (but only if we're at the beginning of a session)
    if (state.timeLeft === 0 || (state.mode === 'focus' && state.timeLeft === state.settings.focusTime * 60) ||
        (state.mode === 'break' && state.timeLeft === state.settings.breakTime * 60) ||
        (state.mode === 'longBreak' && state.timeLeft === state.settings.longBreakTime * 60)) {
      await saveSettings();
    }
    sendMessage('startTimer');
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

// Update display every second when popup is open
setInterval(updateDisplay, 1000);