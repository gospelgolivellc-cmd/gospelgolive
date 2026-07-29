import { resend } from '@/lib/resend';
import { unsubscribeUrl } from '@/lib/emailPreferences';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// Per-department From addresses — gospelgolive.com is fully verified in
// Resend, so any local-part sends without further setup. Matches the
// account/pastor/seeker/trust email catalog's own From lines exactly.
const FROM_HELLO = 'GospelGoLive <hello@gospelgolive.com>';
const FROM_SECURITY = 'GospelGoLive Security <security@gospelgolive.com>';
const FROM_BILLING = 'GospelGoLive Billing <billing@gospelgolive.com>';
const FROM_TRUST = 'GospelGoLive Trust & Safety <trust@gospelgolive.com>';
const FROM_GIVING = 'GospelGoLive Giving <giving@gospelgolive.com>';

export function firstNameOf(fullName) {
  return (fullName || '').trim().split(/\s+/)[0] || 'there';
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Shared dark navy / gold brand shell used by every transactional email in
// this file. `bodyHtml` is trusted markup (callers are responsible for
// escapeHtml-ing any user-generated text before interpolating it in) so it
// can include paragraphs, bullet lists, bold text, etc. — not just a single
// line like the plain notification emails below use.
function renderEmailHtml({ eyebrow, heading, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  return `
    <div style="background:#060c1f; padding:40px 20px; font-family:Georgia,'Times New Roman',serif;">
      <div style="max-width:480px; margin:0 auto; background:#0a1024; border:1px solid rgba(232,184,75,0.18); border-radius:16px; padding:40px 32px; text-align:center;">
        <div style="font-size:20px; font-weight:700; color:#eef1f8; margin-bottom:28px; font-family:Georgia,serif;">
          Gospel<span style="color:#f5d787;">Go</span>Live<span style="color:#6b7593; font-weight:500;">.com</span>
        </div>
        <div style="font-family:'Courier New',monospace; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:#e8b84b; margin-bottom:18px;">${eyebrow}</div>
        <h1 style="font-size:24px; line-height:1.3; color:#fff; margin:0 0 16px; font-weight:600;">${heading}</h1>
        <div style="color:#a6b0cc; font-size:15px; line-height:1.6; margin:0 0 28px; text-align:left;">${bodyHtml}</div>
        ${
          ctaLabel && ctaUrl
            ? `<a href="${ctaUrl}" style="display:inline-block; background:linear-gradient(180deg,#f5d787,#e8b84b); color:#20160a; font-weight:700; font-size:14px; padding:13px 28px; border-radius:999px; text-decoration:none;">${ctaLabel}</a>`
            : ''
        }
        ${footerNote ? `<p style="color:#6b7593; font-size:12.5px; margin-top:32px;">${footerNote}</p>` : ''}
      </div>
    </div>
  `;
}

async function sendBrandedEmail({ to, from, subject, ...content }) {
  const html = renderEmailHtml(content);
  const result = await resend.emails.send({ from, to, subject, html });
  if (result.error) {
    throw new Error(`Resend rejected "${subject}" to ${to}: ${result.error.message}`);
  }
}

// ================================================================
// Account & Auth
// ================================================================

export async function sendVerificationEmail(to, token, fullName = '') {
  const url = `${APP_URL}/api/auth/verify-email/confirm?token=${token}`;
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Confirm your email to get started',
    eyebrow: 'Verify your email',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}, confirm your email`,
    bodyHtml: `<p>Thanks for signing up for GospelGoLive. Click below to confirm your email address — this link expires in 60 minutes.</p><p>If you didn't create this account, you can safely ignore this email.</p>`,
    ctaLabel: 'Confirm my email',
    ctaUrl: url,
  });
}

// General fallback — the pastor/seeker-specific welcome emails below replace
// this wherever the signup role is known, per the spec's own note.
export async function sendWelcomeEmail(to, { fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Welcome to GospelGoLive',
    eyebrow: "You're in",
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}, you're in.`,
    bodyHtml: `<p>GospelGoLive is home to live worship, sermons on demand, and giving — all in one place. Take a look around, and if you ever have a question, just reply to this email.</p>`,
  });
}

