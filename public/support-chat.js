// Floating AI customer-service chat widget. Shared across public/church.html
// and public/mockup.html (the dashboard) via a single <script src> include so
// both surfaces stay in sync automatically. General-FAQ only — see
// lib/supportChat.js for what it does and doesn't know.
(function () {
  const STYLE = `
    #gcw-launcher{
      position:fixed; right:22px; bottom:22px; z-index:9999;
      width:56px; height:56px; border-radius:50%;
      background:var(--gold,#e8b84b); border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:var(--shadow,0 20px 60px rgba(3,7,20,0.55));
      transition:transform .18s var(--ease,cubic-bezier(.16,.84,.44,1));
    }
    #gcw-launcher:hover{ transform:scale(1.06); }
    #gcw-launcher svg{ width:26px; height:26px; }
    #gcw-panel{
      position:fixed; right:22px; bottom:90px; z-index:9999;
      width:360px; max-width:calc(100vw - 32px);
      height:500px; max-height:calc(100vh - 130px);
      background:var(--panel,#122548); border:1px solid var(--border,rgba(232,184,75,0.16));
      border-radius:16px; box-shadow:var(--shadow,0 20px 60px rgba(3,7,20,0.55));
      display:none; flex-direction:column; overflow:hidden;
      font-family:'Inter',sans-serif;
    }
    #gcw-panel.open{ display:flex; }
    /* cookie-consent.js adds this class to <body> while its banner is
       showing — shift both up so the banner doesn't sit under the launcher. */
    body.cc-banner-open #gcw-launcher{ bottom:110px; }
    body.cc-banner-open #gcw-panel{ bottom:178px; }
    #gcw-head{
      padding:14px 16px; border-bottom:1px solid var(--border-soft,rgba(255,255,255,0.08));
      display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
    }
    #gcw-head h4{ font-family:'Fraunces',serif; font-size:16px; color:var(--text,#eef1f8); margin:0; font-weight:600; }
    #gcw-head span{ font-size:12px; color:var(--text-faint,#6b7593); display:block; margin-top:2px; }
    #gcw-close{ background:none; border:none; color:var(--text-dim,#a6b0cc); cursor:pointer; font-size:20px; line-height:1; padding:4px; }
    #gcw-close:hover{ color:var(--text,#eef1f8); }
    #gcw-messages{ flex:1; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
    .gcw-msg{ max-width:85%; padding:9px 12px; border-radius:12px; font-size:13.5px; line-height:1.45; white-space:pre-wrap; word-wrap:break-word; }
    .gcw-msg.user{ align-self:flex-end; background:var(--gold,#e8b84b); color:var(--bg-deep,#060c1f); border-bottom-right-radius:3px; }
    .gcw-msg.assistant{ align-self:flex-start; background:var(--bg-alt,#0f1e42); color:var(--text,#eef1f8); border-bottom-left-radius:3px; }
    .gcw-msg.typing{ align-self:flex-start; background:var(--bg-alt,#0f1e42); display:flex; gap:4px; padding:12px 14px; }
    .gcw-dot{ width:6px; height:6px; border-radius:50%; background:var(--text-faint,#6b7593); animation:gcw-bounce 1.2s infinite ease-in-out; }
    .gcw-dot:nth-child(2){ animation-delay:.15s; }
    .gcw-dot:nth-child(3){ animation-delay:.3s; }
    @keyframes gcw-bounce{ 0%,60%,100%{ transform:translateY(0); opacity:.5; } 30%{ transform:translateY(-4px); opacity:1; } }
    #gcw-form{ display:flex; gap:8px; padding:12px; border-top:1px solid var(--border-soft,rgba(255,255,255,0.08)); flex-shrink:0; }
    #gcw-input{
      flex:1; resize:none; border:1px solid var(--border-soft,rgba(255,255,255,0.08)); border-radius:10px;
      background:var(--bg-deep,#060c1f); color:var(--text,#eef1f8); font-family:inherit; font-size:13.5px;
      padding:9px 11px; max-height:80px;
    }
    #gcw-input:focus{ outline:1px solid var(--gold,#e8b84b); }
    #gcw-send{
      background:var(--gold,#e8b84b); color:var(--bg-deep,#060c1f); border:none; border-radius:10px;
      padding:0 16px; font-weight:600; font-size:13px; cursor:pointer; flex-shrink:0;
    }
    #gcw-send:disabled{ opacity:.5; cursor:default; }
    @media (max-width:480px){
      #gcw-panel{ right:16px; bottom:82px; width:calc(100vw - 32px); }
      #gcw-launcher{ right:16px; bottom:16px; }
    }
  `;

  const GREETING = "Hi! I'm Gospel Go Live's support assistant. Ask me about plans, giving, or how the platform works.";

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }

  function init() {
    document.head.appendChild(el('style', {}, [document.createTextNode(STYLE)]));

    const launcher = el('button', { id: 'gcw-launcher', 'aria-label': 'Open support chat', type: 'button' }, []);
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="#060c1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

    const panel = el('div', { id: 'gcw-panel' }, []);
    const head = el('div', { id: 'gcw-head' }, []);
    const headText = el('div', {}, []);
    headText.appendChild(el('h4', {}, [document.createTextNode('Gospel Go Live Support')]));
    headText.appendChild(el('span', {}, [document.createTextNode("We're an AI assistant, here to help")]));
    const closeBtn = el('button', { id: 'gcw-close', 'aria-label': 'Close support chat', type: 'button' }, [
      document.createTextNode('×'),
    ]);
    head.appendChild(headText);
    head.appendChild(closeBtn);

    const messagesEl = el('div', { id: 'gcw-messages' }, []);
    const form = el('form', { id: 'gcw-form' }, []);
    const input = el('textarea', { id: 'gcw-input', rows: '1', placeholder: 'Type a message…' }, []);
    const sendBtn = el('button', { id: 'gcw-send', type: 'submit' }, [document.createTextNode('Send')]);
    form.appendChild(input);
    form.appendChild(sendBtn);

    panel.appendChild(head);
    panel.appendChild(messagesEl);
    panel.appendChild(form);
    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    const history = [];
    let sending = false;

    function addBubble(role, text) {
      const bubble = el('div', { class: `gcw-msg ${role}` }, [document.createTextNode(text)]);
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    function addTyping() {
      const bubble = el('div', { class: 'gcw-msg typing' }, [
        el('div', { class: 'gcw-dot' }, []),
        el('div', { class: 'gcw-dot' }, []),
        el('div', { class: 'gcw-dot' }, []),
      ]);
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    }

    let opened = false;
    function open() {
      panel.classList.add('open');
      if (!opened) {
        opened = true;
        addBubble('assistant', GREETING);
      }
      input.focus();
    }
    function close() {
      panel.classList.remove('open');
    }

    launcher.addEventListener('click', () => {
      panel.classList.contains('open') ? close() : open();
    });
    closeBtn.addEventListener('click', close);

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || sending) return;

      addBubble('user', text);
      history.push({ role: 'user', content: text });
      input.value = '';
      input.style.height = 'auto';
      sending = true;
      sendBtn.disabled = true;
      const typingBubble = addTyping();

      try {
        const res = await fetch('/api/support/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
        });
        const data = await res.json();
        typingBubble.remove();
        const reply = res.ok ? data.reply : data.error || 'Something went wrong. Please try again.';
        addBubble('assistant', reply);
        if (res.ok) history.push({ role: 'assistant', content: reply });
      } catch (err) {
        typingBubble.remove();
        addBubble('assistant', "Sorry, that didn't go through. Please check your connection and try again.");
      } finally {
        sending = false;
        sendBtn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
