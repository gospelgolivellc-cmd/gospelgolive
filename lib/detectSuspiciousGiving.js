import { prisma } from '@/lib/prisma';
import { notifyChurchFraudReview } from '@/lib/notifications';

// ================================================================
// Trust & Safety financial-crime layer (Trust & Safety Protocol section C).
// Stripe — the actual money-transmitting entity in this Connect setup —
// carries the primary BSA/AML compliance burden and already runs Radar's
// fraud scoring on every transaction. This is a second, thinner layer on
// top: platform-level pattern detection for a giving platform specifically,
// which Stripe's general-purpose model has no way to know it's looking at.
//
// Note: the doc's fifth pattern — "repeated early-payout requests
// immediately following large gifts" — has no counterpart in this app's
// architecture. Payouts here are automatic (transferDonationPayout fires
// right after every donation via Stripe Connect transfers), not an
// on-demand withdrawal a pastor requests, so there's nothing to detect.
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// "Just under" a reporting threshold, repeated — classic structuring. The
// $10,000 figure mirrors the BSA Currency Transaction Report threshold this
// pattern is classically built around; the band below only counts gifts
// landing in the top 20% of it as suspiciously "just under" rather than
// merely "a somewhat large gift."
const STRUCTURING_THRESHOLD_CENTS = Number(process.env.STRUCTURING_THRESHOLD_CENTS || 1_000_000);
const STRUCTURING_BAND_LOW = 0.8;
const STRUCTURING_WINDOW_DAYS = 7;
const STRUCTURING_MIN_GIFTS = 3;

// A church's giving volume spiking well outside its historical pattern.
// Requires a minimum amount of prior history so a brand-new church's first
// real week of giving doesn't false-trigger against a near-zero average.
const VOLUME_SPIKE_MULTIPLIER = 5;
const VOLUME_SPIKE_LOOKBACK_WEEKS = 8;
const VOLUME_SPIKE_MIN_HISTORY_COUNT = 5;

// Many distinct cards giving large amounts to the same church in a short
// window — could be card-testing fraud, or otherwise warrants a closer look
// either way per the protocol doc.
const CARD_TESTING_WINDOW_HOURS = 24;
const CARD_TESTING_MIN_DISTINCT_CARDS = 8;
const CARD_TESTING_MIN_AVG_CENTS = 10_000;

// A donor giving unusually large amounts across many unrelated churches in
// a short period.
const DONOR_SPREAD_WINDOW_DAYS = 7;
const DONOR_SPREAD_MIN_CHURCHES = 5;
const DONOR_SPREAD_MIN_TOTAL_CENTS = 500_000;

async function getRecentChurchDonations(churchId, days) {
  return prisma.donation.findMany({
    where: { churchId, createdAt: { gte: new Date(Date.now() - days * DAY_MS) } },
    select: { amountCents: true, giverId: true, cardFingerprint: true, createdAt: true },
  });
}

function isStructuringPattern(donations) {
  const low = STRUCTURING_THRESHOLD_CENTS * STRUCTURING_BAND_LOW;
  const byGiver = new Map();
  for (const d of donations) {
    const key = d.giverId || d.cardFingerprint;
    if (!key) continue; // no way to attribute an anonymous, cardless gift to a repeat giver
    if (d.amountCents < low || d.amountCents >= STRUCTURING_THRESHOLD_CENTS) continue;
    if (!byGiver.has(key)) byGiver.set(key, 0);
    byGiver.set(key, byGiver.get(key) + 1);
  }
  return [...byGiver.values()].some((count) => count >= STRUCTURING_MIN_GIFTS);
}

