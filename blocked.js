// State management
let selectedReason = '';
let customOptions = [];
let currentSessionTimestamp = null; // track the record to update reflection
const REFLECTION_MAX_WORDS = 100;

// Update time every second
function updateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString();
  const el = document.getElementById('currentTime');
  if (el) el.textContent = timeString;
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
  updateTime();
  setInterval(updateTime, 1000);
  loadCustomOptions();
  attachEventListeners();

  // Show main question immediately; hide results
  const mainQ = document.getElementById('mainQuestion');
  const results = document.getElementById('results');
  if (mainQ) mainQ.classList.remove('hidden');
  if (results) results.classList.add('hidden');
});

// Load custom options from localStorage
function loadCustomOptions() {
  try {
    const saved = localStorage.getItem('customReflectionOptions');
    if (saved) {
      customOptions = JSON.parse(saved);
    }
    displayCustomOptions();
  } catch (error) {
    console.log('Could not load custom options:', error);
  }
}

// Save custom options to localStorage
function saveCustomOptions() {
  try {
    localStorage.setItem('customReflectionOptions', JSON.stringify(customOptions));
  } catch (error) {
    console.log('Could not save custom options:', error);
  }
}

// Display custom options as chips with delete badge
function displayCustomOptions() {
  const container = document.getElementById('customOptions');
  if (!container) return;
  container.innerHTML = '';

  customOptions.forEach(option => {
    const chip = document.createElement('div');
    chip.className = 'custom-option';
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.title = 'Click to select';

    const label = document.createElement('span');
    label.textContent = option;

    const del = document.createElement('span');
    del.className = 'delete-badge';
    del.setAttribute('title', 'Remove');
    del.setAttribute('aria-label', `Remove ${option}`);
    del.textContent = '×';

    // Select on click/keyboard
    chip.addEventListener('click', () => selectCustomOption(option, chip));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectCustomOption(option, chip);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        removeCustomOption(option);
      }
    });

    // Delete badge click
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      removeCustomOption(option);
    });

    chip.appendChild(label);
    chip.appendChild(del);
    container.appendChild(chip);
  });
}

// Attach event listeners
function attachEventListeners() {
  // Standard option buttons
  const optionButtons = document.querySelectorAll('.option-button');
  optionButtons.forEach(button => {
    button.addEventListener('click', function () {
      const value = this.dataset.value;
      if (value === 'custom') {
        showCustomInput();
      } else {
        const label = this.querySelector('div:last-child')?.textContent?.trim() || value;
        selectOption(value, label, this);
      }
    });
  });

  // Enter key in custom input
  const customInput = document.getElementById('customInput');
  if (customInput) {
    customInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') addCustomOption();
    });
  }

  // Add / Cancel custom buttons
  const addBtn = document.getElementById('addCustomBtn');
  if (addBtn) addBtn.addEventListener('click', addCustomOption);

  const cancelBtn = document.getElementById('cancelCustomBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelCustom);

  // Existing action buttons
  const backBtn = document.getElementById('backButton');
  if (backBtn) backBtn.addEventListener('click', () => history.back());

  const closeBtn = document.getElementById('closeButton');
  if (closeBtn) closeBtn.addEventListener('click', closeCurrentTab);

  // Export analytics (in bottom action bar)
  const saveBtn = document.getElementById('saveReflectionButton');
  if (saveBtn) saveBtn.addEventListener('click', saveReflection);

  // Personal reflection input (limit ~500 words and autosave)
  bindReflectionInput();
}

// Ensure reflection input is bound and counter is in sync
function bindReflectionInput() {
  const input = document.getElementById('reflectionInput');
  const counter = document.getElementById('reflectionCounter');
  if (!input) return;

  if (!input.dataset.bound) {
    input.addEventListener('input', onReflectionInput);
    input.dataset.bound = 'true';
  }

  // Enforce limit on any prefilled value and sync counter
  const limited = trimToWordLimit(input.value, REFLECTION_MAX_WORDS);
  if (limited !== input.value) input.value = limited;
  if (counter) counter.textContent = `${countWords(input.value)} / ${REFLECTION_MAX_WORDS} words`;
}

// Select a standard option
function selectOption(value, displayText, buttonElem) {
  // Clear all selections
  document.querySelectorAll('.option-button, .custom-option').forEach(btn => {
    btn.classList.remove('selected');
  });

  // Select the clicked option
  if (buttonElem && buttonElem.classList) {
    buttonElem.classList.add('selected');
  }

  selectedReason = displayText;

  // Show results after a short delay
  setTimeout(() => {
    showResults();
    saveResponseData(value, displayText);
  }, 300);
}

