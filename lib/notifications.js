import { prisma } from '@/lib/prisma';
import {
  sendFollowedChurchLiveEmail,
  sendFollowedChurchSermonEmail,
  sendFollowedChurchPostEmail,
  sendNewFollowerEmail,
  sendNewDonationEmail,
  sendPaymentFailedEmail,
  sendAccessSuspendedEmail,
  sendAccessRestoredEmail,
  sendSubscriptionReceiptEmail,
  sendSubscriptionCancelledEmail,
  sendDisputeFiledEmail,
  sendGiftReceiptEmail,
  sendRecurringGiftFailedEmail,
  sendRecurringGiftCancelledEmail,
  sendIdentityVerifiedEmail,
  sendFraudReviewEmail,
  escapeHtml,
} from '@/lib/email';
import { sendPushToUsers } from '@/lib/push';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Looked up per-call (not cached) since a church's plan/ownership can change
// between calls — same "always fresh" spirit as the fee-rate lookup in the
// Stripe webhook. Returns null (and callers no-op) for an unverified owner
// email, same convention as notifyChurchDonation below.
async function getVerifiedOwner(ownerId) {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { email: true, emailVerified: true, fullName: true },
  });
  return owner?.emailVerified ? owner : null;
}

// Non-profit churches (businessType: 'non_profit') get the standard
// "no goods or services were provided" tax-deductible language; individual
// ministers' churches get the not-tax-deductible disclosure instead. Single
// source of truth for this so the two never drift/contradict each other.
function taxDisclosureHtml(church) {
  if (church.businessType === 'non_profit') {
    return `No goods or services were provided in exchange for this gift. This receipt may be used for tax purposes — ${escapeHtml(church.name)} is a registered tax-exempt organization. Consult your tax advisor for guidance specific to your situation.`;
  }
  return `This gift was made to an individual minister, not a registered tax-exempt organization, and is not tax-deductible.`;
}

// Fan-out-on-write: one row per follower per event. Simple to query
// per-seeker and fine at this scale (bounded by a church's follower count).
export async function notifyFollowers(churchId, { type, title, body, linkUrl }) {
  const followers = await prisma.follow.findMany({
    where: { churchId },
    select: { seekerId: true },
  });
  if (followers.length === 0) return;

  await prisma.notification.createMany({
    data: followers.map((f) => ({
      userId: f.seekerId,
      churchId,
      type,
      title,
      body: body || null,
      linkUrl: linkUrl || null,
    })),
  });

  await sendPushToUsers(
    followers.map((f) => f.seekerId),
    { title, body, url: linkUrl || '/mockup.html' }
  );
}

// Only mails verified addresses — an unverified email is unconfirmed to
// belong to the account holder, so we don't send it notification mail.
async function getVerifiedFollowerEmails(churchId) {
  const followers = await prisma.follow.findMany({
    where: { churchId },
    select: { seeker: { select: { email: true, emailVerified: true } } },
  });
  return followers.filter((f) => f.seeker.emailVerified).map((f) => f.seeker.email);
}

// Called once a sermon genuinely transitions into 'ready' — callers are
// responsible for only calling this on the transition, not on every check.
export async function notifySermonReady(sermon) {
  const church = await prisma.church.findUnique({ where: { id: sermon.churchId } });
  if (!church) return;
  await notifyFollowers(church.id, {
    type: 'sermon',
    title: `${church.name} uploaded a new video`,
    body: sermon.title,
    linkUrl: `/church.html?slug=${church.slug}&sermon=${sermon.id}`,
  });

  const emails = await getVerifiedFollowerEmails(church.id);
  await Promise.allSettled(
    emails.map((email) =>
      sendFollowedChurchSermonEmail(email, {
        churchName: church.name,
        sermonTitle: sermon.title,
        watchUrl: `${APP_URL}/church.html?slug=${church.slug}&sermon=${sermon.id}`,
      })
    )
  );
}

// Called once a stream genuinely transitions into 'live'.
export async function notifyStreamLive(stream) {
  const church = await prisma.church.findUnique({ where: { id: stream.churchId } });
  if (!church) return;
  await notifyFollowers(church.id, {
    type: 'live',
    title: `${church.name} is live now`,
    body: stream.title,
    linkUrl: `/church.html?slug=${church.slug}&watch=live`,
  });

  const emails = await getVerifiedFollowerEmails(church.id);
  await Promise.allSettled(
    emails.map((email) =>
      sendFollowedChurchLiveEmail(email, {
        churchName: church.name,
        streamTitle: stream.title,
        watchUrl: `${APP_URL}/church.html?slug=${church.slug}&watch=live`,
      })
    )
  );
}