async function isVolumeSpike(churchId) {
  const now = Date.now();
  const [thisWeek, history] = await Promise.all([
    prisma.donation.aggregate({
      where: { churchId, createdAt: { gte: new Date(now - 7 * DAY_MS) } },
      _sum: { amountCents: true },
    }),
    prisma.donation.aggregate({
      where: {
        churchId,
        createdAt: {
          gte: new Date(now - (VOLUME_SPIKE_LOOKBACK_WEEKS + 1) * 7 * DAY_MS),
          lt: new Date(now - 7 * DAY_MS),
        },
      },
      _sum: { amountCents: true },
      _count: true,
    }),
  ]);

  if (history._count < VOLUME_SPIKE_MIN_HISTORY_COUNT) return false;
  const weeklyAvgCents = (history._sum.amountCents || 0) / VOLUME_SPIKE_LOOKBACK_WEEKS;
  if (weeklyAvgCents <= 0) return false;
  return (thisWeek._sum.amountCents || 0) > weeklyAvgCents * VOLUME_SPIKE_MULTIPLIER;
}

function hasManyDistinctCardsHighAmount(donations) {
  const cutoff = Date.now() - CARD_TESTING_WINDOW_HOURS * 60 * 60 * 1000;
  const recent = donations.filter((d) => d.cardFingerprint && d.createdAt.getTime() >= cutoff);
  const distinctCards = new Set(recent.map((d) => d.cardFingerprint));
  if (distinctCards.size < CARD_TESTING_MIN_DISTINCT_CARDS) return false;
  const avgCents = recent.reduce((sum, d) => sum + d.amountCents, 0) / recent.length;
  return avgCents >= CARD_TESTING_MIN_AVG_CENTS;
}

async function flagChurchForFraudReview(churchId, flags) {
  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { verificationStatus: true } });
  // Already flagged — don't re-flag/re-email on every subsequent transaction
  // while a prior review is still open. An admin clearing the flag (moving
  // verificationStatus back to 'active') is what re-arms this.
  if (!church || church.verificationStatus === 'flagged') return;

  const reason = flags.join(', ');
  await prisma.church.update({ where: { id: churchId }, data: { verificationStatus: 'flagged', flaggedReason: reason } });

  const report = await prisma.contentReport.create({
    data: { contentType: 'profile', contentId: churchId, category: 'fraud_suspicion', detectionSource: 'automated', status: 'pending' },
  });
  await prisma.moderationAction.create({
    data: { reportId: report.id, actionTaken: 'payouts_paused', actionedBy: 'system', notes: reason },
  });

  notifyChurchFraudReview(churchId, reason).catch((e) => console.error('Failed to send fraud-review email', e));
}

// Checks one church's recent giving for structuring / volume-spike /
// card-testing patterns. Safe to call after every donation (cheap, scoped to
// one church) and from the daily sweep alike.
export async function checkChurchGivingPatterns(churchId) {
  const recent = await getRecentChurchDonations(churchId, Math.max(STRUCTURING_WINDOW_DAYS, CARD_TESTING_WINDOW_HOURS / 24));
  const flags = [];
  if (isStructuringPattern(recent)) flags.push('structuring');
  if (await isVolumeSpike(churchId)) flags.push('volume_spike');
  if (hasManyDistinctCardsHighAmount(recent)) flags.push('card_testing_risk');

  if (flags.length > 0) await flagChurchForFraudReview(churchId, flags);
  return flags;
}