export async function sendPasswordResetEmail(to, token, fullName = '') {
  const url = `${APP_URL}/reset-password.html?token=${token}`;
  await sendBrandedEmail({
    to,
    from: FROM_SECURITY,
    subject: 'Reset your GospelGoLive password',
    eyebrow: 'Password reset',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}, reset your password`,
    bodyHtml: `<p>We received a request to reset your password. This link expires in 60 minutes and can only be used once.</p><p>If you didn't request this, your password is still safe — no action needed. For your security, we'll never ask you to send us your password directly.</p>`,
    ctaLabel: 'Reset my password',
    ctaUrl: url,
  });
}

export async function sendPasswordChangedEmail(to, { fullName, date, time }) {
  await sendBrandedEmail({
    to,
    from: FROM_SECURITY,
    subject: 'Your password was just changed',
    eyebrow: 'Security alert',
    heading: 'Your password was changed',
    bodyHtml: `<p>This confirms your GospelGoLive password was changed on ${escapeHtml(date)} at ${escapeHtml(time)}.</p><p>If this wasn't you, contact us immediately at <a href="mailto:security@gospelgolive.com" style="color:#f5d787;">security@gospelgolive.com</a> — don't click any password-related links from other emails claiming to be us.</p>`,
    footerNote: `Hi ${escapeHtml(firstNameOf(fullName))}.`,
  });
}

export async function sendAccountDeactivatedEmail(to, { fullName, retentionPeriod = '30 days' }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Your account has been deactivated',
    eyebrow: 'Account deactivated',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}, you're deactivated`,
    bodyHtml: `<p>As requested, your GospelGoLive account has been deactivated. Your data will be retained for ${escapeHtml(retentionPeriod)} in case you'd like to return — after that, it's permanently deleted.</p><p>We're sorry to see you go, and you're always welcome back.</p>`,
    ctaLabel: 'Reactivate my account',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

// Not wired to a caller yet — there's no admin suspension flow built in this
// app. Call this from wherever that's eventually implemented.
export async function sendAccountSuspendedEmail(to, { fullName, reason, slaDays = 3 }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: 'Your GospelGoLive account has been suspended',
    eyebrow: 'Account suspended',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Your account has been suspended for the following reason: ${escapeHtml(reason)}.</p><p>If you believe this was a mistake, you can request a review and a member of our team will respond within ${slaDays} business days.</p>`,
    ctaLabel: 'Request a review',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

// ================================================================
// Pastor Lifecycle
// ================================================================

export async function sendPastorWelcomeEmail(to, { fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: "Welcome to GospelGoLive — let's set up your channel",
    eyebrow: 'Welcome, pastor',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}, your ministry has a home now`,
    bodyHtml: `<p>Next step: verify your identity so you can go live and start receiving gifts — it only takes a few minutes.</p>`,
    ctaLabel: 'Continue setup',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendIdentityVerifiedEmail(to, { fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: "You're verified — you can go live anytime",
    eyebrow: 'Verified',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}, you're verified`,
    bodyHtml: `<p>Your identity has been verified. You're clear to go live and start receiving gifts right away.</p><p>Want a higher giving limit and a trust badge on your profile? You can apply for Ministry Verification anytime from your dashboard.</p>`,
  });
}

// Not wired to a caller yet — Stripe Connect's own onboarding UI surfaces
// requirement errors directly today. Call this if/when a webhook-driven
// rejection flow is built.
export async function sendVerificationRejectedEmail(to, { fullName, reason }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: 'We need a bit more information to verify your account',
    eyebrow: 'Action needed',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>We weren't able to complete your verification with the information provided: ${escapeHtml(reason)}.</p><p>This is a routine part of keeping GospelGoLive safe for everyone giving through it — reply to this email anytime if you have questions.</p>`,
    ctaLabel: 'Update my information',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendSubscriptionReceiptEmail(to, { fullName, amountFormatted, planName, date, nextBillingDate }) {
  await sendBrandedEmail({
    to,
    from: FROM_BILLING,
    subject: `Your GospelGoLive receipt — ${planName}`,
    eyebrow: 'Receipt',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}, here's your receipt`,
    bodyHtml: `<p>This confirms your payment of ${escapeHtml(amountFormatted)} for your ${escapeHtml(planName)} plan, billed on ${escapeHtml(date)}. Your next payment is ${escapeHtml(nextBillingDate)}.</p>`,
    ctaLabel: 'View billing history',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendSubscriptionCancelledEmail(to, { fullName, planName, endDate }) {
  await sendBrandedEmail({
    to,
    from: FROM_BILLING,
    subject: 'Your GospelGoLive subscription has been cancelled',
    eyebrow: 'Subscription cancelled',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Your ${escapeHtml(planName)} subscription is cancelled and won't renew. You'll keep access through ${escapeHtml(endDate)}, after which your account moves to the Free plan — your channel and sermon library stay intact.</p><p>Changed your mind?</p>`,
    ctaLabel: 'Resubscribe',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

// Not wired to a cron job yet — no daily giving-digest aggregation job
// exists in this app. Call this from one if/when that's built.
export async function sendDonationDigestEmail(to, { fullName, count, totalFormatted, givingListHtml }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: `You received ${count} gifts today — ${totalFormatted}`,
    eyebrow: "Today's giving",
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Here's today's giving summary:</p>${givingListHtml}`,
    ctaLabel: 'View full giving history',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

// Not wired to a webhook handler yet — Stripe Connect `payout.paid` events
// require subscribing the platform's webhook endpoint to Connect events in
// the Stripe Dashboard first (Developers > Webhooks > your endpoint > "Listen
// to events on Connected accounts"). Once that's enabled, add a `payout.paid`
// case to app/api/webhooks/stripe/route.js that calls this.
export async function sendPayoutSentEmail(to, { fullName, amountFormatted, last4, date }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: `Your payout of ${amountFormatted} is on its way`,
    eyebrow: 'Payout sent',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>A payout of ${escapeHtml(amountFormatted)} was sent to your bank account ending in ${escapeHtml(last4)} on ${escapeHtml(date)}. It should arrive within 2–3 business days.</p>`,
  });
}

export async function sendDisputeFiledEmail(to, { fullName, giverNameOrAnonymous, amountFormatted, date, disputeUrl, deadline }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: 'A donor has disputed a gift — action may be needed',
    eyebrow: 'Dispute filed',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>${escapeHtml(giverNameOrAnonymous)} has disputed a gift of ${escapeHtml(amountFormatted)} made on ${escapeHtml(date)}. This is handled directly through Stripe, and we recommend responding by ${escapeHtml(deadline)}.</p>`,
    ctaLabel: 'View dispute details',
    ctaUrl: disputeUrl,
  });
}

// Not wired to a caller yet — no automated fraud-scoring/flagging exists in
// this app. Call this from wherever that's built.
export async function sendFraudReviewEmail(to, { fullName, reason, slaDays = 3 }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: "We're reviewing recent activity on your account",
    eyebrow: 'Under review',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>We noticed some unusual activity on your account (${escapeHtml(reason)}) and have temporarily paused payouts while we take a closer look — this is routine and most reviews resolve within ${slaDays} business days. Your channel and streams aren't affected.</p><p>Questions in the meantime? Reply to this email directly.</p>`,
  });
}

// ================================================================
// Seeker Lifecycle
// ================================================================

export async function sendSeekerWelcomeEmail(to, { fullName, recommendedChurchesHtml }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Welcome to GospelGoLive',
    eyebrow: "You're in",
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Based on what you're interested in, here are a few churches to start with:</p>${recommendedChurchesHtml}`,
    ctaLabel: 'Explore GospelGoLive',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendGiftReceiptEmail(to, { fullName, amountFormatted, churchName, date, taxDisclosureHtml }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: `Your gift to ${churchName} — receipt`,
    eyebrow: 'Gift receipt',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>This confirms your gift of ${escapeHtml(amountFormatted)} to ${escapeHtml(churchName)} on ${escapeHtml(date)}.</p><p style="font-size:13px; color:#6b7593;">${taxDisclosureHtml}</p>`,
    ctaLabel: 'View giving history',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendRecurringGiftFailedEmail(to, { fullName, amountFormatted, churchName }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: "We couldn't process your recurring gift",
    eyebrow: 'Payment failed',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Your recurring gift of ${escapeHtml(amountFormatted)} to ${escapeHtml(churchName)} didn't go through this month. Update your payment method to keep it going.</p>`,
    ctaLabel: 'Update payment method',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendRecurringGiftCancelledEmail(to, { fullName, amountFormatted, churchName }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: 'Your recurring gift has been cancelled',
    eyebrow: 'Recurring gift cancelled',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Your recurring gift of ${escapeHtml(amountFormatted)} to ${escapeHtml(churchName)} has been cancelled as requested. You can restart it anytime from your Give dashboard.</p>`,
  });
}

// ================================================================
// Trust, Safety & Legal
// ================================================================

// Not wired to a caller yet — no content-moderation/removal flow exists in
// this app. Call this from wherever that's built.
export async function sendContentRemovedEmail(to, { fullName, contentTitle, date, reason, slaDays = 3 }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: 'A piece of content has been removed from your channel',
    eyebrow: 'Content removed',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>${escapeHtml(contentTitle)} was removed from GospelGoLive on ${escapeHtml(date)} for the following reason: ${escapeHtml(reason)}.</p><p>If you believe this was a mistake, you can request a review and we'll respond within ${slaDays} business days.</p>`,
    ctaLabel: 'Appeal this decision',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

// Sent by lib/dmca.js's recordDmcaTakedown, immediately upon a valid DMCA
// notice (see the DMCA Copyright Policy doc, section 2.2 — "Notify the
// account holder... including a copy of the complaint"). Deliberately
// distinct from the generic sendContentRemovedEmail above: a DMCA
// counter-notice has real legal requirements (signature, a perjury
// statement, consent to jurisdiction) that a casual "appeal this decision"
// framing would undersell.
export async function sendDmcaTakedownEmail(to, { fullName, contentTitle, date, claimantName, copyrightedWorkDescription }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: 'A DMCA copyright notice was filed against your content',
    eyebrow: 'DMCA takedown notice',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `
      <p>"${escapeHtml(contentTitle)}" was removed from GospelGoLive on ${escapeHtml(date)} in response to a DMCA takedown notice.</p>
      <p><strong>Claimant:</strong> ${escapeHtml(claimantName)}</p>
      <p><strong>Copyrighted work claimed infringed:</strong> ${escapeHtml(copyrightedWorkDescription)}</p>
      <p>If you believe this was a mistake or misidentification, you may file a counter-notice with our designated copyright agent. A counter-notice is a formal legal document — see our DMCA Copyright Policy for exactly what it must contain. If we receive a valid one, we'll forward it to the claimant; unless they notify us they've filed a lawsuit, we'll restore the material within 10-14 business days.</p>
      <p>Repeated valid, uncontested DMCA notices against an account may result in suspension or termination, consistent with our repeat infringer policy.</p>
    `,
    ctaLabel: 'Read our DMCA Copyright Policy',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

// Sent by app/api/cron/dmca-restore once a counter-noticed notice clears its
// restoreEligibleAt window without the claimant filing suit (DMCA Copyright
// Policy, section 3).
export async function sendDmcaContentRestoredEmail(to, { fullName, contentTitle, date }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: 'Your content has been restored',
    eyebrow: 'Content restored',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>"${escapeHtml(contentTitle)}" has been restored to GospelGoLive as of ${escapeHtml(date)}. The claimant who filed the original DMCA notice did not notify us of a lawsuit within the required window after your counter-notice, so the material has been reinstated as required by the DMCA.</p>`,
  });
}

// Not wired anywhere — intended for a one-off broadcast (like
// scripts/create-broadcasts.js) whenever the ToS/Privacy Policy actually
// changes, not an automatic per-signup trigger.
export async function sendTermsUpdatedEmail(to, { fullName, effectiveDate, summary }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: "We've updated our Terms of Service",
    eyebrow: 'Terms updated',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>We've made changes to our Terms of Service, effective ${escapeHtml(effectiveDate)}. Here's a summary of what changed: ${escapeHtml(summary)}.</p><p>Continuing to use GospelGoLive after ${escapeHtml(effectiveDate)} means you agree to the updated terms.</p>`,
    ctaLabel: 'Read the full updated terms',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

// ================================================================
// Subscription payment retry / access-lock dunning sequence
// (see app/api/webhooks/stripe/route.js and app/api/cron/subscription-retries)
// ================================================================

const DUNNING_COPY = {
  1: {
    subject: "We couldn't process your GospelGoLive payment",
    heading: 'Payment unsuccessful',
    bodyHtml: (amountFormatted, planName) =>
      `<p>Your payment of ${escapeHtml(amountFormatted)} for your ${escapeHtml(planName)} plan didn't go through. No need to do anything right now — we'll automatically try again in 3 days, and once more after that if needed.</p><p>Your account and live streaming are unaffected for now.</p>`,
  },
  2: {
    subject: 'Second attempt unsuccessful — one more try before access pauses',
    heading: 'Second attempt unsuccessful',
    bodyHtml: (amountFormatted) =>
      `<p>We tried again to process your payment of ${escapeHtml(amountFormatted)} and it still didn't go through. We'll make one final attempt in 4 days (day 7). If that doesn't succeed, your ability to go live, upload, and view analytics will pause until it's resolved.</p><p>Your giving and offerings will keep working normally throughout — this only affects platform features tied to your subscription.</p>`,
  },
};

export async function sendPaymentFailedEmail(to, { fullName, amountFormatted, planName, attemptNumber }) {
  const copy = DUNNING_COPY[attemptNumber] || DUNNING_COPY[1];
  await sendBrandedEmail({
    to,
    from: FROM_BILLING,
    subject: copy.subject,
    eyebrow: 'Payment failed',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: copy.bodyHtml(amountFormatted, planName),
    ctaLabel: 'Update payment method',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendAccessSuspendedEmail(to, { fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_BILLING,
    subject: 'Your GospelGoLive access has been paused',
    eyebrow: 'Access paused',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `
      <p>After three unsuccessful payment attempts, access to your GospelGoLive dashboard has been paused. Here's what that means:</p>
      <ul>
        <li>You can't go live or upload new sermons right now</li>
        <li>Your existing sermon library stays visible to your followers</li>
        <li>Giving and offerings continue uninterrupted — nothing changes for your congregation</li>
      </ul>
      <p>To restore full access immediately, update your payment method below — there's no waiting period once payment succeeds.</p>
      <p>Questions? Just reply to this email.</p>
    `,
    ctaLabel: 'Make a payment to restore access',
    ctaUrl: `${APP_URL}/mockup.html`,
  });
}

export async function sendAccessRestoredEmail(to, { fullName, amountFormatted }) {
  await sendBrandedEmail({
    to,
    from: FROM_BILLING,
    subject: "You're all set — payment received",
    eyebrow: 'Payment received',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Your payment of ${escapeHtml(amountFormatted)} went through, and your account is fully active again. Thanks for staying with GospelGoLive.</p>`,
  });
}

// ================================================================
// Waitlist (pre-launch coming-soon page)
// ================================================================

// Branded to match the coming-soon page (reference/mockup.html /
// Coming-soon/coming-soon.html.html) — dark navy background, gold accents,
// serif display heading. Sent immediately from the waitlist API route;
// the countdown-drip campaigns (progress update, launch day) are separate
// Resend Broadcasts sent to the whole audience — see scripts/create-broadcasts.js.
export async function sendWaitlistWelcomeEmail(to) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: "You're on the list — GospelGoLive",
    eyebrow: "You're on the list",
    heading: `Church, streaming live, <em style="color:#f5d787; font-style:italic;">everywhere.</em>`,
    bodyHtml: `<p>Thanks for signing up. We'll email you the moment GospelGoLive goes live — live worship, sermons on demand, and giving, all in one place for pastors and the people who follow them.</p>`,
    footerNote: "You're receiving this because you signed up at gospelgolive.com.",
  });
}

// ================================================================
// Notification emails (seeker: live/upload/post — pastor: new
// follower/giving). All share the same renderEmailHtml template above so
// this batch stays visually consistent with itself.
// ================================================================

export async function sendFollowedChurchLiveEmail(to, { churchName, streamTitle, watchUrl }) {
  const safeName = escapeHtml(churchName);
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `${churchName} is live now`,
    eyebrow: 'Live now',
    heading: `${safeName} just went live`,
    bodyHtml: `<p>${escapeHtml(streamTitle)} is streaming right now on GospelGoLive — join in before it ends.</p>`,
    ctaLabel: 'Watch now',
    ctaUrl: watchUrl,
    footerNote: `You're receiving this because you follow ${safeName} on GospelGoLive.`,
  });
}

export async function sendFollowedChurchSermonEmail(to, { churchName, sermonTitle, watchUrl }) {
  const safeName = escapeHtml(churchName);
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `${churchName} uploaded a new video`,
    eyebrow: 'New video',
    heading: `New video from ${safeName}`,
    bodyHtml: `<p>"${escapeHtml(sermonTitle)}" just went up and is ready to watch.</p>`,
    ctaLabel: 'Watch sermon',
    ctaUrl: watchUrl,
    footerNote: `You're receiving this because you follow ${safeName} on GospelGoLive.`,
  });
}

export async function sendFollowedChurchPostEmail(to, { churchName, postBody, churchUrl }) {
  const safeName = escapeHtml(churchName);
  const excerpt = postBody.length > 160 ? postBody.slice(0, 157) + '…' : postBody;
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `${churchName} shared an update`,
    eyebrow: 'New update',
    heading: `${safeName} shared an update`,
    bodyHtml: `<p>"${escapeHtml(excerpt)}"</p>`,
    ctaLabel: 'View on GospelGoLive',
    ctaUrl: churchUrl,
    footerNote: `You're receiving this because you follow ${safeName} on GospelGoLive.`,
  });
}

export async function sendNewFollowerEmail(to, { churchName, followerName }) {
  const safeFollower = escapeHtml(followerName);
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `${followerName} just followed you`,
    eyebrow: 'New follower',
    heading: 'You have a new follower',
    bodyHtml: `<p>${safeFollower} just followed ${escapeHtml(churchName)} on GospelGoLive.</p>`,
    ctaLabel: 'View dashboard',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: "You're receiving this because you're a pastor on GospelGoLive.",
  });
}

export async function sendNewDonationEmail(to, { churchName, giverName, amountFormatted, isRecurring }) {
  const safeGiver = escapeHtml(giverName);
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: `You received a gift — ${amountFormatted}`,
    eyebrow: 'New gift',
    heading: `${safeGiver} gave ${amountFormatted}`,
    bodyHtml: isRecurring
      ? `<p>${safeGiver} just set up a recurring monthly gift to ${escapeHtml(churchName)}.</p>`
      : `<p>${safeGiver} just gave a one-time gift to ${escapeHtml(churchName)}.</p>`,
    ctaLabel: 'View giving dashboard',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: "You're receiving this because you're a pastor on GospelGoLive.",
  });
}

