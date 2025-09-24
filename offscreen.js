// Offscreen document script to play sounds without a visible UI

// Simple chime via Web Audio API
async function playChime(volume = 1) {
  try {
    console.log('[Offscreen] playChime start', { volume });
    const ctx = new (self.AudioContext || self.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880; // A5
    const maxGain = Math.max(0, Math.min(1, volume)) * 0.2;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(maxGain, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.85);
  } catch (e) {
    console.warn('[Offscreen] playChime error', e);
  }
}

// Optional: play a bundled audio file
async function playFile(url, volume = 1) {
  try {
    console.log('[Offscreen] playFile fetch', { url, volume });
    const ctx = new (self.AudioContext || self.webkitAudioContext)();
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buf);
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
    src.connect(g).connect(ctx.destination);
    src.start(0);
    console.log('[Offscreen] playFile started');
  } catch (e) {
    // fallback to chime
    console.warn('[Offscreen] playFile error, falling back to chime', e);
    playChime(volume);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'play-sound') {
    console.log('[Offscreen] Received play-sound', msg.payload);
    const payload = msg.payload || {};
    if (payload.url) {
      playFile(payload.url, payload.volume ?? 1);
    } else {
      playChime(payload.volume ?? 1);
    }
  }
});

// Signal readiness to the background script to avoid race conditions
try {
  console.log('[Offscreen] signaling ready');
  chrome.runtime.sendMessage({ type: 'offscreen-ready' }, () => {
    const err = chrome.runtime.lastError;
    if (err) console.warn('[Offscreen] offscreen-ready send error', err);
  });
} catch (e) {
  console.warn('[Offscreen] failed to signal ready', e);
}
