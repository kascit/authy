(function () {
  'use strict';

  const stateLoading = document.getElementById('stateLoading');
  const stateInput = document.getElementById('stateInput');
  const stateAuthorized = document.getElementById('stateAuthorized');
  const otpInputs = Array.from(document.querySelectorAll('.otp'));
  const msg = document.getElementById('msg');
  const referrer = document.referrer || null;
  const API = window.location.origin;

  // --- State ---

  function show(el) {
    [stateLoading, stateInput, stateAuthorized].forEach(s => s.classList.add('hidden'));
    el.classList.remove('hidden');
  }

  function showMsg(text) {
    msg.textContent = text;
    msg.classList.remove('hidden');
    msg.style.animation = 'none';
    msg.offsetHeight;
    msg.style.animation = '';
  }

  function hideMsg() { msg.classList.add('hidden'); }

  function getCode() { return otpInputs.map(i => i.value).join(''); }

  function setError() {
    otpInputs.forEach(i => {
      i.classList.add('error');
      i.value = '';
    });
    setTimeout(() => {
      otpInputs.forEach(i => i.classList.remove('error'));
      otpInputs[0].focus();
    }, 400);
  }

  function setSuccess() {
    otpInputs.forEach(i => {
      i.classList.add('success');
      i.disabled = true;
    });
  }

  function setLoading(on) {
    otpInputs.forEach(i => {
      i.classList.toggle('loading', on);
      i.disabled = on;
    });
  }

  // --- Input Handling ---

  otpInputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      input.value = val ? val[0] : '';
      hideMsg();

      if (val && idx < 5) {
        otpInputs[idx + 1].focus();
      }

      input.classList.toggle('filled', !!input.value);

      // Auto-submit when all 6 filled
      const code = getCode();
      if (code.length === 6) {
        submit(code);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        otpInputs[idx - 1].focus();
        otpInputs[idx - 1].value = '';
        otpInputs[idx - 1].classList.remove('filled');
      }
    });

    // Handle paste on any input
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!pasted) return;
      pasted.split('').forEach((ch, i) => {
        if (otpInputs[i]) {
          otpInputs[i].value = ch;
          otpInputs[i].classList.add('filled');
        }
      });
      const focusIdx = Math.min(pasted.length, 5);
      otpInputs[focusIdx].focus();
      if (pasted.length === 6) submit(pasted);
    });

    // Select on focus for easy overwrite
    input.addEventListener('focus', () => input.select());
  });

  // --- Submit ---

  async function submit(code) {
    if (!/^\d{6}$/.test(code)) return;
    hideMsg();
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess();
        setTimeout(() => {
          show(stateAuthorized);
          if (referrer && !referrer.includes(window.location.hostname)) {
            setTimeout(() => { window.location.href = referrer; }, 800);
          }
        }, 300);
      } else {
        setLoading(false);
        showMsg(data.error || 'Invalid code');
        setError();
      }
    } catch {
      setLoading(false);
      showMsg('Connection error');
      setError();
    }
  }

  // --- Init ---

  async function init() {
    try {
      const res = await fetch(`${API}/api/status`, { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated && data.role === 'admin') {
        show(stateAuthorized);
        if (referrer && !referrer.includes(window.location.hostname)) {
          setTimeout(() => { window.location.href = referrer; }, 800);
        }
        return;
      }
    } catch {}

    show(stateInput);
    otpInputs[0].focus();
  }

  init();
})();