// Select a custom option
function selectCustomOption(option, elem) {
  document.querySelectorAll('.option-button, .custom-option').forEach(btn => {
    btn.classList.remove('selected');
  });
  if (elem && elem.classList) elem.classList.add('selected');
  selectedReason = option;
  setTimeout(() => {
    showResults();
    saveResponseData('custom', option);
  }, 300);
}

// Remove a custom option
function removeCustomOption(option) {
  const idx = customOptions.indexOf(option);
  if (idx !== -1) {
    customOptions.splice(idx, 1);
    saveCustomOptions();
    displayCustomOptions();
  }
}

// Show custom input section
function showCustomInput() {
  const section = document.getElementById('customInputSection');
  if (section) section.classList.add('show');
  const input = document.getElementById('customInput');
  if (input) input.focus();
}

// Add custom option
function addCustomOption() {
  const input = document.getElementById('customInput');
  if (!input) return;
  const value = input.value.trim();
  if (!value) return;

  if (!customOptions.includes(value)) {
    customOptions.push(value);
    saveCustomOptions();
    displayCustomOptions();
  }

  selectedReason = value;
  hideCustomInput();
  input.value = '';

  setTimeout(() => {
    showResults();
    saveResponseData('custom', value);
  }, 200);
}

// Cancel custom input
function cancelCustom() {
  hideCustomInput();
  const input = document.getElementById('customInput');
  if (input) input.value = '';
}

// Hide custom input section
function hideCustomInput() {
  const section = document.getElementById('customInputSection');
  if (section) section.classList.remove('show');
}

// Show results
function showResults() {
  const mainQ = document.getElementById('mainQuestion');
  const results = document.getElementById('results');
  const actionButtons = document.getElementById('actionButtons');

  if (mainQ) mainQ.classList.add('hidden');
  if (results) results.classList.remove('hidden');
  if (actionButtons) actionButtons.style.display = 'flex';

  // We no longer render the "You wanted to open this site..." line

  // Generate insight
  const insight = generateInsight(selectedReason);
  const insightEl = document.getElementById('insight');
  if (insightEl) insightEl.innerHTML = `<h3>💡 Reflection</h3><p>${insight}</p>`;

  // Reset reflection input and counter
  const reflectionInput = document.getElementById('reflectionInput');
  const reflectionCounter = document.getElementById('reflectionCounter');
  if (reflectionInput) reflectionInput.value = '';
  if (reflectionCounter) reflectionCounter.textContent = `0 / ${REFLECTION_MAX_WORDS} words`;

  // Make sure input is bound after showing the section and focus it
  bindReflectionInput();
  if (reflectionInput) reflectionInput.focus();
}

// Generate personalized insight
function generateInsight(reason) {
  const r = (reason || '').toLowerCase();

  if (r.includes('bored')) {
    return 'Boredom signals low engagement. Try a tiny, interesting sub-task or take a brief real break.';
  }
  if (r.includes('anxious')) {
    return 'Anxiety seeks quick comfort. Try 3 deep breaths, a 1‑minute pause, or jot down the worry.';
  }
  if (r.includes('stressed')) {
    return 'Stress drives distraction. Identify one small step to reduce it, or take a short walk/stretch.';
  }
  if (r.includes('tired') || r.includes('fatigue') || r.includes('exhaust')) {
    return 'Your brain may need rest, not stimulation. Hydrate, move briefly, or consider a micro‑nap.';
  }
  if (r.includes('overwhelmed')) {
    return 'Break the task into the smallest next step. Reducing scope reduces overwhelm.';
  }
  if (r.includes('lonely') || r.includes('disconnected')) {
    return 'Reach out to a person directly—a short call or message beats passive scrolling.';
  }
  if (r.includes('procrast')) {
    return 'Start a 5‑minute timer and do just the first step. Momentum beats perfection.';
  }
  if (r.includes('habit')) {
    return 'This might be automatic. Add a 5‑second pause rule before opening habitual sites.';
  }
  if (r.includes('curious')) {
    return 'Curiosity is good—channel it. Jot the question, schedule time later, return to focus now.';
  }

  return `You're feeling "${reason}"—valid and noticed. Choose the smallest helpful action before returning.`;
}

// Save response data for potential analytics
function saveResponseData(category, reason) {
  try {
    const timestamp = new Date().toISOString();
    currentSessionTimestamp = timestamp;

    const reflection = (document.getElementById('reflectionInput')?.value || '').trim();

    const sessionData = {
      timestamp,
      category,
      reason,
      reflection, // store personal reflection
      url: window.location.href
    };

    let existingData = JSON.parse(localStorage.getItem('distractionAnalytics') || '[]');
    existingData.push(sessionData);

    if (existingData.length > 100) {
      existingData = existingData.slice(-100);
    }

    localStorage.setItem('distractionAnalytics', JSON.stringify(existingData));
    return timestamp;
  } catch (error) {
    console.log('Could not save analytics data:', error);
    return null;
  }
}

