'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const GREETING = "Hi! I'm Gospel Go Live's support assistant. Ask me about plans, giving, or how the platform works.";

export default function ContactChat() {
  const [history, setHistory] = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [history, sending]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const nextHistory = [...history, { role: 'user', content: text }];
    setHistory(nextHistory);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHistory }),
      });
      const data = await res.json();
      const reply = res.ok ? data.reply : data.error || 'Something went wrong. Please try again.';
      setHistory((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, that didn't go through. Please check your connection and try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="contact-wrap">
      <div className="contact-container">
        <Link href="/" className="back-link">← Back to GospelGoLive.com</Link>

        <h1>Contact Us</h1>
        <p className="contact-sub">
          Chat with our support assistant below, or email us directly at{' '}
          <a href="mailto:support@gospelgolive.com">support@gospelgolive.com</a>. You can also check
          our <Link href="/faq">FAQ</Link> for quick answers.
        </p>

        <div className="chat-panel">
          <div className="chat-messages">
            {history.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {sending && (
              <div className="chat-msg assistant typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-form" onSubmit={handleSubmit}>
            <textarea
              rows={1}
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <button type="submit" disabled={sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      </div>

      <style>{`
        :root{
          --bg-deep: #060c1f; --panel: #0f1e42; --bg-alt: #0f1e42; --gold: #e8b84b; --gold-soft: #f5d787;
          --text: #eef1f8; --text-dim: #a6b0cc; --text-faint: #6b7593; --border-soft: rgba(255,255,255,0.1);
        }
        *{box-sizing:border-box;}
        body{ margin:0; }
        .contact-wrap{ background:var(--bg-deep); color:var(--text); font-family:'Inter',sans-serif; min-height:100vh; -webkit-font-smoothing:antialiased; }
        .contact-container{ max-width:760px; margin:0 auto; padding:48px 24px 60px; display:flex; flex-direction:column; }
        .back-link{ display:inline-block; color:var(--text-faint); text-decoration:none; font-size:13.5px; margin-bottom:28px; }
        .back-link:hover{ color:var(--gold-soft); }
        h1{ font-family:'Fraunces',serif; font-weight:600; font-size:clamp(28px,4.4vw,42px); color:#fff; letter-spacing:-0.01em; margin:0 0 10px; }
        .contact-sub{ color:var(--text-dim); font-size:15px; line-height:1.75; margin:0 0 32px; }
        .contact-sub a{ color:var(--gold-soft); }
        .chat-panel{
          background:var(--panel); border:1px solid var(--border-soft); border-radius:16px;
          display:flex; flex-direction:column; height:min(600px, 70vh); overflow:hidden;
        }
        .chat-messages{ flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px; }
        .chat-msg{ max-width:80%; padding:10px 14px; border-radius:14px; font-size:14.5px; line-height:1.5; white-space:pre-wrap; word-wrap:break-word; }
        .chat-msg.user{ align-self:flex-end; background:var(--gold,#e8b84b); color:#060c1f; border-bottom-right-radius:3px; }
        .chat-msg.assistant{ align-self:flex-start; background:#132a56; color:var(--text); border-bottom-left-radius:3px; }
        .chat-msg.typing{ display:flex; gap:4px; padding:14px; }
        .dot{ width:6px; height:6px; border-radius:50%; background:var(--text-faint); animation:bounce 1.2s infinite ease-in-out; }
        .dot:nth-child(2){ animation-delay:.15s; }
        .dot:nth-child(3){ animation-delay:.3s; }
        @keyframes bounce{ 0%,60%,100%{ transform:translateY(0); opacity:.5; } 30%{ transform:translateY(-4px); opacity:1; } }
        .chat-form{ display:flex; gap:10px; padding:14px; border-top:1px solid var(--border-soft); flex-shrink:0; }
        .chat-form textarea{
          flex:1; resize:none; border:1px solid var(--border-soft); border-radius:10px;
          background:var(--bg-deep); color:var(--text); font-family:inherit; font-size:14.5px;
          padding:10px 12px; max-height:100px;
        }
        .chat-form textarea:focus{ outline:1px solid var(--gold); }
        .chat-form button{
          background:var(--gold); color:#060c1f; border:none; border-radius:10px;
          padding:0 20px; font-weight:600; font-size:14px; cursor:pointer; flex-shrink:0;
        }
        .chat-form button:disabled{ opacity:.5; cursor:default; }
      `}</style>
    </div>
  );
}
