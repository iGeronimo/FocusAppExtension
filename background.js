// Default blocked websites list
const defaultBlockedSites = [
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com'
];

// Timer state
let timerState = {
  isRunning: false,
  mode: 'focus', // 'focus', 'break', 'longBreak'
  timeLeft: 25 * 60, // in seconds
  completedSessions: 0,
  settings: {
    focusTime: 25,
    breakTime: 5,
    longBreakTime: 15
  }
};

let timerInterval = null;
let offscreenReady = false;
const offscreenWaiters = [];
let isBlockingEnabled = false;
let currentBlockedSites = [];
let webReqListenerInstalled = false;

function normalizeHost(h) {
  try { return (h || '').toLowerCase(); } catch { return ''; }
}

function hostMatchesBlocked(host, blockedList) {
  if (!host) return false;
  const h = normalizeHost(host);
  for (const site of blockedList) {
    const s = normalizeHost(site);
    if (!s) continue;
    if (h === s || h === `www.${s}` || h.endsWith(`.${s}`)) return true;
  }
  return false;
}

function refreshWebRequestBlocking() {
  try {
    if (webReqListenerInstalled) {
      chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestHandler);
      webReqListenerInstalled = false;
    }
  } catch {}

  if (!isBlockingEnabled || !Array.isArray(currentBlockedSites) || currentBlockedSites.length === 0) {
    return;
  }
  try {
    chrome.webRequest.onBeforeRequest.addListener(
      onBeforeRequestHandler,
      { urls: ["<all_urls>",], types: ["main_frame"] },
      ["blocking"]
    );
    webReqListenerInstalled = true;
  } catch (e) {
    console.warn('[BG] Failed to add webRequest listener', e);
  }
}

function onBeforeRequestHandler(details) {
  try {
    const url = details.url || '';
    if (!/^https?:\/\//i.test(url)) return {};
    const u = new URL(url);
    if (!isBlockingEnabled) return {};
    if (!hostMatchesBlocked(u.hostname, currentBlockedSites)) return {};
    const blockedUrl = chrome.runtime.getURL('blocked.html');
    const redirectUrl = `${blockedUrl}?from=${encodeURIComponent(url)}`;
    return { redirectUrl };
  } catch (e) {
    return {};
  }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[BG] Installed/updated');

  // Test if blocked.html is accessible
  const blockedUrl = chrome.runtime.getURL('blocked.html');
  console.log('[BG] Blocked page URL:', blockedUrl);

  // Set default blocked sites if none exist
  const result = await chrome.storage.sync.get(['blockedSites']);
  if (!result.blockedSites) {
    await chrome.storage.sync.set({ blockedSites: defaultBlockedSites });
    console.log('[BG] Set default blocked sites:', defaultBlockedSites);
  } else {
    console.log('[BG] Current blocked sites:', result.blockedSites);
  }

  // Initialize timer settings
  await loadTimerSettings();
  resetTimer();

  // Don't automatically enable blocking on install - only when focus timer starts
});

// Load timer settings from storage
async function loadTimerSettings() {
  const result = await chrome.storage.sync.get({
    focusTime: 25,
    breakTime: 5,
    longBreakTime: 15
  });

  timerState.settings = result;
}

// Save timer state to storage
async function saveTimerState() {
  await chrome.storage.local.set({ timerState });
}

// Load timer state from storage
async function loadTimerState() {
  const result = await chrome.storage.local.get('timerState');
  if (result.timerState) {
    timerState = { ...timerState, ...result.timerState };
  }
}

// Start timer
function startTimer() {
  if (timerState.isRunning) return;

  timerState.isRunning = true;

  // Enable blocking when focus timer starts
  if (timerState.mode === 'focus') {
    updateBlockingRules(true);
  }

  timerInterval = setInterval(async () => {
    timerState.timeLeft--;

    if (timerState.timeLeft <= 0) {
      await handleTimerComplete();
    }

    await saveTimerState();
    updateBadge();
  }, 1000);

  updateBadge();
}

// Pause timer
function pauseTimer() {
  timerState.isRunning = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Disable blocking when timer is paused
  updateBlockingRules(false);

  updateBadge();
}

