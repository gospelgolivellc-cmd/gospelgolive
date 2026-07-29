'use client';

import { useEffect, useRef, useState } from 'react';

// Real launch target — also drives the countdown below.
const LAUNCH_DATE = new Date('2026-09-01T09:00:00-04:00').getTime();

function useCountdown() {
  const [time, setTime] = useState({ days: '00', hours: '00', mins: '00', secs: '00' });

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, LAUNCH_DATE - Date.now());
      const pad = (n) => String(n).padStart(2, '0');
      setTime({
        days: pad(Math.floor(diff / 86400000)),
        hours: pad(Math.floor((diff / 3600000) % 24)),
        mins: pad(Math.floor((diff / 60000) % 60)),
        secs: pad(Math.floor((diff / 1000) % 60)),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

export default function HomePage() {
  const countdown = useCountdown();
  const videoRef = useRef(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tryPlay = () => video.play().catch(() => {});
    tryPlay();
    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('touchstart', tryPlay, { once: true });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setStatus('done');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong — please try again');
    }
  }

  return (
    <div className="wrap">
      <div className="bg">
        <video ref={videoRef} muted loop playsInline autoPlay>
          <source src="/coming-soon-bg.mp4" type="video/mp4" />
        </video>
      </div>

      <nav>
        <div className="brand">
          <span className="dot" />
          Gospel<span className="go">Go</span>Live<span className="dim">.com</span>
        </div>
      </nav>

      <main>
        <div className="eyebrow">Something&apos;s Coming</div>
        <h1>
          Church, streaming live, <em>everywhere.</em>
        </h1>
        <p className="sub">
          We&apos;re building a new home for live worship, sermons on demand, and giving — for
          pastors and the people who follow them. GospelGoLive is almost ready to launch.
        </p>

        <div className="countdown">
          <div className="count-box">
            <div className="n">{countdown.days}</div>
            <div className="l">Days</div>
          </div>
          <div className="count-box">
            <div className="n">{countdown.hours}</div>
            <div className="l">Hours</div>
          </div>
          <div className="count-box">
            <div className="n">{countdown.mins}</div>
            <div className="l">Minutes</div>
          </div>
          <div className="count-box">
            <div className="n">{countdown.secs}</div>
            <div className="l">Seconds</div>
          </div>
        </div>

        <form className="notify" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Enter your email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'loading' || status === 'done'}
          />
          <button type="submit" disabled={status === 'loading' || status === 'done'}>
            {status === 'loading' ? 'Adding…' : status === 'done' ? 'Added ✓' : 'Notify Me'}
          </button>
        </form>
        {status === 'done' && (
          <div className="notify-msg show">
            You&apos;re on the list — we&apos;ll let you know the moment we go live.
          </div>
        )}
        {status === 'error' && <div className="notify-msg show error">{errorMsg}</div>}

        <div className="progress-line">
          <div className="progress-track">
            <div className="progress-fill" />
          </div>
          <div className="progress-label">
            <span>Building the platform</span>
            <span>In progress</span>
          </div>
        </div>
      </main>

      <footer>
        <div>© 2026 GospelGoLive.com — All rights reserved.</div>
      </footer>

      <style>{`
        :root{
          --bg-deep: #060c1f; --gold: #e8b84b; --gold-soft: #f5d787; --gold-dim: rgba(232,184,75,0.14);
          --teal: #3fa39b; --text: #eef1f8; --text-dim: #a6b0cc; --text-faint: #6b7593;
          --border: rgba(232,184,75,0.18); --border-soft: rgba(255,255,255,0.1);
          --ease: cubic-bezier(.16,.84,.44,1);
        }
        *{box-sizing:border-box;}
        body{ background:var(--bg-deep); color:var(--text); font-family:'Inter',sans-serif; -webkit-font-smoothing:antialiased; overflow-x:hidden; margin:0; }
        .wrap{ position:relative; min-height:100vh; display:flex; flex-direction:column; }
        .bg{ position:absolute; inset:0; z-index:0; background:#0a1024; }
        .bg video{ width:100%; height:100%; object-fit:cover; object-position:center 30%; filter:saturate(1.1) brightness(0.85); }
        .bg::after{
          content:''; position:absolute; inset:0;
          background:
            radial-gradient(circle at 50% 30%, rgba(6,12,31,0.2), rgba(6,12,31,0.78) 78%),
            linear-gradient(180deg, rgba(6,12,31,0.25) 0%, rgba(6,12,31,0.55) 55%, rgba(6,12,31,0.92) 100%);
        }
        nav{ position:relative; z-index:2; display:flex; justify-content:center; padding:34px 24px 0; }
        .brand{ display:flex; align-items:center; gap:10px; font-family:'Fraunces',serif; font-size:20px; font-weight:700; letter-spacing:-0.01em; }
        .brand .dot{ width:8px; height:8px; border-radius:50%; background:var(--gold); animation:pulse 1.6s infinite; }
        @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(232,184,75,.5);} 70%{box-shadow:0 0 0 9px rgba(232,184,75,0);} 100%{box-shadow:0 0 0 0 rgba(232,184,75,0);}}
        .brand .go{ color:var(--gold-soft); }
        .brand .dim{ color:var(--text-faint); font-weight:500; }
        main{ position:relative; z-index:2; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 24px; }
        .eyebrow{
          font-family:'IBM Plex Mono',monospace; font-size:12.5px; letter-spacing:.16em; text-transform:uppercase;
          color:var(--gold); display:flex; align-items:center; gap:10px; font-weight:500; margin-bottom:22px;
        }
        .eyebrow::before, .eyebrow::after{ content:''; width:22px; height:1px; background:var(--gold); }
        h1{ font-family:'Fraunces',serif; font-weight:600; font-size:clamp(38px, 6.4vw, 74px); line-height:1.05; color:#fff; letter-spacing:-0.02em; max-width:820px; margin:0; }
        h1 em{ font-style:italic; color:var(--gold-soft); font-weight:500; }
        p.sub{ color:var(--text-dim); font-size:17px; max-width:520px; margin:22px 0 42px; line-height:1.6; }
        .countdown{ display:flex; gap:14px; margin-bottom:44px; flex-wrap:wrap; justify-content:center; }
        .count-box{ background:rgba(255,255,255,0.04); border:1px solid var(--border-soft); border-radius:14px; padding:16px 20px; min-width:82px; backdrop-filter:blur(10px); }
        .count-box .n{ font-family:'Fraunces',serif; font-size:32px; color:var(--gold-soft); font-weight:600; }
        .count-box .l{ font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.08em; margin-top:4px; }
        .notify{ display:flex; gap:10px; width:100%; max-width:440px; flex-wrap:wrap; justify-content:center; }
        .notify input{ flex:1; min-width:220px; background:rgba(255,255,255,0.05); border:1px solid var(--border-soft); border-radius:999px; padding:14px 20px; color:var(--text); font-size:14.5px; outline:none; transition:.2s; }
        .notify input:focus{ border-color:var(--gold); }
        .notify input::placeholder{ color:var(--text-faint); }
        .notify button{
          padding:14px 26px; border-radius:999px; border:none; font-weight:700; font-size:14.5px;
          background:linear-gradient(180deg,var(--gold-soft),var(--gold)); color:#20160a; transition:.25s var(--ease);
          box-shadow:0 8px 22px rgba(232,184,75,0.22); white-space:nowrap; cursor:pointer;
        }
        .notify button:hover{ transform:translateY(-2px); box-shadow:0 12px 28px rgba(232,184,75,0.32); }
        .notify button:disabled{ opacity:.7; cursor:default; transform:none; }
        .notify-msg{ margin-top:16px; font-size:13.5px; color:var(--teal); }
        .notify-msg.error{ color:#e0796b; }
        .progress-line{ width:100%; max-width:440px; margin-top:52px; }
        .progress-track{ height:6px; border-radius:999px; background:rgba(255,255,255,0.08); overflow:hidden; }
        .progress-fill{ height:100%; width:38%; background:linear-gradient(90deg,var(--teal),var(--gold-soft)); border-radius:999px; }
        .progress-label{ display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-faint); margin-top:10px; letter-spacing:.03em; }
        footer{ position:relative; z-index:2; text-align:center; padding:26px 24px 34px; color:var(--text-faint); font-size:12.5px; }
        @media(max-width:480px){ .count-box{ min-width:68px; padding:12px 14px; } .count-box .n{ font-size:24px; } }
      `}</style>
    </div>
  );
}
