const fsPhase = document.getElementById('fsPhase');
const fsTime = document.getElementById('fsTime');
const fsFill = document.getElementById('fsFill');
const fsPlayPause = document.getElementById('fsPlayPause');
const fsReset = document.getElementById('fsReset');
const fsFullscreen = document.getElementById('fsFullscreen');

async function getTimerState(){
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => resolve(response));
  });
}

function sendMessage(action, data={}){
  chrome.runtime.sendMessage({ action, ...data });
}

function formatTime(sec){
  const m = Math.floor(sec/60);
  const s = sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

async function render(){
  try {
    const state = await getTimerState();
    fsTime.textContent = formatTime(state.timeLeft || 0);
    fsPlayPause.textContent = state.isRunning ? 'Pause' : 'Start';
    let label = 'Ready to focus';
    if (state.isRunning) label = state.mode === 'focus' ? 'Focus' : (state.mode === 'break' ? 'Break' : 'Long break');
    else if (state.mode !== 'focus') label = state.mode === 'break' ? 'Break' : 'Long break';
    fsPhase.textContent = label;
    const total = state.mode === 'focus' ? state.settings.focusTime*60 : state.mode === 'break' ? state.settings.breakTime*60 : state.settings.longBreakTime*60;
    const pct = Math.max(0, Math.min(100, ((total - state.timeLeft)/total)*100));
    fsFill.style.width = pct + '%';
  } catch (e) {
    // no-op
  }
}

fsPlayPause.addEventListener('click', async () => {
  const state = await getTimerState();
  if (state.isRunning) {
    sendMessage('pauseTimer');
  } else {
    try {
      const { deepWorkEnabled = false } = await chrome.storage.sync.get({ deepWorkEnabled: false });
      if (!state.isRunning && state.mode === 'focus' && deepWorkEnabled) {
        chrome.runtime.sendMessage({ action: 'openDeepWorkWindow' });
      } else {
        sendMessage('startTimer');
      }
    } catch (e) {
      // Fallback to starting timer if storage fails
      sendMessage('startTimer');
    }
  }
  setTimeout(render, 150);
});

fsReset.addEventListener('click', () => {
  sendMessage('resetTimer');
  setTimeout(render, 150);
});

fsFullscreen.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});

// Toggle immersive UI when entering/leaving fullscreen so only timer + bar remain
function updateImmersive(){
  const on = !!document.fullscreenElement;
  try { document.body.classList.toggle('immersive', on); } catch {}
}

document.addEventListener('fullscreenchange', updateImmersive);
// Initialize state in case the page loads while already in fullscreen
updateImmersive();

// periodic refresh
render();
setInterval(render, 1000);