// Reset timer
async function resetTimer() {
  pauseTimer();
  await loadTimerSettings();

  timerState.mode = 'focus';
  timerState.timeLeft = timerState.settings.focusTime * 60;
  timerState.completedSessions = 0;

  // Disable blocking when timer is reset
  updateBlockingRules(false);

  await saveTimerState();
  updateBadge();
}

// Handle timer completion
async function handleTimerComplete() {
  pauseTimer();

  // Send notification
  const notificationOptions = {
    type: 'basic',
    iconUrl: 'icons/icon-16.png',
    title: 'Pomodoro Focus Blocker',
    message: ''
  };

  if (timerState.mode === 'focus') {
    timerState.completedSessions++;
    // Record completed focus session in storage for stats
    try {
      const durationSec = timerState.settings.focusTime * 60;
      const endedAt = new Date().toISOString();
      const startedAt = new Date(Date.now() - durationSec * 1000).toISOString();
      const entry = { startedAt, endedAt, durationSec };
      chrome.storage.local.get({ focusHistory: [] }, (res) => {
        const list = Array.isArray(res.focusHistory) ? res.focusHistory : [];
        list.push(entry);
        // Cap history size
        if (list.length > 2000) list.splice(0, list.length - 2000);
        chrome.storage.local.set({ focusHistory: list });
      });
    } catch (e) {
      console.warn('Failed to record focus session:', e);
    }

    // Disable blocking when focus session ends
    updateBlockingRules(false);

    // Determine next mode
    if (timerState.completedSessions % 4 === 0) {
      timerState.mode = 'longBreak';
      timerState.timeLeft = timerState.settings.longBreakTime * 60;
      notificationOptions.message = '🎉 Focus session complete! Time for a long break!';
    } else {
      timerState.mode = 'break';
      timerState.timeLeft = timerState.settings.breakTime * 60;
      notificationOptions.message = '✅ Focus session complete! Time for a short break!';
    }
  } else {
    // Break completed, back to focus
    timerState.mode = 'focus';
    timerState.timeLeft = timerState.settings.focusTime * 60;
    notificationOptions.message = '🎯 Break over! Ready to focus again?';
    // Note: We don't enable blocking here, only when user starts the focus timer
  }

  chrome.notifications.create(notificationOptions);

  // Play completion sound if enabled
  try {
    const { soundEnabled = true, soundChoice = 'Chime.mp3', soundVolume = 1 } = await chrome.storage.sync.get({ soundEnabled: true, soundChoice: 'Chime.mp3', soundVolume: 1 });
    if (soundEnabled && soundVolume > 0) {
      const url = chrome.runtime.getURL(`sound/${soundChoice}`);
      console.log('[BG] handleTimerComplete will play', { soundChoice, soundVolume, url });
      await ensureOffscreen();
      await sendPlaySound(url, soundVolume);
    }
  } catch (e) {
    console.warn('[BG] Unable to play sound:', e);
  }
  await saveTimerState();
  updateBadge();

  // Open small prompt window to choose next action
  try {
    await openTimeUpWindow();
  } catch (e) {
    console.warn('[BG] Failed to open time-up window', e);
  }
}

// Ensure offscreen document exists
async function ensureOffscreen() {
  if (chrome.offscreen) {
    const existing = await chrome.offscreen.hasDocument?.();
    if (!existing) {
      console.log('[BG] Creating offscreen document');
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Play a short completion chime when the timer ends'
      });
    } else {
      console.log('[BG] Offscreen document already exists');
    }
  } else {
    console.warn('[BG] Offscreen API not available');
  }
}

async function ensureOffscreenReady(timeoutMs = 2000) {
  await ensureOffscreen();
  if (offscreenReady) return;
  return new Promise((resolve) => {
    const done = () => resolve();
    offscreenWaiters.push(done);
    setTimeout(() => {
      console.warn('[BG] Offscreen ready wait timed out');
      done();
    }, timeoutMs);
  });
}

async function sendPlaySound(url, volume) {
  try {
    await ensureOffscreenReady();
    console.log('[BG] Sending play-sound', { url, volume });
    chrome.runtime.sendMessage({ type: 'play-sound', payload: { url, volume } }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('[BG] play-sound sendMessage error:', err);
      } else {
        console.log('[BG] play-sound message sent');
      }
    });
  } catch (e) {
    console.warn('[BG] sendPlaySound failed:', e);
  }
}