// ================================================================
// Support Escalation
// ================================================================

const FROM_SUPPORT_BOT = 'GospelGoLive Support Bot <support@gospelgolive.com>';
const CUSTOMER_SERVICE_INBOX = 'customerservice@gospelgolive.com';

// Fired by the AI support chat widget (lib/supportChat.js) when a visitor's
// question is genuinely unique/account-specific and outside its FAQ
// knowledge base — forwards straight to the human support inbox instead of
// just telling the visitor to email in themselves.
export async function sendSupportEscalationEmail({ issueSummary, visitorContact, transcript }) {
  await sendBrandedEmail({
    to: CUSTOMER_SERVICE_INBOX,
    from: FROM_SUPPORT_BOT,
    subject: `Support chat escalation: ${issueSummary.slice(0, 80)}`,
    eyebrow: 'AI chat escalation',
    heading: 'A visitor needs human follow-up',
    bodyHtml: `
      <p><strong>Issue:</strong> ${escapeHtml(issueSummary)}</p>
      <p><strong>Contact:</strong> ${escapeHtml(visitorContact || 'Not provided')}</p>
      <p><strong>Full conversation:</strong></p>
      <div style="background:#0f1e42; border-radius:8px; padding:16px; white-space:pre-wrap; font-family:'Courier New',monospace; font-size:13px;">${escapeHtml(transcript)}</div>
    `,
  });
}

