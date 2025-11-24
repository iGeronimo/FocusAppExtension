(function(){
  const form = document.getElementById('feedbackForm');
  const statusEl = document.getElementById('status');
  const sendBtn = document.getElementById('sendBtn');
  const ENDPOINT = 'https://mathijslehman.site/send_email.php';

  function setStatus(msg, ok=true){
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = ok ? '#b3b3b3' : '#ff625c';
  }

  function getValues(){
    return {
      name: document.getElementById('name')?.value?.trim() || '',
      email: document.getElementById('email')?.value?.trim() || '',
      topic: document.getElementById('topic')?.value || 'General',
      message: document.getElementById('message')?.value?.trim() || ''
    };
  }

  async function onSubmit(e){
    e.preventDefault();
    const { name, email, topic, message } = getValues();
    if (!name){ setStatus('Name required', false); return; }
    if (!email){ setStatus('Email required', false); return; }
    if (!message){ setStatus('Message required', false); return; }
    sendBtn.disabled = true;
    setStatus('Sending…');
    try {
      // Include subject derived from topic so backend can optionally use it directly.
      const body = new URLSearchParams({ name, email, topic, message, subject: topic });
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
      if (!res.ok){
        setStatus('Server error: ' + res.status, false);
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.status === 'success'){
          setStatus('Feedback sent. Thank you!');
          form.reset();
        } else if (data.status === 'error') {
          setStatus(data.message || 'Failed to send.', false);
        } else {
          setStatus('Unexpected response.', false);
        }
      }
    } catch (err){
      setStatus('Network error: ' + (err.message || 'Unknown'), false);
    } finally {
      sendBtn.disabled = false;
    }
  }

  form.addEventListener('submit', onSubmit);
})();