// Save current reflection to chrome.storage (with localStorage fallback)
function saveReflection() {
  try {
    const input = document.getElementById('reflectionInput');
    const text = (input?.value || '').trim();
    if (!text) {
      alert('Please write a reflection before saving.');
      return;
    }

    // Persist into localStorage alongside the current session entry
    commitSavedReflection(text);

    // Append to reflection log in chrome.storage.local
    const record = {
      timestamp: new Date().toISOString(),
      reason: selectedReason || '',
      reflection: text,
      url: window.location.href
    };
    appendToReflectionLog(record, () => {
      // Optional feedback
      alert('Reflection saved');
    });
  } catch (error) {
    console.log('Could not save reflection:', error);
  }
}

// Update localStorage to store the saved reflection with the current session entry
function commitSavedReflection(text) {
  const nowIso = new Date().toISOString();
  try {
    let data = JSON.parse(localStorage.getItem('distractionAnalytics') || '[]');

    if (currentSessionTimestamp) {
      const idx = data.findIndex(d => d.timestamp === currentSessionTimestamp);
      if (idx !== -1) {
        data[idx].reflection = (text || '').trim();
        data[idx].saved = true;
        data[idx].savedAt = nowIso;
        localStorage.setItem('distractionAnalytics', JSON.stringify(data));
        return;
      }
    }

    // No active session found: create a new entry
    const newEntry = {
      timestamp: nowIso,
      category: 'saved',
      reason: selectedReason || '',
      reflection: (text || '').trim(),
      url: window.location.href,
      saved: true,
      savedAt: nowIso
    };
    data.push(newEntry);
    if (data.length > 100) data = data.slice(-100);
    localStorage.setItem('distractionAnalytics', JSON.stringify(data));
    currentSessionTimestamp = nowIso;
  } catch (e) {
    console.log('Could not commit saved reflection:', e);
  }
}

// Append a record to chrome.storage.local: reflectionLog (fallback to localStorage)
function appendToReflectionLog(record, callback) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get({ reflectionLog: [] }, (res) => {
        const list = Array.isArray(res.reflectionLog) ? res.reflectionLog : [];
        list.push(record);
        if (list.length > 1000) {
          list.splice(0, list.length - 1000);
        }
        chrome.storage.local.set({ reflectionLog: list }, () => {
          if (typeof callback === 'function') callback();
        });
      });
    } else {
      const raw = localStorage.getItem('reflectionLog');
      const list = raw ? JSON.parse(raw) : [];
      list.push(record);
      if (list.length > 1000) {
        list.splice(0, list.length - 1000);
      }
      localStorage.setItem('reflectionLog', JSON.stringify(list));
      if (typeof callback === 'function') callback();
    }
  } catch (e) {
    console.log('Could not append reflection log:', e);
  }
}

// Personal reflection helpers (limit ~500 words and autosave to current session)
function countWords(text) {
  const t = (text || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function trimToWordLimit(text, limit) {
  const words = (text || '').trim().split(/\s+/);
  if (!words[0]) return '';
  if (words.length <= limit) return words.join(' ');
  return words.slice(0, limit).join(' ');
}

function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function updateReflectionForCurrentSession(text) {
  if (!currentSessionTimestamp) return;
  try {
    let data = JSON.parse(localStorage.getItem('distractionAnalytics') || '[]');
    const idx = data.findIndex(d => d.timestamp === currentSessionTimestamp);
    if (idx !== -1) {
      data[idx].reflection = (text || '').trim();
      localStorage.setItem('distractionAnalytics', JSON.stringify(data));
    }
  } catch (e) {
    console.log('Could not update reflection:', e);
  }
}

const saveReflectionDebounced = debounce(updateReflectionForCurrentSession, 400);

function onReflectionInput(e) {
  const input = e.target;
  let words = countWords(input.value);
  if (words > REFLECTION_MAX_WORDS) {
    const limited = trimToWordLimit(input.value, REFLECTION_MAX_WORDS);
    if (limited !== input.value) input.value = limited;
    words = REFLECTION_MAX_WORDS;
  }

  const counter = document.getElementById('reflectionCounter');
  if (counter) counter.textContent = `${words} / ${REFLECTION_MAX_WORDS} words`;

  saveReflectionDebounced(input.value);
}

function closeCurrentTab() {
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