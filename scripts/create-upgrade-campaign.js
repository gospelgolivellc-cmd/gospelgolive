// Creates (or updates, on re-run) the Free-plan-pastor upgrade pitch as a
// DRAFT Resend Broadcast tied to the "Free Plan Pastors" audience — run
// scripts/sync-upgrade-audience.js first (and any time before sending, to
// pick up newly-eligible pastors). Nothing sends automatically; review and
// send from the Resend dashboard's Broadcasts tab whenever you're ready.
//
// Edit copy in scripts/campaigns/upgrade-pitch.js, then re-run this script —
// it looks up broadcast-ids.json to PATCH the existing draft instead of
// creating a duplicate.
//
// Requires a Full Access RESEND_API_KEY (already set in .env.local). Run:
//   node scripts/create-upgrade-campaign.js
const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

const env = loadEnvLocal();
const API_KEY = env.RESEND_API_KEY;
const AUDIENCE_ID = env.RESEND_UPGRADE_AUDIENCE_ID;
const FROM = env.RESEND_FROM_EMAIL || 'GospelGoLive <hello@gospelgolive.com>';

if (!API_KEY) throw new Error('RESEND_API_KEY missing from .env.local');
if (!AUDIENCE_ID) {
  throw new Error('RESEND_UPGRADE_AUDIENCE_ID missing from .env.local — run scripts/sync-upgrade-audience.js first.');
}

const campaign = require('./campaigns/upgrade-pitch');

const IDS_FILE = path.join(__dirname, 'campaigns', 'broadcast-ids.json');
const ids = fs.existsSync(IDS_FILE) ? JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')) : {};

// Same dark navy / gold brand shell as the other campaign scripts.
function wrapEmail({ subject, bodyHtml }) {
  return `
    <div style="background:#060c1f; padding:40px 20px; font-family:Georgia,'Times New Roman',serif;">
      <div style="max-width:480px; margin:0 auto; background:#0a1024; border:1px solid rgba(232,184,75,0.18); border-radius:16px; padding:40px 32px;">
        <div style="font-size:20px; font-weight:700; color:#eef1f8; margin-bottom:24px; text-align:center;">
          Gospel<span style="color:#f5d787;">Go</span>Live<span style="color:#6b7593; font-weight:500;">.com</span>
        </div>
        <div style="font-family:'Courier New',monospace; font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:#e8b84b; margin-bottom:14px; text-align:center;">
          Upgrade your plan
        </div>
        <h1 style="font-size:21px; line-height:1.35; color:#fff; margin:0 0 20px; font-weight:600; text-align:center;">${subject}</h1>
        <div style="color:#c7cfe3; font-size:15px; line-height:1.65;">
          ${bodyHtml}
        </div>
        <div style="text-align:center; margin-top:28px;">
          <a href="${env.NEXT_PUBLIC_APP_URL || 'https://gospelgolive.com'}/mockup.html" style="display:inline-block; background:linear-gradient(180deg,#f5d787,#e8b84b); color:#20160a; font-weight:700; font-size:14px; padding:13px 28px; border-radius:999px; text-decoration:none;">Upgrade your plan</a>
        </div>
        <p style="color:#6b7593; font-size:12px; margin-top:36px; text-align:center;">
          You're getting this because your church is on GospelGoLive's Free plan.
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#6b7593;">Unsubscribe</a>
        </p>
      </div>
    </div>
  `;
}

async function main() {
  const html = wrapEmail(campaign);
  const existingId = ids.upgrade_pitch;

  const url = existingId ? `https://api.resend.com/broadcasts/${existingId}` : 'https://api.resend.com/broadcasts';
  const method = existingId ? 'PATCH' : 'POST';

  // Resend's PATCH replaces whichever fields you send — omitting `name`
  // resets it to "Untitled" rather than leaving it alone, so always send it.
  const body = {
    from: FROM,
    subject: campaign.subject,
    name: campaign.name,
    html,
    preview_text: campaign.previewText,
    ...(existingId ? {} : { audience_id: AUDIENCE_ID }),
  };

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Failed "${campaign.name}":`, data);
    return;
  }

  const id = existingId || data.id;
  ids.upgrade_pitch = id;
  fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2) + '\n');
  console.log(`${existingId ? 'Updated' : 'Created'} "${campaign.name}" — https://resend.com/broadcasts/${id}`);
}

main();
