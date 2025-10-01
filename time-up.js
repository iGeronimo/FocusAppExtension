// Time-up mini window logic
(function(){
  const $ = (id) => document.getElementById(id);
  const startBreakBtn = $('startBreakBtn');
  const startFocusBtn = $('startFocusBtn');
  const details = $('details');

  async function loadDurations(){
    const { focusTime = 25, breakTime = 5, longBreakTime = 15 } = await chrome.storage.sync.get({ focusTime:25, breakTime:5, longBreakTime:15 });
    details.textContent = `Break: ${breakTime} min · Focus: ${focusTime} min`;
    return { focusTime, breakTime, longBreakTime };
  }

  function closeSelf(){
    // Attempt to close the window. If blocked, leave it to the user.
    window.close();
  }

  function startMode(mode){
    chrome.runtime.sendMessage({ action: 'startFromPrompt', mode }, () => {
      // ignore errors
      closeSelf();
    });
  }

  loadDurations();

  startBreakBtn.addEventListener('click', () => startMode('break'));
  startFocusBtn.addEventListener('click', () => startMode('focus'));
})();
