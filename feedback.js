(function(){
  const form = document.getElementById('feedbackForm');
  const copyBtn = document.getElementById('copyBtn');
  const toEmail = 'mathijslehman.ml@gmail.com';

  function encode(str){ return encodeURIComponent(str || ''); }

  function buildBody(){
    const name = document.getElementById('name')?.value?.trim() || '';
    const email = document.getElementById('email')?.value?.trim() || '';
    const msg = document.getElementById('message')?.value?.trim() || '';
    const lines = [];
    if (name) lines.push('Name: ' + name);
    if (email) lines.push('Email: ' + email);
    if (msg) { if (lines.length) lines.push(''); lines.push(msg); }
    return lines.join('\n');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = buildBody();
    const subject = 'Mindful Focus Feedback';
    const href = `mailto:${toEmail}?subject=${encode(subject)}&body=${encode(body)}`;
    try { window.location.href = href; } catch {}
  });

  copyBtn.addEventListener('click', async () => {
    try {
      const body = buildBody();
      await navigator.clipboard.writeText(body);
      showToast('Copied to clipboard');
    } catch {
      showToast('Copy failed');
    }
  });

  function showToast(text){
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border:1px solid #333;padding:8px 12px;border-radius:8px;z-index:9999;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
})();