// Checks one donor's recent giving spread across churches. Flags the
// donor's own profile (not any single church) for admin review — a
// suspicious donor isn't necessarily evidence against the churches they gave
// to, so this deliberately doesn't touch verificationStatus on any church.
export async function checkGiverPatterns(giverId) {
  if (!giverId) return [];

  const recent = await prisma.donation.findMany({
    where: { giverId, createdAt: { gte: new Date(Date.now() - DONOR_SPREAD_WINDOW_DAYS * DAY_MS) } },
    select: { amountCents: true, churchId: true },
  });
  const distinctChurches = new Set(recent.map((d) => d.churchId));
  const totalCents = recent.reduce((sum, d) => sum + d.amountCents, 0);
  if (distinctChurches.size < DONOR_SPREAD_MIN_CHURCHES || totalCents < DONOR_SPREAD_MIN_TOTAL_CENTS) return [];

  // Don't re-flag a donor who already has an open pending report — same
  // "don't spam re-flag" reasoning as flagChurchForFraudReview.
  const existing = await prisma.contentReport.findFirst({
    where: { contentType: 'profile', contentId: giverId, category: 'fraud_suspicion', status: { in: ['pending', 'under_review'] } },
  });
  if (existing) return ['donor_spread_across_churches'];

  const report = await prisma.contentReport.create({
    data: { contentType: 'profile', contentId: giverId, category: 'fraud_suspicion', detectionSource: 'automated', status: 'pending' },
  });
  await prisma.moderationAction.create({
    data: { reportId: report.id, actionTaken: 'flagged_for_review', actionedBy: 'system', notes: 'donor_spread_across_churches' },
  });

  return ['donor_spread_across_churches'];
}

// Admin review-queue decision for a fraud_suspicion report (see
// app/api/admin/reports/[id]/action). 'clear' means the review turned up
// nothing — unpause payouts (only if this report is still the reason it's
// flagged; guards against clobbering a *newer* flag raised in the
// meantime). 'confirm' means the pattern was real; the actual next step
// (contacting Stripe, law enforcement) is a manual, human process per the
// protocol doc, not something this function automates — it just records
// the finding and leaves the church's payouts paused.
export async function resolveFraudReport(reportId, { decision, adminUserId, notes = null }) {
  const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('Report not found');
  if (report.category !== 'fraud_suspicion') throw new Error('Not a fraud_suspicion report');

  if (decision === 'clear') {
    await prisma.church.updateMany({
      where: { id: report.contentId, verificationStatus: 'flagged' },
      data: { verificationStatus: 'active', flaggedReason: null },
    });
    await prisma.contentReport.update({ where: { id: reportId }, data: { status: 'dismissed' } });
    await prisma.moderationAction.create({
      data: { reportId, actionTaken: 'report_dismissed', actionedBy: adminUserId, notes },
    });
    return { decision: 'clear' };
  }

  if (decision === 'confirm') {
    await prisma.contentReport.update({ where: { id: reportId }, data: { status: 'actioned' } });
    await prisma.moderationAction.create({
      data: { reportId, actionTaken: 'fraud_confirmed', actionedBy: adminUserId, notes },
    });
    return { decision: 'confirm' };
  }

  throw new Error(`Unknown decision "${decision}" — expected "clear" or "confirm"`);
}

// Daily sweep (see app/api/cron/fraud-review) across every church/giver with
// donation activity in the relevant lookback window — catches patterns that
// only become visible over several days, which the single-transaction
// trigger in the Stripe webhook can miss on any one donation alone.
export async function runDailyFraudSweep() {
  const [activeChurches, activeGivers] = await Promise.all([
    prisma.donation.findMany({
      where: { createdAt: { gte: new Date(Date.now() - STRUCTURING_WINDOW_DAYS * DAY_MS) } },
      distinct: ['churchId'],
      select: { churchId: true },
    }),
    prisma.donation.findMany({
      where: { giverId: { not: null }, createdAt: { gte: new Date(Date.now() - DONOR_SPREAD_WINDOW_DAYS * DAY_MS) } },
      distinct: ['giverId'],
      select: { giverId: true },
    }),
  ]);

  let churchesFlagged = 0;
  for (const { churchId } of activeChurches) {
    if ((await checkChurchGivingPatterns(churchId)).length > 0) churchesFlagged += 1;
  }

  let donorsFlagged = 0;
  for (const { giverId } of activeGivers) {
    if ((await checkGiverPatterns(giverId)).length > 0) donorsFlagged += 1;
  }

  return {
    churchesChecked: activeChurches.length,
    churchesFlagged,
    donorsChecked: activeGivers.length,
    donorsFlagged,
  };
}