// Time-up popup window helpers
let timeUpWindowId = null;
async function openTimeUpWindow() {
  // If already open, focus it
  if (timeUpWindowId !== null) {
    try {
      await chrome.windows.update(timeUpWindowId, { focused: true });
      return;
    } catch (e) {
      // Window may have been closed; continue to create
    }
    timeUpWindowId = null;
  }
  const url = chrome.runtime.getURL('time-up.html');
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 360,
    height: 260,
    focused: true
  });
  timeUpWindowId = win.id || null;
}

// Deep Work checklist window helpers
let deepWorkWindowId = null;
async function openDeepWorkWindow() {
  if (deepWorkWindowId !== null) {
    try { await chrome.windows.update(deepWorkWindowId, { focused: true }); return; } catch {}
    deepWorkWindowId = null;
  }
  const url = chrome.runtime.getURL('deep-work.html');
  const win = await chrome.windows.create({ url, type: 'popup', width: 420, height: 360, focused: true });
  deepWorkWindowId = win.id || null;
}

// Update extension badge
function updateBadge() {
  let badgeText = '';

  if (timerState.isRunning) {
    const minutes = Math.floor(timerState.timeLeft / 60);
    const seconds = timerState.timeLeft % 60;

    // Use compact format for badge (limited space)
    if (minutes > 0) {
      badgeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // When less than a minute, just show seconds
      badgeText = `${seconds}s`;
    }
  }

  const badgeColor = timerState.mode === 'focus' ? '#4CAF50' : '#FF9800';

  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

// Update blocking rules when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.blockedSites) {
    // Only update rules if we're currently in a focus session and timer is running
    const shouldBlock = timerState.isRunning && timerState.mode === 'focus';
    updateBlockingRules(shouldBlock);
  }
});

// Function to update blocking using webRequest (Firefox compatible)
async function updateBlockingRules(enableBlocking = true) {
  try {
    isBlockingEnabled = !!enableBlocking;
    const result = await chrome.storage.sync.get(['blockedSites']);
    currentBlockedSites = Array.isArray(result.blockedSites) ? result.blockedSites : [];
    refreshWebRequestBlocking();
    console.log(`[BG] webRequest blocking ${isBlockingEnabled ? 'ENABLED' : 'disabled'} for ${currentBlockedSites.length} sites`);
  } catch (error) {
    console.error('Error updating webRequest blocking:', error);
  }
}

