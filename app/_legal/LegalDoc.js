import Link from 'next/link';

// Shared shell for the legal pages (app/terms, app/privacy) — same dark
// navy/gold palette as app/page.js, but as a plain server component since
// none of this content needs client-side interactivity.
export default function LegalDoc({ title, effectiveDate, lastUpdated, children }) {
  return (
    <div className="legal-wrap">
      <div className="legal-container">
        <Link href="/" className="back-link">← Back to GospelGoLive.com</Link>

        <h1>{title}</h1>
        {effectiveDate && (
          <p className="doc-meta">
            <strong>Effective date:</strong> {effectiveDate} · <strong>Last updated:</strong> {lastUpdated}
          </p>
        )}

        <div className="legal-body">{children}</div>
      </div>

      <style>{`
        :root{
          --bg-deep: #060c1f; --panel: #0f1e42; --gold: #e8b84b; --gold-soft: #f5d787;
          --gold-dim: rgba(232,184,75,0.14); --teal: #3fa39b; --text: #eef1f8;
          --text-dim: #a6b0cc; --text-faint: #6b7593; --border-soft: rgba(255,255,255,0.1);
          --red: #e0796b;
        }
        *{box-sizing:border-box;}
        body{ margin:0; }
        .legal-wrap{ background:var(--bg-deep); color:var(--text); font-family:'Inter',sans-serif; min-height:100vh; -webkit-font-smoothing:antialiased; }
        .legal-container{ max-width:760px; margin:0 auto; padding:48px 24px 100px; }
        .back-link{ display:inline-block; color:var(--text-faint); text-decoration:none; font-size:13.5px; margin-bottom:28px; }
        .back-link:hover{ color:var(--gold-soft); }
        h1{ font-family:'Fraunces',serif; font-weight:600; font-size:clamp(28px,4.4vw,42px); color:#fff; letter-spacing:-0.01em; margin:0 0 10px; }
        .doc-meta{ color:var(--text-faint); font-size:13.5px; margin:0 0 40px; }
        .legal-body h2{ font-family:'Fraunces',serif; font-weight:600; font-size:22px; color:var(--gold-soft); margin:44px 0 14px; padding-top:14px; border-top:1px solid var(--border-soft); }
        .legal-body h2:first-child{ margin-top:0; padding-top:0; border-top:none; }
        .legal-body h3{ font-family:'Fraunces',serif; font-weight:600; font-size:17px; color:#fff; margin:26px 0 10px; }
        .legal-body p{ color:var(--text-dim); font-size:15px; line-height:1.75; margin:0 0 16px; }
        .legal-body ul{ margin:0 0 16px; padding-left:22px; }
        .legal-body li{ color:var(--text-dim); font-size:15px; line-height:1.75; margin-bottom:8px; }
        .legal-body a{ color:var(--gold-soft); }
        .legal-body strong{ color:var(--text); }
        .legal-body .callout{ background:var(--panel); border:1px solid var(--border-soft); border-radius:12px; padding:18px 20px; margin:0 0 16px; }
        .legal-body table{ width:100%; border-collapse:collapse; margin:0 0 20px; font-size:14px; }
        .legal-body th, .legal-body td{ border:1px solid var(--border-soft); padding:10px 12px; text-align:left; color:var(--text-dim); }
        .legal-body th{ color:#fff; background:var(--panel); font-weight:600; }
        .legal-body td:first-child, .legal-body th:first-child{ color:var(--text); }
      `}</style>
    </div>
  );
}
