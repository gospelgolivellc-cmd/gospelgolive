// Shared two-factor-auth UI, used in two different contexts:
//  1. Mandatory pastor sign-in 2FA (mounted directly into an auth-card panel
//     in public/mockup.html — see TwoFactor.mountSetup/mountVerify).
//  2. Mandatory giving 2FA (public/church.html's Give modal and mockup.html's
//     seeker Give tab — see TwoFactor.postGiving/confirmLiveGiving).
// One shared script so the QR/code-entry rendering only exists once.
(function () {
  const STYLE = `
    .tf-h3{ font-family:'Fraunces',serif; font-size:18px; color:var(--text,#eef1f8); margin:0 0 8px; font-weight:600; }
    .tf-sub{ color:var(--text-dim,#a6b0cc); font-size:13.5px; line-height:1.5; margin:0 0 16px; }
    .tf-qr{ display:block; width:180px; height:180px; margin:0 auto 14px; border-radius:10px; background:#fff; padding:8px; }
    .tf-secret{
      font-family:'IBM Plex Mono',monospace; font-size:13px; text-align:center; letter-spacing:.05em;
      color:var(--gold-soft,#f5d787); background:var(--bg-deep,#060c1f); border:1px solid var(--border-soft,rgba(255,255,255,0.08));
      border-radius:8px; padding:10px; margin-bottom:16px; word-break:break-all;
    }
    .tf-label{ display:block; font-size:12.5px; color:var(--text-dim,#a6b0cc); margin-bottom:6px; }
    .tf-code-input{
      width:100%; font-family:'IBM Plex Mono',monospace; font-size:20px; letter-spacing:.3em; text-align:center;
      border:1px solid var(--border-soft,rgba(255,255,255,0.08)); border-radius:10px; background:var(--bg-deep,#060c1f);
      color:var(--text,#eef1f8); padding:14px 12px; margin-bottom:16px; box-sizing:border-box; transition:border-color .15s, box-shadow .15s;
    }
    .tf-code-input:focus{ outline:none; border-color:var(--gold,#e8b84b); box-shadow:0 0 0 3px rgba(232,184,75,0.18); }
    .tf-code-group{ display:flex; gap:8px; margin-bottom:16px; }
    .tf-code-box{
      flex:1 1 0; min-width:0; height:58px; font-family:'IBM Plex Mono',monospace; font-size:24px; font-weight:700;
      text-align:center; border:1px solid var(--border-soft,rgba(255,255,255,0.08)); border-radius:12px;
      background:var(--bg-deep,#060c1f); color:var(--text,#eef1f8); padding:0; box-sizing:border-box;
      transition:border-color .15s, box-shadow .15s, transform .1s;
    }
    .tf-code-box:focus{
      outline:none; border-color:var(--gold,#e8b84b); box-shadow:0 0 0 3px rgba(232,184,75,0.18); transform:translateY(-1px);
    }
    .tf-code-box.filled{ border-color:rgba(232,184,75,0.55); }
    .tf-error{ color:var(--red,#e05a5a); font-size:13px; margin-bottom:12px; }
    .tf-btn{
      width:100%; background:linear-gradient(135deg,var(--gold,#e8b84b),var(--gold-soft,#f5d787)); color:var(--bg-deep,#060c1f);
      border:none; border-radius:999px; padding:14px; font-weight:700; font-size:15px; letter-spacing:.01em; cursor:pointer;
      box-shadow:0 6px 16px rgba(232,184,75,0.28); transition:transform .15s, box-shadow .15s, opacity .15s;
    }
    .tf-btn:hover:not(:disabled){ transform:translateY(-1px); box-shadow:0 8px 20px rgba(232,184,75,0.38); }
    .tf-btn:active:not(:disabled){ transform:translateY(0); box-shadow:0 4px 12px rgba(232,184,75,0.28); }
    .tf-btn:disabled{ opacity:.5; cursor:default; transform:none; box-shadow:none; }
    .tf-btn-outline{
      background:transparent; border:1px solid var(--border-soft,rgba(255,255,255,0.08)); color:var(--text,#eef1f8);
      margin-top:10px; box-shadow:none;
    }
    .tf-btn-outline:hover:not(:disabled){ border-color:var(--gold,#e8b84b); box-shadow:none; }
    .tf-dev-banner{
      background:rgba(232,184,75,0.12); border:1px solid rgba(232,184,75,0.3); color:var(--gold-soft,#f5d787);
      font-size:12.5px; border-radius:8px; padding:10px; margin-bottom:14px; text-align:center;
    }
    .tf-link{ display:block; text-align:center; margin-top:12px; font-size:12.5px; color:var(--text-faint,#6b7593); cursor:pointer; }
    .tf-backup-codes{
      display:grid; grid-template-columns:1fr 1fr; gap:8px; font-family:'IBM Plex Mono',monospace; font-size:13px;
      color:var(--gold-soft,#f5d787); background:var(--bg-deep,#060c1f); border:1px solid var(--border-soft,rgba(255,255,255,0.08));
      border-radius:8px; padding:14px; margin-bottom:16px; text-align:center;
    }
    #tf-overlay{
      position:fixed; inset:0; background:rgba(3,7,20,0.72); z-index:10000; display:none;
      align-items:center; justify-content:center; padding:20px;
    }
    #tf-overlay.show{ display:flex; }
    #tf-modal{
      background:var(--panel,#122548); border:1px solid var(--border,rgba(232,184,75,0.16)); border-radius:16px;
      padding:28px; max-width:360px; width:100%; position:relative; font-family:'Inter',sans-serif;
    }
    #tf-modal-close{
      position:absolute; top:12px; right:14px; background:none; border:none; color:var(--text-dim,#a6b0cc);
      font-size:20px; cursor:pointer; line-height:1;
    }
  `;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  function injectStyleOnce() {
    if (document.getElementById('tf-style')) return;
    const style = el('style', { id: 'tf-style' }, [document.createTextNode(STYLE)]);
    document.head.appendChild(style);
  }

  // A row of single-character boxes for entering a 6 digit TOTP/SMS code —
  // used in place of one wide text field so each digit gets its own large,
  // clearly-focused slot. Handles auto-advance, backspace-to-previous, arrow
  // key navigation, and pasting/autofilling a full code into any box.
  function buildCodeBoxes(length) {
    const wrap = el('div', { class: 'tf-code-group' }, []);
    const boxes = [];
    for (let i = 0; i < length; i++) {
      const box = el(
        'input',
        {
          class: 'tf-code-box',
          maxlength: '1',
          inputmode: 'numeric',
          autocomplete: i === 0 ? 'one-time-code' : 'off',
        },
        []
      );
      boxes.push(box);
      wrap.appendChild(box);
    }

    function focusBoxAt(index) {
      const target = boxes[Math.max(0, Math.min(length - 1, index))];
      target.focus();
      target.select();
    }

    function distribute(startIndex, text) {
      const chars = text.replace(/\s+/g, '').split('');
      chars.forEach((ch, offset) => {
        const target = boxes[startIndex + offset];
        if (!target) return;
        target.value = ch;
        target.classList.toggle('filled', !!ch);
      });
      focusBoxAt(startIndex + chars.length);
    }

    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        if (box.value.length > 1) {
          distribute(i, box.value);
          return;
        }
        box.classList.toggle('filled', !!box.value);
        if (box.value && i < length - 1) focusBoxAt(i + 1);
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) {
          focusBoxAt(i - 1);
          boxes[i - 1].value = '';
          boxes[i - 1].classList.remove('filled');
        } else if (e.key === 'ArrowLeft' && i > 0) {
          e.preventDefault();
          focusBoxAt(i - 1);
        } else if (e.key === 'ArrowRight' && i < length - 1) {
          e.preventDefault();
          focusBoxAt(i + 1);
        }
      });
      box.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (!text) return;
        e.preventDefault();
        distribute(i, text);
      });
    });

    return {
      el: wrap,
      getValue: () => boxes.map((b) => b.value).join(''),
      focus: () => focusBoxAt(0),
      onEnter: (handler) => boxes.forEach((b) => b.addEventListener('keydown', (e) => { if (e.key === 'Enter') handler(); })),
    };
  }

  // Shared final step of enrollment for both methods: collects the code the
  // user needs to type in (from an authenticator app, or one just texted to
  // their phone) and confirms it via /api/auth/2fa/confirm. Calls
  // onSuccess(backupCodes, method) once 2FA is confirmed enabled.
  function renderCodeConfirmStep(container, { label, devCode, buttonLabel, onSuccess }) {
    container.appendChild(el('label', { class: 'tf-label' }, [label]));
    if (devCode) {
      container.appendChild(
        el('div', { class: 'tf-dev-banner' }, [`Dev mode: SMS sending isn't configured yet. Your code is ${devCode}.`])
      );
    }
    const codeGroup = buildCodeBoxes(6);
    const errorEl = el('div', { class: 'tf-error', style: 'display:none' }, []);
    const submitBtn = el('button', { class: 'tf-btn', type: 'button' }, [buttonLabel]);
    container.appendChild(codeGroup.el);
    container.appendChild(errorEl);
    container.appendChild(submitBtn);
    codeGroup.focus();

    async function submit() {
      const code = codeGroup.getValue().trim();
      if (!code) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Confirming…';
      errorEl.style.display = 'none';
      try {
        const res = await fetch('/api/auth/2fa/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (!res.ok) {
          errorEl.textContent = data.error || 'Incorrect code.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = buttonLabel;
          return;
        }
        renderBackupCodes(container, data.backupCodes, () => onSuccess(data.backupCodes, data.method));
      } catch (err) {
        errorEl.textContent = 'Could not reach the server. Please try again.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = buttonLabel;
      }
    }
    submitBtn.addEventListener('click', submit);
    codeGroup.onEnter(submit);
  }

  async function renderAuthenticatorAppSetup(container, { onSuccess }) {
    container.innerHTML = '<p class="tf-sub">Loading…</p>';
    let setupData;
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'totp' }),
      });
      setupData = await res.json();
      if (!res.ok) throw new Error(setupData.error || 'Failed to start setup');
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'tf-error' }, ["Couldn't start two factor setup. Please try again."]));
      return;
    }

    container.innerHTML = '';
    container.appendChild(el('h3', { class: 'tf-h3' }, ['Set up two factor authentication']));
    container.appendChild(
      el('p', { class: 'tf-sub' }, [
        'Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the code below manually.',
      ])
    );
    container.appendChild(el('img', { class: 'tf-qr', src: setupData.qrCodeDataUrl, alt: 'Two factor setup QR code' }, []));
    container.appendChild(el('div', { class: 'tf-secret' }, [setupData.secret]));
    renderCodeConfirmStep(container, {
      label: 'Enter the 6 digit code from your app',
      buttonLabel: 'Confirm & Enable',
      onSuccess,
    });
  }

  function renderPhoneNumberEntry(container, { onSuccess }) {
    container.innerHTML = '';
    container.appendChild(el('h3', { class: 'tf-h3' }, ['Set up two factor authentication']));
    container.appendChild(el('p', { class: 'tf-sub' }, ['Enter the phone number where we should text your codes.']));
    const input = el('input', { class: 'tf-code-input', type: 'tel', placeholder: '+1 555 555 5555' }, []);
    const errorEl = el('div', { class: 'tf-error', style: 'display:none' }, []);
    const submitBtn = el('button', { class: 'tf-btn', type: 'button' }, ['Send code']);
    container.appendChild(input);
    container.appendChild(errorEl);
    container.appendChild(submitBtn);
    input.focus();

    async function submit() {
      const phoneNumber = input.value.trim();
      if (!phoneNumber) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      errorEl.style.display = 'none';
      try {
        const res = await fetch('/api/auth/2fa/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'sms', phoneNumber }),
        });
        const data = await res.json();
        if (!res.ok) {
          errorEl.textContent = data.error || 'Could not send a code to that number.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send code';
          return;
        }
        container.innerHTML = '';
        container.appendChild(el('h3', { class: 'tf-h3' }, ['Enter the code we texted you']));
        container.appendChild(el('p', { class: 'tf-sub' }, [`We sent a 6 digit code to ${data.phoneNumber}.`]));
        renderCodeConfirmStep(container, {
          label: 'Enter the 6 digit code',
          devCode: data.devCode,
          buttonLabel: 'Confirm & Enable',
          onSuccess,
        });
      } catch (err) {
        errorEl.textContent = 'Could not reach the server. Please try again.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send code';
      }
    }
    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  // Renders the enrollment flow into any container — reused by the sign-in
  // setup panel and the giving modal's setup step. First asks which method
  // to use, then hands off to the matching flow. Calls onSuccess(backupCodes,
  // method) once 2FA is confirmed enabled.
  function renderSetupUI(container, { onSuccess }) {
    container.innerHTML = '';
    container.appendChild(el('h3', { class: 'tf-h3' }, ['Set up two factor authentication']));
    container.appendChild(el('p', { class: 'tf-sub' }, ['Choose how you want to receive your codes.']));
    const appBtn = el('button', { class: 'tf-btn', type: 'button' }, ['Use an authenticator app']);
    const phoneBtn = el('button', { class: 'tf-btn tf-btn-outline', type: 'button' }, ['Use my phone number']);
    container.appendChild(appBtn);
    container.appendChild(phoneBtn);
    appBtn.addEventListener('click', () => renderAuthenticatorAppSetup(container, { onSuccess }));
    phoneBtn.addEventListener('click', () => renderPhoneNumberEntry(container, { onSuccess }));
  }

  function renderBackupCodes(container, codes, onContinue) {
    container.innerHTML = '';
    container.appendChild(el('h3', { class: 'tf-h3' }, ['Save your backup codes']));
    container.appendChild(
      el('p', { class: 'tf-sub' }, [
        "If you ever lose access to your authenticator app or phone, use one of these one time codes instead. Store them somewhere safe, this is the only time they're shown.",
      ])
    );
    const grid = el(
      'div',
      { class: 'tf-backup-codes' },
      codes.map((c) => c)
    );
    container.appendChild(grid);
    const continueBtn = el('button', { class: 'tf-btn', type: 'button' }, ["I've saved these codes"]);
    continueBtn.addEventListener('click', onContinue);
    container.appendChild(continueBtn);
  }

  // Requests a fresh code for an sms-method account that's already enrolled
  // — used right before showing the verify/giving prompt, since (unlike a
  // TOTP app) there's nothing to check against until a code has just been
  // texted. Returns the dev-mode code when SMS sending isn't configured yet,
  // so the caller can show it in a banner instead of a real text message.
  async function requestFreshSmsCode() {
    try {
      const res = await fetch('/api/auth/2fa/sms/send', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      return res.ok ? data.devCode : undefined;
    } catch (err) {
      return undefined;
    }
  }

  // Sign-in-only: verifies a code against an already-enrolled account and
  // upgrades the 2FA-pending partial session to a full one server-side. For
  // an sms-method account, this first requests a fresh texted code before
  // showing the prompt.
  async function renderVerifyUI(container, { onSuccess, method }) {
    let devCode;
    if (method === 'sms') {
      container.innerHTML = '<p class="tf-sub">Texting your code…</p>';
      devCode = await requestFreshSmsCode();
    }
    container.innerHTML = '';
    container.appendChild(el('h3', { class: 'tf-h3' }, ['Enter your two factor code']));
    container.appendChild(
      el('p', { class: 'tf-sub' }, [
        method === 'sms'
          ? 'Enter the 6 digit code we just texted you.'
          : 'Open your authenticator app and enter the current 6 digit code.',
      ])
    );
    if (devCode) {
      container.appendChild(
        el('div', { class: 'tf-dev-banner' }, [`Dev mode: SMS sending isn't configured yet. Your code is ${devCode}.`])
      );
    }
    let codeGroup = buildCodeBoxes(6);
    let getCode = () => codeGroup.getValue();
    const errorEl = el('div', { class: 'tf-error', style: 'display:none' }, []);
    const submitBtn = el('button', { class: 'tf-btn', type: 'button' }, ['Verify']);
    const backupLink = el('span', { class: 'tf-link' }, ['Lost your device? Use a backup code instead.']);
    container.appendChild(codeGroup.el);
    container.appendChild(errorEl);
    container.appendChild(submitBtn);
    container.appendChild(backupLink);
    codeGroup.focus();

    backupLink.addEventListener('click', () => {
      // Backup codes are 10 character alphanumeric strings, not a clean fit
      // for 6 single-digit boxes — swap in one wider field for those instead.
      const backupInput = el(
        'input',
        { class: 'tf-code-input', maxlength: '10', placeholder: 'Backup code', autocomplete: 'off' },
        []
      );
      codeGroup.el.replaceWith(backupInput);
      backupInput.focus();
      backupInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      getCode = () => backupInput.value;
      backupLink.style.display = 'none';
    });

    async function submit() {
      const code = getCode().trim();
      if (!code) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying…';
      errorEl.style.display = 'none';
      try {
        const res = await fetch('/api/auth/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (!res.ok) {
          errorEl.textContent = data.error || 'Incorrect code.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Verify';
          return;
        }
        onSuccess(data);
      } catch (err) {
        errorEl.textContent = 'Could not reach the server. Please try again.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify';
      }
    }
    submitBtn.addEventListener('click', submit);
    codeGroup.onEnter(submit);
  }

  // Giving-only: just collects a code string for the caller to resubmit
  // alongside the original gift request — the donation route itself checks
  // the code inline (lib/givingTwoFactor.js), there's no separate verify call.
  // For an sms-method giver, this first requests a fresh texted code before
  // showing the prompt (same reasoning as renderVerifyUI).
  async function renderCodePromptUI(container, { onSuccess, onCancel, method }) {
    let devCode;
    if (method === 'sms') {
      container.innerHTML = '<p class="tf-sub">Texting your code…</p>';
      devCode = await requestFreshSmsCode();
    }
    container.innerHTML = '';
    container.appendChild(el('h3', { class: 'tf-h3' }, ['Confirm it’s you']));
    container.appendChild(
      el('p', { class: 'tf-sub' }, [
        method === 'sms'
          ? 'Enter the 6 digit code we just texted you to complete this gift.'
          : 'Enter the 6 digit code from your authenticator app to complete this gift.',
      ])
    );
    if (devCode) {
      container.appendChild(
        el('div', { class: 'tf-dev-banner' }, [`Dev mode: SMS sending isn't configured yet. Your code is ${devCode}.`])
      );
    }
    const codeGroup = buildCodeBoxes(6);
    const submitBtn = el('button', { class: 'tf-btn', type: 'button' }, ['Continue']);
    container.appendChild(codeGroup.el);
    container.appendChild(submitBtn);
    codeGroup.focus();

    function submit() {
      const code = codeGroup.getValue().trim();
      if (!code) return;
      onSuccess(code);
    }
    submitBtn.addEventListener('click', submit);
    codeGroup.onEnter(submit);
  }

  let overlayEls = null;
  function ensureOverlay() {
    if (overlayEls) return overlayEls;
    injectStyleOnce();
    const body = el('div', { id: 'tf-modal-body' }, []);
    const closeBtn = el('button', { id: 'tf-modal-close', type: 'button' }, ['×']);
    const modal = el('div', { id: 'tf-modal' }, [closeBtn, body]);
    const overlay = el('div', { id: 'tf-overlay' }, [modal]);
    document.body.appendChild(overlay);
    overlayEls = { overlay, body, closeBtn };
    return overlayEls;
  }

  // Opens the floating giving-2FA modal. Resolves with the entered code
  // (string) once the caller can retry the gift request with it, or null if
  // the visitor closes the modal without finishing.
  function openGivingChallenge({ setupRequired, method }) {
    const { overlay, body, closeBtn } = ensureOverlay();
    return new Promise((resolve) => {
      let settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        overlay.classList.remove('show');
        closeBtn.onclick = null;
        resolve(result);
      }
      closeBtn.onclick = () => finish(null);

      if (setupRequired) {
        renderSetupUI(body, {
          onSuccess: (backupCodes, enrolledMethod) => {
            renderCodePromptUI(body, { method: enrolledMethod, onSuccess: (code) => finish(code) });
          },
        });
      } else {
        renderCodePromptUI(body, { method, onSuccess: (code) => finish(code) });
      }
      overlay.classList.add('show');
    });
  }

  // Posts a giving request (donation intent or subscription creation),
  // transparently handling the TWO_FACTOR_SETUP_REQUIRED / _CODE_REQUIRED
  // responses by running the challenge above and retrying once with the
  // resulting code. Any other failure (FOLLOW_REQUIRED, cap exceeded, a
  // genuine server error) is returned as-is for the caller to handle.
  async function postGiving(url, body) {
    async function attempt(extra) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, body, extra)),
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    }

    let result = await attempt();
    if (result.res.ok) return result;

    if (result.data.code === 'TWO_FACTOR_SETUP_REQUIRED' || result.data.code === 'TWO_FACTOR_CODE_REQUIRED') {
      const code = await openGivingChallenge({
        setupRequired: result.data.code === 'TWO_FACTOR_SETUP_REQUIRED',
        method: result.data.method,
      });
      if (!code) return result;
      result = await attempt({ twoFactorCode: code });
    }
    return result;
  }

  function confirmLiveGiving(amountCents, churchName) {
    const dollars = (amountCents / 100).toFixed(2);
    return confirm(`You're live right now. Send $${dollars} to ${churchName}?`);
  }

  // The giving modal's own overlay (ensureOverlay, above) already injects
  // this stylesheet, but mountSetup/mountVerify render straight into a panel
  // the caller already has in the page (public/mockup.html's #form-2fa-body)
  // with no overlay step of their own — inject here too so the sign-in 2FA
  // panel actually picks up the .tf-* styling instead of falling back to
  // unstyled native inputs/buttons.
  injectStyleOnce();

  window.TwoFactor = {
    mountSetup: (container, { onDone }) =>
      renderSetupUI(container, { onSuccess: (backupCodes, method) => onDone({ backupCodes, method }) }),
    mountVerify: (container, { onDone, method }) => renderVerifyUI(container, { onSuccess: onDone, method }),
    postGiving,
    confirmLiveGiving,
  };
})();