// ================================================================
// Behavior-triggered lifecycle emails (seeker + pastor)
// Sent by app/api/cron/seeker-lifecycle-emails, .../pastor-lifecycle-emails,
// or directly from an event-driven route (follower milestones, the 3-church
// follow) — see lib/behaviorEmails.js for the dedup/trigger logic. Every one
// of these gets a real, working unsubscribe link (unlike the nurture-sequence
// Resend Broadcasts, these are transactional sends, so the
// {{{RESEND_UNSUBSCRIBE_URL}}} merge tag isn't available) — never used on
// genuinely transactional mail elsewhere in this file.
// ================================================================

function lifecycleFooterNote(userId, extra) {
  const unsub = `<a href="${unsubscribeUrl(userId)}" style="color:#6b7593;">Unsubscribe from these emails</a>`;
  return extra ? `${extra}<br>${unsub}` : unsub;
}

// ---------------- Seeker ----------------

export async function sendSeekerNoLogin7Email(to, { userId, fullName, recentSermonsHtml }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'A few things you might have missed',
    eyebrow: "We've missed you",
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>It's been about a week — here's what's new from churches you follow:</p>${recentSermonsHtml}`,
    ctaLabel: 'Explore GospelGoLive',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerNoLogin30Email(to, { userId, fullName, followedPastorName, churchName, sermonTitle, watchUrl }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `${followedPastorName} just posted something new`,
    eyebrow: "We've missed you",
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>${escapeHtml(followedPastorName)} at ${escapeHtml(churchName)} recently shared "${escapeHtml(sermonTitle)}." Your followed churches are still right where you left them.</p>`,
    ctaLabel: 'Watch now',
    ctaUrl: watchUrl,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerNoLogin90Email(to, { userId, fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Should we keep in touch?',
    eyebrow: 'Checking in',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>We haven't seen you in a while, and we'd rather not clutter your inbox if this isn't useful right now.</p><p>If you come back anytime, your follows and giving history are exactly as you left them.</p>`,
    ctaLabel: 'Visit GospelGoLive',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId, 'Want to stay subscribed but hear from us less? The unsubscribe link below stops these emails entirely — your account and follows are untouched either way.'),
  });
}