// Handle messages from popup and offscreen
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.type === 'offscreen-ready') {
    console.log('[BG] Received offscreen-ready');
    offscreenReady = true;
    while (offscreenWaiters.length) {
      const w = offscreenWaiters.shift();
      try { w && w(); } catch {}
    }
    return; // no response expected
  }

  switch (request.action) {
    case 'testSound': {
      const choice = request.soundChoice || 'Chime.mp3';
      const vol = typeof request.soundVolume === 'number' ? request.soundVolume : 1;
      const url = chrome.runtime.getURL(`sound/${choice}`);
      console.log('[BG] testSound received', { choice, vol, url, noEcho: !!request.noEcho });
      if (!request.noEcho) {
        sendPlaySound(url, vol);
      }
      try { sendResponse({ ok: true }); } catch {}
      return true;
    }
    case 'startTimer':
      // Only reload settings and update timer duration if this is a fresh start after a reset
      // or when starting a new phase after completion
      if (!timerState.isRunning && timerState.timeLeft === 0) {
        loadTimerSettings().then(() => {
          // Set appropriate time based on current mode
          if (timerState.mode === 'focus') {
            timerState.timeLeft = timerState.settings.focusTime * 60;
          } else if (timerState.mode === 'break') {
            timerState.timeLeft = timerState.settings.breakTime * 60;
          } else {
            timerState.timeLeft = timerState.settings.longBreakTime * 60;
          }
          startTimer();
        });
      } else {
        // Just resume with current time left
        startTimer();
      }
      break;
    case 'openDeepWorkWindow': {
      openDeepWorkWindow().catch((e) => console.warn('[BG] openDeepWorkWindow error', e));
      try { sendResponse({ ok: true }); } catch {}
      return true;
    }
    case 'deepWorkApproved': {
      // User finished the checklist; start a focus session
      (async () => {
        try {
          timerState.mode = 'focus';
          // Initialize duration for a clean start
          timerState.timeLeft = (timerState.settings?.focusTime || 25) * 60;
          await saveTimerState();
          startTimer();
          // Close the window if still open
          if (deepWorkWindowId !== null) {
            try { await chrome.windows.remove(deepWorkWindowId); } catch {}
            deepWorkWindowId = null;
          }
          try { sendResponse({ ok: true }); } catch {}
        } catch (e) {
          console.warn('[BG] deepWorkApproved error', e);
          try { sendResponse({ ok: false, error: String(e) }); } catch {}
        }
      })();
      return true;
    }

    case 'pauseTimer':
      pauseTimer();
      break;

    case 'resetTimer':
      resetTimer();
      break;

    case 'getTimerState':
      sendResponse(timerState);
      return true; // Keep message channel open

    case 'testBlocking':
      console.log('Testing blocking functionality...');
      try {
        sendResponse({ success: true, webRequestInstalled: webReqListenerInstalled, sites: currentBlockedSites.length });
      } catch {}
      return true;

    case 'updateSettings':
      // Handle settings update from popup
      loadTimerSettings().then(() => {
        // Only update timeLeft if timer is not running and we're at the start of a session
        if (!timerState.isRunning) {
          if (timerState.mode === 'focus') {
            timerState.timeLeft = timerState.settings.focusTime * 60;
          } else if (timerState.mode === 'break') {
            timerState.timeLeft = timerState.settings.breakTime * 60;
          } else {
            timerState.timeLeft = timerState.settings.longBreakTime * 60;
          }
          saveTimerState();
          updateBadge();
        }
      });
      break;
    case 'startFromPrompt': {
        // User chose the next mode from the time-up window
      const mode = request.mode === 'break' ? 'break' : 'focus';
      const focusMinutes = Number.isFinite(request.focusMinutes) ? Math.max(1, Math.min(180, Math.floor(request.focusMinutes))) : timerState.settings.focusTime;
      const breakMinutes = Number.isFinite(request.breakMinutes) ? Math.max(1, Math.min(180, Math.floor(request.breakMinutes))) : timerState.settings.breakTime;
      console.log('[BG] startFromPrompt received', { requestMode: request.mode, resolvedMode: mode, focusMinutes, breakMinutes });
      try { chrome.storage.sync.set({ focusTime: focusMinutes, breakTime: breakMinutes }); } catch {}
      // Update in-memory settings
      timerState.settings.focusTime = focusMinutes;
      timerState.settings.breakTime = breakMinutes;
      // Ensure any existing timer is fully stopped before switching
      pauseTimer();
      // Apply the chosen mode and duration explicitly
      if (mode === 'focus') {
        timerState.mode = 'focus';
        timerState.timeLeft = focusMinutes * 60;
      } else {
        timerState.mode = 'break';
        timerState.timeLeft = breakMinutes * 60;
      }
      // Persist and then start
      saveTimerState()
        .then(() => {
          updateBadge();
          startTimer();
          try { sendResponse({ ok: true, mode: timerState.mode, timeLeft: timerState.timeLeft }); } catch {}
        })
        .catch((e) => {
          console.warn('[BG] startFromPrompt save error', e);
          try { sendResponse({ ok: false, error: String(e) }); } catch {}
        });
      return true; // keep port open for async response
      }
  }
});

// Track time-up popup window lifecycle
chrome.windows?.onRemoved.addListener((id) => {
  if (id === timeUpWindowId) {
    timeUpWindowId = null;
  }
  if (id === deepWorkWindowId) {
    deepWorkWindowId = null;
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener(() => {
  // Open popup when notification is clicked
  chrome.action.openPopup();
});

// Initialize on startup
loadTimerState().then(() => {
  updateBadge();
});

// Clean up on shutdown
chrome.runtime.onSuspend.addListener(() => {
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});