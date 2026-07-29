// Creates (once) a "Free Plan Pastors" Resend Audience and syncs it to
// exactly the pastors currently on the 'starter' plan with a verified
// email — adds newly-eligible pastors, removes ones who've since upgraded
// or been deactivated. Safe to re-run any time (e.g. right before sending
// the campaign) to pick up new signups.
//
// Requires a Full Access RESEND_API_KEY (already set in .env.local). Run:
//   node scripts/sync-upgrade-audience.js
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');

const ENV_FILE = path.join(__dirname, '..', '.env.local');

function loadEnvLocal() {
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

function persistAudienceId(id) {
  const contents = fs.readFileSync(ENV_FILE, 'utf8');
  if (/^RESEND_UPGRADE_AUDIENCE_ID=/m.test(contents)) {
    fs.writeFileSync(ENV_FILE, contents.replace(/^RESEND_UPGRADE_AUDIENCE_ID=.*$/m, `RESEND_UPGRADE_AUDIENCE_ID=${id}`));
  } else {
    fs.writeFileSync(
      ENV_FILE,
      contents.trimEnd() +
        `\n\n# "Free Plan Pastors" audience — resend.com/audiences. Synced by scripts/sync-upgrade-audience.js.\nRESEND_UPGRADE_AUDIENCE_ID=${id}\n`
    );
  }
}

async function main() {
  const env = loadEnvLocal();
  const API_KEY = env.RESEND_API_KEY;
  if (!API_KEY) throw new Error('RESEND_API_KEY missing from .env.local');

  let audienceId = env.RESEND_UPGRADE_AUDIENCE_ID;
  if (!audienceId) {
    const res = await fetch('https://api.resend.com/audiences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Free Plan Pastors' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Failed to create audience: ${JSON.stringify(data)}`);
    audienceId = data.id;
    persistAudienceId(audienceId);
    console.log(`Created audience "Free Plan Pastors" — id ${audienceId}`);
  }

  const prisma = new PrismaClient();
  const churches = await prisma.church.findMany({
    where: { plan: 'starter' },
    select: { owner: { select: { id: true, email: true, emailVerified: true, deactivatedAt: true } } },
  });
  const eligible = churches
    .map((c) => c.owner)
    .filter((o) => o.emailVerified && !o.deactivatedAt);
  await prisma.$disconnect();

  console.log(`${eligible.length} eligible free-plan pastor(s) out of ${churches.length} total.`);

  const existingRes = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const existing = (await existingRes.json()).data || [];
  const existingEmails = new Set(existing.map((c) => c.email));
  const eligibleEmails = new Set(eligible.map((o) => o.email));

  for (const owner of eligible) {
    if (existingEmails.has(owner.email)) continue;
    const res = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audienceId, email: owner.email, unsubscribed: false }),
    });
    if (res.ok) console.log(`Added ${owner.email}`);
    else console.error(`Failed to add ${owner.email}:`, await res.json());
  }

  for (const contact of existing) {
    if (eligibleEmails.has(contact.email)) continue;
    const res = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts/${contact.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (res.ok) console.log(`Removed ${contact.email} (no longer on Free plan)`);
    else console.error(`Failed to remove ${contact.email}:`, await res.json());
  }

  console.log('Sync complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