export async function sendSeekerStreak4WeeksEmail(to, { userId, fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: "4 weeks running — that's a habit",
    eyebrow: 'Milestone',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>You've engaged with GospelGoLive for 4 weeks in a row now. However this fits into your week, we're glad it's become part of it.</p>`,
    ctaLabel: 'Keep exploring',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerFirstGiftThankYouEmail(to, { userId, fullName, churchName }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: 'Thank you for your first gift',
    eyebrow: 'Thank you',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>A quick, personal note — thank you for your gift to ${escapeHtml(churchName)}. It goes directly to support their ministry, and we're glad you chose to give through GospelGoLive.</p>`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerFollowedNeverWatchedEmail(to, { userId, fullName, churchName, recommendedSermonTitle, watchUrl }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `Your first watch from ${churchName}`,
    eyebrow: 'Get started',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>You followed ${escapeHtml(churchName)} a few days ago — here's a good place to start: "${escapeHtml(recommendedSermonTitle)}."</p>`,
    ctaLabel: 'Watch now',
    ctaUrl: watchUrl,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerUnfinishedSermonEmail(to, { userId, fullName, sermonTitle, percentWatched, watchUrl }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Pick up where you left off',
    eyebrow: 'Continue watching',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>You were ${percentWatched}% through "${escapeHtml(sermonTitle)}" — want to finish it?</p>`,
    ctaLabel: 'Resume watching',
    ctaUrl: watchUrl,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerPowerUser3ChurchesEmail(to, { userId, fullName, churchCount }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `You follow ${churchCount} churches — a couple of things that might help`,
    eyebrow: 'Power user',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>You clearly value hearing from a range of voices. Two things worth knowing: you can turn on live notifications for any specific church individually, and if you know someone who'd love GospelGoLive too —</p>`,
    ctaLabel: 'Invite a friend',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerInterestsNeverMatchedEmail(to, { userId, fullName, interestListHtml, recommendedListHtml }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Sermons picked based on what you told us',
    eyebrow: 'Recommended for you',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>When you joined, you told us you're interested in ${interestListHtml}. Here are a few sermons that match:</p>${recommendedListHtml}`,
    ctaLabel: 'Browse more like this',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerOneYearAnniversaryEmail(to, { userId, fullName, churchName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `One year with ${churchName}`,
    eyebrow: 'Anniversary',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>A year ago today, you followed ${escapeHtml(churchName)}. Just wanted to mark the occasion — thanks for being part of their community.</p>`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendSeekerGiftNoRecurringEmail(to, { userId, fullName, churchName }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: 'Want to make your giving automatic?',
    eyebrow: 'Recurring giving',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>A couple weeks ago you gave to ${escapeHtml(churchName)}. If it's meaningful to you, you can set up a recurring gift so it happens automatically — no need to remember each time.</p><p>Completely optional, and easy to change anytime.</p>`,
    ctaLabel: 'Set up recurring giving',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

// ---------------- Pastor ----------------

export async function sendPastorNoLogin7Email(to, { userId, fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: "Everything OK? It's been a week",
    eyebrow: 'Checking in',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Just checking in — it's been about a week since your last visit. No action needed, but if you need a hand setting up your next stream, we're here.</p>`,
    ctaLabel: 'Go to dashboard',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorNoLogin14Email(to, { userId, fullName, churchName, followerCount }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Your followers are still here',
    eyebrow: 'Checking in',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>It's been two weeks since your last stream. ${escapeHtml(churchName)} has ${followerCount} followers who'd love to hear from you — even a short update helps keep that connection alive.</p>`,
    ctaLabel: 'Go live now',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorNoLogin30Email(to, { userId, fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'Would a quick call help?',
    eyebrow: 'Checking in',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>We haven't seen you on GospelGoLive in about a month. If something isn't working for you, or you'd just like help getting back into a rhythm, we'd genuinely like to help — reply to this email, or:</p>`,
    ctaLabel: 'Book a quick call',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorOnboardingNeverLiveEmail(to, { userId, fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: "Your channel is ready — let's go live",
    eyebrow: 'Get started',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Your GospelGoLive channel is fully set up, but you haven't streamed yet. Going live takes about five minutes, start to finish.</p>`,
    ctaLabel: 'Go live for the first time',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorFirstStreamCompletedEmail(to, { userId, fullName, viewerCount, watchTimeFormatted, tipsListHtml }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'How your first stream went',
    eyebrow: 'Nice work',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Congratulations on your first stream! A quick look: <strong>${viewerCount}</strong> viewers, <strong>${escapeHtml(watchTimeFormatted)}</strong> total watch time.</p><p>A couple of things that tend to help next time:</p>${tipsListHtml}`,
    ctaLabel: 'View full analytics',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorStreak4WeeksEmail(to, { userId, fullName, churchName, followerGrowth }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: '4 Sundays in a row — your following is noticing',
    eyebrow: 'Milestone',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>You've streamed 4 weeks running. Since you started, ${escapeHtml(churchName)}'s following has grown by ${followerGrowth}. Keep it up.</p>`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorGivingDeclineEmail(to, { userId, fullName, churchName, amountThisMonthFormatted, amountLastMonthFormatted }) {
  await sendBrandedEmail({
    to,
    from: FROM_GIVING,
    subject: "This month's giving at a glance",
    eyebrow: 'Giving update',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Here's what changed in giving to ${escapeHtml(churchName)} this month: <strong>${amountThisMonthFormatted}</strong>, compared to ${amountLastMonthFormatted} last month. This can happen for a lot of ordinary reasons — timing, fewer streams, seasonality — just wanted you to have the full picture.</p>`,
    ctaLabel: 'View giving details',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorCapRepeatEmail(to, { userId, fullName, occurrenceCount, capType }) {
  await sendBrandedEmail({
    to,
    from: FROM_BILLING,
    subject: "You're outgrowing your current plan",
    eyebrow: 'Growth',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>Your last ${occurrenceCount} streams hit your plan's ${escapeHtml(capType)} limit — which usually means your congregation is growing. Upgrading removes that ceiling entirely.</p>`,
    ctaLabel: 'Compare plans',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

// Not wired to a caller yet — this app only has Tier 1 verification (Stripe
// Connect onboarding, see sendIdentityVerifiedEmail above). There's no
// Tier 2/3 "Ministry Verification" flow to key this off of; wire it up once
// that exists.
export async function sendPastorVerificationUnfinishedEmail(to, { userId, fullName }) {
  await sendBrandedEmail({
    to,
    from: FROM_TRUST,
    subject: 'Finish your ministry verification',
    eyebrow: 'Action needed',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>You started verification a few days ago but haven't finished — it only takes a few more minutes, and unlocks a higher giving limit plus a trust badge on your profile.</p>`,
    ctaLabel: 'Continue verification',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorFollowerMilestoneEmail(to, { userId, fullName, churchName, milestone }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: `${churchName} just hit ${milestone} followers`,
    eyebrow: 'Milestone',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>${escapeHtml(churchName)} just crossed ${milestone} followers on GospelGoLive. Congratulations — thought you'd want to know.</p>`,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorLowViewsSermonEmail(to, { userId, fullName, sermonTitle, editUrl }) {
  await sendBrandedEmail({
    to,
    from: FROM_HELLO,
    subject: 'A few ways to help your sermon get found',
    eyebrow: 'Tip',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>"${escapeHtml(sermonTitle)}" has been live a week. A few things that tend to help a sermon get discovered: a clear thumbnail, a descriptive title, and sharing the link directly with your congregation.</p>`,
    ctaLabel: 'Edit sermon details',
    ctaUrl: editUrl,
    footerNote: lifecycleFooterNote(userId),
  });
}

export async function sendPastorGiftsNoBankAccountEmail(to, { userId, fullName, churchName, amountFormatted }) {
  await sendBrandedEmail({
    to,
    from: FROM_BILLING,
    subject: 'You have gifts waiting to be paid out',
    eyebrow: 'Action needed',
    heading: `Hi ${escapeHtml(firstNameOf(fullName))}`,
    bodyHtml: `<p>${escapeHtml(churchName)} has received ${amountFormatted} in gifts, but payouts can't be sent until your bank account is connected.</p>`,
    ctaLabel: 'Add bank account',
    ctaUrl: `${APP_URL}/mockup.html`,
    footerNote: lifecycleFooterNote(userId),
  });
}
