(function(){
  const closeBtn = document.getElementById('closeBtn');
  const logBtn = document.getElementById('logBtn');
  function closeTab() {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].id) {
            chrome.tabs.remove(tabs[0].id);
          } else {
            window.close();
          }
        });
      } else {
        window.close();
      }
    } catch (e) {
      window.close();
    }
  }
  if (closeBtn) closeBtn.addEventListener('click', closeTab);
  if (logBtn) logBtn.addEventListener('click', () => {
    const url = chrome.runtime.getURL('reflection-log.html');
    window.location.href = url;
  });
})();