// Called once a pastor sets (or meaningfully changes) a stream's
// scheduledAt to a new future time — callers are responsible for only
// calling this on a genuine change, not on every re-provision that resends
// the same value.
export async function notifyStreamScheduled(stream, church) {
  await notifyFollowers(church.id, {
    type: 'scheduled',
    title: `${church.name} scheduled an upcoming service`,
    body: `${stream.title}, ${formatDateTime(stream.scheduledAt)}`,
    linkUrl: `/church.html?slug=${church.slug}`,
  });
}

// Called once a pastor publishes a new timeline post.
export async function notifyNewPost(post, church) {
  await notifyFollowers(church.id, {
    type: 'post',
    title: `${church.name} shared an update`,
    body: post.body.length > 140 ? post.body.slice(0, 137) + '…' : post.body,
  });

  const emails = await getVerifiedFollowerEmails(church.id);
  await Promise.allSettled(
    emails.map((email) =>
      sendFollowedChurchPostEmail(email, {
        churchName: church.name,
        postBody: post.body,
        churchUrl: `${APP_URL}/church.html?slug=${church.slug}`,
      })
    )
  );
}

// Pastor-facing: emails the church owner when a seeker follows their church.
export async function notifyChurchNewFollower(church, seeker) {
  const owner = await prisma.user.findUnique({
    where: { id: church.ownerId },
    select: { email: true, emailVerified: true },
  });
  if (!owner || !owner.emailVerified) return;

  await sendNewFollowerEmail(owner.email, {
    churchName: church.name,
    followerName: seeker.fullName,
  });
}

// Pastor-facing (not follower fan-out): notifies the church owner directly
// when their church receives a gift. `linkUrl` uses a `panel:` prefix the
// dashboard's notification click-handler recognizes as an in-app panel
// switch rather than a church.html deep link.
export async function notifyChurchDonation(donation) {
  const church = await prisma.church.findUnique({
    where: { id: donation.churchId },
    select: { ownerId: true, name: true },
  });
  if (!church) return;

  const giver = donation.giverId
    ? await prisma.user.findUnique({ where: { id: donation.giverId }, select: { fullName: true } })
    : null;
  const giverName = giver?.fullName || 'Someone';
  const amount = (donation.amountCents / 100).toFixed(2);

  await prisma.notification.create({
    data: {
      userId: church.ownerId,
      churchId: donation.churchId,
      type: 'donation',
      title: `${giverName} gave $${amount}`,
      body: donation.isRecurring ? 'Recurring gift' : 'One-time gift',
      linkUrl: 'panel:p-giving',
    },
  });
  await sendPushToUsers([church.ownerId], {
    title: `${giverName} gave $${amount}`,
    body: donation.isRecurring ? 'Recurring gift' : 'One-time gift',
    url: '/mockup.html',
  });

  const owner = await prisma.user.findUnique({
    where: { id: church.ownerId },
    select: { email: true, emailVerified: true },
  });
  if (owner?.emailVerified) {
    await sendNewDonationEmail(owner.email, {
      churchName: church.name,
      giverName,
      amountFormatted: `$${amount}`,
      isRecurring: donation.isRecurring,
    });
  }
}

// Pastor-facing: notifies the church owner when a seeker likes their sermon,
// stream, or post. Skips notifying pastors about their own likes.
export async function notifyChurchLike(churchId, likerId, contentLabel, panelName) {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { ownerId: true },
  });
  if (!church || church.ownerId === likerId) return;

  const liker = await prisma.user.findUnique({ where: { id: likerId }, select: { fullName: true } });

  const title = `${liker?.fullName || 'Someone'} liked your ${contentLabel}`;
  await prisma.notification.create({
    data: {
      userId: church.ownerId,
      churchId,
      type: 'like',
      title,
      linkUrl: `panel:${panelName}`,
    },
  });
  await sendPushToUsers([church.ownerId], { title, url: '/mockup.html' });
}

// ================================================================
// Pastor subscription billing (dunning schedule, receipts, cancellation,
// disputes) — see app/api/webhooks/stripe/route.js and
// app/api/cron/subscription-retries/route.js for callers.
// ================================================================

// attemptNumber: 1 = day-0 first failure, 2 = day-3 second failure. The
// day-7 final failure uses notifyChurchAccessSuspended below instead.
export async function notifyChurchPaymentFailed(church, { attemptNumber, amountCents, planName }) {
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;
  await sendPaymentFailedEmail(owner.email, {
    fullName: owner.fullName,
    amountFormatted: formatCents(amountCents),
    planName,
    attemptNumber,
  });
}

export async function notifyChurchIdentityVerified(church) {
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;
  await sendIdentityVerifiedEmail(owner.email, { fullName: owner.fullName });
}

