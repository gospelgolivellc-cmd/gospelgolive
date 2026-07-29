// Shared cookie-consent banner — same pattern as two-factor.js and
// support-chat.js (a single IIFE, no framework, injected into every static
// surface: public/mockup.html, public/church.html, app/layout.js). Consent
// is stored in localStorage rather than a cookie itself, since the banner's
// whole job is deciding whether it's okay to set OTHER cookies/local
// storage first — gating that decision behind the very thing it controls
// would be circular.
//
// The only thing actually gated on consent right now is PostHog analytics
// (see posthog-init.js, which checks localStorage itself and exposes
// window.startPostHogIfConsented for this file to call directly on Accept
// without a page reload). The session cookie, OAuth state cookie, and
// Stripe's own fraud-prevention cookies are all strictly necessary for the
// site to function and are never gated — only non-essential analytics are.
(function () {
  const STORAGE_KEY = 'ggl_cookie_consent'; // 'accepted' | 'declined'

  function injectStyleOnce() {
    if (document.getElementById('cookie-consent-style')) return;
    const style = document.createElement('style');
    style.id = 'cookie-consent-style';
    style.textContent = `
      .cc-banner{
        position:fixed; left:0; right:0; bottom:0; z-index:900;
        background:var(--panel,#0f1e42); border-top:1px solid var(--border-soft,rgba(255,255,255,0.1));
        padding:18px 24px; display:flex; align-items:center; justify-content:center; gap:24px; flex-wrap:wrap;
        box-shadow:0 -8px 24px rgba(0,0,0,0.28); font-family:'Inter',sans-serif;
      }
      .cc-banner p{
        margin:0; color:var(--text-dim,#a6b0cc); font-size:13.5px; line-height:1.5; max-width:640px; flex:1 1 320px;
      }
      .cc-banner p a{ color:var(--gold-soft,#f5d787); text-decoration:underline; }
      .cc-actions{ display:flex; gap:10px; flex-shrink:0; }
      .cc-btn{
        padding:10px 20px; border-radius:999px; font-size:13.5px; font-weight:600; cursor:pointer;
        border:1px solid transparent; transition:transform .15s, box-shadow .15s; white-space:nowrap;
      }
      .cc-btn-accept{
        background:linear-gradient(180deg,var(--gold-soft,#f5d787),var(--gold,#e8b84b)); color:#20160a;
        box-shadow:0 6px 16px rgba(232,184,75,0.25);
      }
      .cc-btn-accept:hover{ transform:translateY(-1px); box-shadow:0 8px 20px rgba(232,184,75,0.35); }
      .cc-btn-decline{
        background:transparent; border-color:var(--border-soft,rgba(255,255,255,0.18)); color:var(--text,#eef1f8);
      }
      .cc-btn-decline:hover{ border-color:var(--gold,#e8b84b); }
      @media (max-width:600px){
        .cc-banner{ padding:16px; justify-content:flex-start; }
        .cc-actions{ width:100%; }
        .cc-btn{ flex:1; }
      }
    `;
    document.head.appendChild(style);
  }

  function getConsent() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function setConsent(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* localStorage unavailable (private browsing, etc.) — banner will just re-show next visit */
    }
  }

  function showBanner() {
    injectStyleOnce();
    const banner = document.createElement('div');
    banner.className = 'cc-banner';
    banner.id = 'cookie-consent-banner';
    banner.innerHTML = `
      <p>We use cookies to keep you signed in and to understand how GospelGoLive is used, so we can make it better. See our <a href="/cookie-policy" target="_blank" rel="noopener">Cookie Policy</a> for details.</p>
      <div class="cc-actions">
        <button type="button" class="cc-btn cc-btn-decline" id="cc-decline">Decline</button>
        <button type="button" class="cc-btn cc-btn-accept" id="cc-accept">Accept All</button>
      </div>
    `;
    document.body.appendChild(banner);
    // Lets support-chat.js's launcher/panel shift up out of the way while
    // the banner is on screen (see support-chat.js's own STYLE block).
    document.body.classList.add('cc-banner-open');

    function dismiss() {
      banner.remove();
      document.body.classList.remove('cc-banner-open');
    }

    document.getElementById('cc-accept').addEventListener('click', () => {
      setConsent('accepted');
      dismiss();
      if (typeof window.startPostHogIfConsented === 'function') window.startPostHogIfConsented();
    });
    document.getElementById('cc-decline').addEventListener('click', () => {
      setConsent('declined');
      dismiss();
    });
  }

  function init() {
    if (getConsent()) return; // already decided, nothing to show
    if (document.body) showBanner();
    else document.addEventListener('DOMContentLoaded', showBanner, { once: true });
  }

  init();
})();
