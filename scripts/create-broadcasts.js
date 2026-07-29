// One-off setup script — creates the pre-launch drip campaigns as DRAFT
// Resend Broadcasts against the waitlist Audience. It does NOT send them;
// review/schedule/send each one from the Resend dashboard (or trigger via
// the Broadcasts API) whenever you're ready.
//
// Requires a Resend API key with "Full access" (the sending-only key in
// .env.local can't create audiences/contacts/broadcasts). Run with:
//   node scripts/create-broadcasts.js
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

const env = loadEnvLocal();
const API_KEY = env.RESEND_API_KEY;
const AUDIENCE_ID = env.RESEND_AUDIENCE_ID;
const FROM = env.RESEND_FROM_EMAIL || 'GospelGoLive <hello@gospelgolive.com>';

if (!API_KEY) throw new Error('RESEND_API_KEY missing from .env.local');
if (!AUDIENCE_ID) {
  throw new Error(
    'RESEND_AUDIENCE_ID missing from .env.local — create the Audience first (see lib/waitlist.js comments) and set its id.'
  );
}

function wrapEmail({ eyebrow, heading, body, cta }) {
  return `
    <div style="background:#060c1f; padding:40px 20px; font-family:Georgia,'Times New Roman',serif;">
      <div style="max-width:480px; margin:0 auto; background:#0a1024; border:1px solid rgba(232,184,75,0.18); border-radius:16px; padding:40px 32px; text-align:center;">
        <div style="font-size:20px; font-weight:700; color:#eef1f8; margin-bottom:28px;">
          Gospel<span style="color:#f5d787;">Go</span>Live<span style="color:#6b7593; font-weight:500;">.com</span>
        </div>
        <div style="font-family:'Courier New',monospace; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:#e8b84b; margin-bottom:18px;">
          ${eyebrow}
        </div>
        <h1 style="font-size:24px; line-height:1.3; color:#fff; margin:0 0 16px; font-weight:600;">${heading}</h1>
        <p style="color:#a6b0cc; font-size:15px; line-height:1.6; margin:0 0 28px;">${body}</p>
        ${
          cta
            ? `<a href="${cta.url}" style="display:inline-block; padding:14px 28px; border-radius:999px; background:linear-gradient(180deg,#f5d787,#e8b84b); color:#20160a; font-weight:700; font-size:14.5px; text-decoration:none;">${cta.label}</a>`
            : ''
        }
        <p style="color:#6b7593; font-size:12px; margin-top:32px;">
          You're getting this because you joined the GospelGoLive waitlist.
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#6b7593;">Unsubscribe</a>
        </p>
      </div>
    </div>
  `;
}

const campaigns = [
  {
    name: 'Waitlist — Progress update',
    subject: "We're getting closer 👀",
    html: wrapEmail({
      eyebrow: 'Progress update',
      heading: 'Still building — here’s where things stand.',
      body: "Since you signed up, we've been heads-down on live streaming, sermon libraries, and giving — the core of what GospelGoLive is built for. We'll have an exact launch date for you soon. Thanks for your patience, and for being one of the first to hear about this.",
      cta: null,
    }),
  },
  {
    name: 'Waitlist — Launch day',
    subject: "We're live! 🎉 GospelGoLive is open",
    html: wrapEmail({
      eyebrow: "It's here",
      heading: 'GospelGoLive is officially live.',
      body: 'The wait is over. Live worship, sermons on demand, and giving — all in one place, for pastors and the people who follow them. Come take a look.',
      cta: { url: 'https://gospelgolive.com', label: 'Visit GospelGoLive' },
    }),
  },
];

async function main() {
  for (const campaign of campaigns) {
    const res = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audience_id: AUDIENCE_ID,
        from: FROM,
        subject: campaign.subject,
        name: campaign.name,
        html: campaign.html,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`Failed to create "${campaign.name}":`, data);
      continue;
    }
    console.log(`Created draft "${campaign.name}" — id ${data.id}. Review/send at https://resend.com/broadcasts/${data.id}`);
  }
}

main();
