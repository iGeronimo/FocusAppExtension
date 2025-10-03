// Time-up mini window logic
(function(){
  const $ = (id) => document.getElementById(id);
  const startBreakBtn = $('startBreakBtn');
  const startFocusBtn = $('startFocusBtn');
  const details = $('details');
  const focusInput = $('focusMinutes');
  const breakInput = $('breakMinutes');

  async function loadDurations(){
    const { focusTime = 25, breakTime = 5, longBreakTime = 15 } = await chrome.storage.sync.get({ focusTime:25, breakTime:5, longBreakTime:15 });
    if (focusInput) focusInput.value = String(focusTime);
    if (breakInput) breakInput.value = String(breakTime);
    return { focusTime, breakTime, longBreakTime };
  }

  async function playCompletionSound(){
    try {
      const { soundEnabled = true, soundChoice = 'Chime.mp3', soundVolume = 1 } = await chrome.storage.sync.get({ soundEnabled: true, soundChoice: 'Chime.mp3', soundVolume: 1 });
      if (!soundEnabled || soundVolume <= 0) return;
      const url = chrome.runtime.getURL(`sound/${soundChoice}`);
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, soundVolume));
      await audio.play();
    } catch (e) {
      // ignore playback errors
    }
  }

  function closeSelf(){
    // Attempt to close the window. If blocked, leave it to the user.
    window.close();
  }

  function clampInt(n, min, max) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  async function persistDurations(focusMinutes, breakMinutes){
    await chrome.storage.sync.set({ focusTime: focusMinutes, breakTime: breakMinutes });
  }

  function startMode(mode){
    const focusMinutes = clampInt(focusInput?.value ?? 25, 1, 180);
    const breakMinutes = clampInt(breakInput?.value ?? 5, 1, 180);
    console.log('[TimeUp] startMode click', { mode, focusMinutes, breakMinutes });
    persistDurations(focusMinutes, breakMinutes).finally(() => {
      chrome.runtime.sendMessage({ action: 'startFromPrompt', mode, focusMinutes, breakMinutes }, () => {
        // ignore errors
        closeSelf();
      });
    });
  }

  loadDurations();
  // Attempt to play the completion sound when this window appears
  playCompletionSound();

  startBreakBtn.addEventListener('click', () => startMode('break'));
  startFocusBtn.addEventListener('click', () => startMode('focus'));
})();