// Called from lib/detectSuspiciousGiving.js once a church's giving pattern
// trips one of the fraud heuristics (structuring, volume spike, card-testing
// risk). `reason` is the comma-joined flag list — plain enough for a pastor
// to read without exposing the exact detection thresholds.
export async function notifyChurchFraudReview(churchId, reason) {
  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { ownerId: true } });
  if (!church) return;
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;
  await sendFraudReviewEmail(owner.email, { fullName: owner.fullName, reason });
}

export async function notifyChurchAccessSuspended(church) {
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;
  await sendAccessSuspendedEmail(owner.email, { fullName: owner.fullName });
}

// Fired whenever a payment succeeds while the church was past_due/suspended
// — distinct from notifyChurchSubscriptionReceipt below, which is the
// regular "here's your monthly receipt" email for a normal, on-time charge.
export async function notifyChurchAccessRestored(church, amountCents) {
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;
  await sendAccessRestoredEmail(owner.email, { fullName: owner.fullName, amountFormatted: formatCents(amountCents) });
}

export async function notifyChurchSubscriptionReceipt(church, { amountCents, planName, nextBillingDate }) {
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;
  await sendSubscriptionReceiptEmail(owner.email, {
    fullName: owner.fullName,
    amountFormatted: formatCents(amountCents),
    planName,
    date: formatDate(new Date()),
    nextBillingDate: formatDate(nextBillingDate),
  });
}

export async function notifyChurchSubscriptionCancelled(church, { planName, endDate }) {
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;
  await sendSubscriptionCancelledEmail(owner.email, { fullName: owner.fullName, planName, endDate: formatDate(endDate) });
}

// donation.createdAt/amountCents describe the original gift; dispute is the
// raw Stripe dispute object from charge.dispute.created.
export async function notifyChurchDispute(donation, dispute) {
  const church = await prisma.church.findUnique({ where: { id: donation.churchId }, select: { ownerId: true } });
  if (!church) return;
  const owner = await getVerifiedOwner(church.ownerId);
  if (!owner) return;

  const giver = donation.giverId
    ? await prisma.user.findUnique({ where: { id: donation.giverId }, select: { fullName: true } })
    : null;
  const deadline = dispute.evidence_details?.due_by
    ? formatDate(new Date(dispute.evidence_details.due_by * 1000))
    : 'the deadline shown in your Stripe dashboard';

  await sendDisputeFiledEmail(owner.email, {
    fullName: owner.fullName,
    giverNameOrAnonymous: giver?.fullName || 'Someone',
    amountFormatted: formatCents(dispute.amount),
    date: formatDate(donation.createdAt),
    disputeUrl: `https://dashboard.stripe.com/disputes/${dispute.id}`,
    deadline,
  });
}

// ================================================================
// Seeker giving receipts / recurring-gift failures & cancellations
// ================================================================

// Anonymous gifts (no giverId) have no account to email — no-ops.
export async function notifyGiverGiftReceipt(donation, church) {
  if (!donation.giverId) return;
  const giver = await prisma.user.findUnique({
    where: { id: donation.giverId },
    select: { email: true, emailVerified: true, fullName: true },
  });
  if (!giver?.emailVerified) return;

  await sendGiftReceiptEmail(giver.email, {
    fullName: giver.fullName,
    amountFormatted: formatCents(donation.amountCents),
    churchName: church.name,
    date: formatDate(donation.createdAt),
    taxDisclosureHtml: taxDisclosureHtml(church),
  });
}

export async function notifySeekerRecurringGiftFailed(givingSubscription) {
  const [giver, church] = await Promise.all([
    prisma.user.findUnique({
      where: { id: givingSubscription.giverId },
      select: { email: true, emailVerified: true, fullName: true },
    }),
    prisma.church.findUnique({ where: { id: givingSubscription.churchId }, select: { name: true } }),
  ]);
  if (!giver?.emailVerified || !church) return;

  await sendRecurringGiftFailedEmail(giver.email, {
    fullName: giver.fullName,
    amountFormatted: formatCents(givingSubscription.amountCents),
    churchName: church.name,
  });
}

export async function notifySeekerRecurringGiftCancelled(givingSubscription) {
  const [giver, church] = await Promise.all([
    prisma.user.findUnique({
      where: { id: givingSubscription.giverId },
      select: { email: true, emailVerified: true, fullName: true },
    }),
    prisma.church.findUnique({ where: { id: givingSubscription.churchId }, select: { name: true } }),
  ]);
  if (!giver?.emailVerified || !church) return;

  await sendRecurringGiftCancelledEmail(giver.email, {
    fullName: giver.fullName,
    amountFormatted: formatCents(givingSubscription.amountCents),
    churchName: church.name,
  });
}
