import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendOnceForKey, consecutiveWeekStreak } from '@/lib/behaviorEmails';
import {
  sendPastorNoLogin7Email,
  sendPastorNoLogin14Email,
  sendPastorNoLogin30Email,
  sendPastorOnboardingNeverLiveEmail,
  sendPastorFirstStreamCompletedEmail,
  sendPastorStreak4WeeksEmail,
  sendPastorGivingDeclineEmail,
  sendPastorCapRepeatEmail,
  sendPastorLowViewsSermonEmail,
  sendPastorGiftsNoBankAccountEmail,
} from '@/lib/email';

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
// Below this many views a week after publishing, a sermon gets the
// discoverability tip email — arbitrary but reasonable for an early-stage
// platform; revisit once there's real traffic data to calibrate against.
const LOW_VIEWS_THRESHOLD = 10;
// "Meaningfully declined" for the giving comparison email — also arbitrary,
// picked to avoid noise from ordinary week-to-week variance.
const GIVING_DECLINE_THRESHOLD = 0.2;

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Vercel Cron (see vercel.json), once daily. Pastor-side counterpart to
// app/api/cron/seeker-lifecycle-emails — see that file's header comment for
// the shared dedup approach. Follower-milestone emails are event-driven
// (app/api/follows/toggle) rather than polled here. The Tier 2/3
// "verification started, not finished" email has no real trigger yet (this
// app only has Tier 1 / Stripe Connect) — sendPastorVerificationUnfinishedEmail
// exists in lib/email.js but isn't called anywhere.
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {};
  results.noLogin = await checkNoLoginOrStream();
  results.onboardingNeverLive = await checkOnboardingNeverLive();
  results.firstStreamCompleted = await checkFirstStreamCompleted();
  results.streak4Weeks = await checkStreak4WeeksStreaming();
  results.givingDecline = await checkGivingDecline();
  results.capRepeat = await checkCapRepeat();
  results.lowViewsSermon = await checkLowViewsSermon();
  results.giftsNoBankAccount = await checkGiftsNoBankAccount();

  return NextResponse.json({ ok: true, ...results });
}

async function activePastorsWithChurch() {
  const pastors = await prisma.user.findMany({
    where: { role: 'pastor', emailVerified: true, marketingOptOut: false, deactivatedAt: null },
    select: {
      id: true,
      email: true,
      fullName: true,
      lastLoginAt: true,
      churches: {
        take: 1,
        select: {
          id: true,
          name: true,
          slug: true,
          stripeOnboarded: true,
          streams: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } },
        },
      },
    },
  });
  return pastors.filter((p) => p.churches.length > 0).map((p) => ({ ...p, church: p.churches[0] }));
}

// "Activity" = whichever is more recent of signing in or going live — a
// pastor who streams regularly but rarely visits the dashboard directly
// shouldn't be treated as inactive.
function lastActiveAt(pastor) {
  const lastStreamAt = pastor.church.streams[0]?.startedAt || null;
  if (!pastor.lastLoginAt) return lastStreamAt;
  if (!lastStreamAt) return pastor.lastLoginAt;
  return pastor.lastLoginAt > lastStreamAt ? pastor.lastLoginAt : lastStreamAt;
}

// ---------------- 1-3. No login/stream 7 / 14 / 30 days ----------------
async function checkNoLoginOrStream() {
  const pastors = await activePastorsWithChurch();
  let sent = 0;
  for (const pastor of pastors) {
    const active = lastActiveAt(pastor);
    if (!active) continue;
    const daysSince = Math.floor((Date.now() - active.getTime()) / DAY_MS);
    const anchor = active.toISOString().slice(0, 10);

    try {
      if (daysSince >= 30) {
        if (await sendOnceForKey(pastor.id, `pastor_no_login_30_${anchor}`, () => sendPastorNoLogin30Email(pastor.email, { userId: pastor.id, fullName: pastor.fullName }))) sent += 1;
      } else if (daysSince >= 14) {
        const followerCount = await prisma.follow.count({ where: { churchId: pastor.church.id } });
        if (
          await sendOnceForKey(pastor.id, `pastor_no_login_14_${anchor}`, () =>
            sendPastorNoLogin14Email(pastor.email, { userId: pastor.id, fullName: pastor.fullName, churchName: pastor.church.name, followerCount })
          )
        )
          sent += 1;
      } else if (daysSince >= 7) {
        if (await sendOnceForKey(pastor.id, `pastor_no_login_7_${anchor}`, () => sendPastorNoLogin7Email(pastor.email, { userId: pastor.id, fullName: pastor.fullName }))) sent += 1;
      }
    } catch (err) {
      console.error(`no-login/stream check failed for pastor ${pastor.id}`, err);
    }
  }
  return { checked: pastors.length, sent };
}

// ---------------- 4. Onboarding complete, never went live (3 days) ----------------
async function checkOnboardingNeverLive() {
  const cutoff = new Date(Date.now() - 3 * DAY_MS);
  const churches = await prisma.church.findMany({
    where: { createdAt: { lte: cutoff }, streams: { none: {} } },
    select: { id: true, ownerId: true },
  });
  let sent = 0;
  for (const church of churches) {
    try {
      const owner = await prisma.user.findUnique({
        where: { id: church.ownerId },
        select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
      });
      if (!owner?.emailVerified || owner.marketingOptOut) continue;
      if (await sendOnceForKey(church.ownerId, 'pastor_onboarding_never_live', () => sendPastorOnboardingNeverLiveEmail(owner.email, { userId: church.ownerId, fullName: owner.fullName })))
        sent += 1;
    } catch (err) {
      console.error(`onboarding-never-live check failed for church ${church.id}`, err);
    }
  }
  return { checked: churches.length, sent };
}

// ---------------- 5. First stream completed (day after it ends) ----------------
async function checkFirstStreamCompleted() {
  const from = new Date(Date.now() - 2 * DAY_MS);
  const to = new Date(Date.now() - 1 * DAY_MS);
  const streams = await prisma.stream.findMany({
    where: { status: 'ended', endedAt: { gte: from, lte: to } },
    select: { id: true, churchId: true, startedAt: true, endedAt: true },
  });
  let sent = 0;
  for (const stream of streams) {
    try {
      const earlierStream = await prisma.stream.findFirst({
        where: { churchId: stream.churchId, status: 'ended', endedAt: { lt: stream.endedAt } },
        select: { id: true },
      });
      if (earlierStream) continue; // not their first completed stream

      const church = await prisma.church.findUnique({ where: { id: stream.churchId }, select: { ownerId: true } });
      const owner = await prisma.user.findUnique({
        where: { id: church.ownerId },
        select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
      });
      if (!owner?.emailVerified || owner.marketingOptOut) continue;

      const [viewerCount, watchAgg] = await Promise.all([
        prisma.viewEvent.count({ where: { streamId: stream.id } }),
        prisma.viewEvent.aggregate({ where: { streamId: stream.id }, _sum: { watchSeconds: true } }),
      ]);
      const totalWatchSeconds = watchAgg._sum.watchSeconds || 0;
      const watchTimeFormatted = totalWatchSeconds >= 3600 ? `${(totalWatchSeconds / 3600).toFixed(1)} hours` : `${Math.round(totalWatchSeconds / 60)} minutes`;
      const tipsListHtml = '<ul><li>Post a heads-up beforehand so your congregation knows when to tune in</li><li>Say hello to viewers by name as they join — it keeps people watching</li><li>Keep streaming on a consistent day/time so it becomes a habit</li></ul>';

      if (
        await sendOnceForKey(church.ownerId, `pastor_first_stream_completed_${stream.churchId}`, () =>
          sendPastorFirstStreamCompletedEmail(owner.email, { userId: church.ownerId, fullName: owner.fullName, viewerCount, watchTimeFormatted, tipsListHtml })
        )
      )
        sent += 1;
    } catch (err) {
      console.error(`first-stream-completed check failed for stream ${stream.id}`, err);
    }
  }
  return { checked: streams.length, sent };
}

// ---------------- 6. 4 consecutive weeks of streaming ----------------
async function checkStreak4WeeksStreaming() {
  const pastors = await activePastorsWithChurch();
  let sent = 0;
  const since = new Date(Date.now() - 28 * DAY_MS);
  for (const pastor of pastors) {
    try {
      const streams = await prisma.stream.findMany({
        where: { churchId: pastor.church.id, startedAt: { gte: since, not: null } },
        select: { startedAt: true },
      });
      const { length, streakStartWeekKey } = consecutiveWeekStreak(streams.map((s) => s.startedAt));
      if (length !== 4) continue;

      const startOfStreak = new Date(streakStartWeekKey);
      const [followersBefore, followersNow] = await Promise.all([
        prisma.follow.count({ where: { churchId: pastor.church.id, createdAt: { lt: startOfStreak } } }),
        prisma.follow.count({ where: { churchId: pastor.church.id } }),
      ]);
      const followerGrowth = followersNow - followersBefore;

      if (
        await sendOnceForKey(pastor.id, `pastor_streak_4weeks_${streakStartWeekKey}`, () =>
          sendPastorStreak4WeeksEmail(pastor.email, { userId: pastor.id, fullName: pastor.fullName, churchName: pastor.church.name, followerGrowth })
        )
      )
        sent += 1;
    } catch (err) {
      console.error(`streaming-streak check failed for pastor ${pastor.id}`, err);
    }
  }
  return { checked: pastors.length, sent };
}

// ---------------- 7. Giving down month over month ----------------
async function checkGivingDecline() {
  const now = new Date();
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthKey = startOfThisMonth.toISOString().slice(0, 7);

  const churches = await prisma.church.findMany({ select: { id: true, name: true, ownerId: true } });
  let sent = 0;
  for (const church of churches) {
    try {
      const [thisMonthAgg, lastMonthAgg] = await Promise.all([
        prisma.donation.aggregate({ where: { churchId: church.id, createdAt: { gte: startOfThisMonth } }, _sum: { amountCents: true } }),
        prisma.donation.aggregate({ where: { churchId: church.id, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } }, _sum: { amountCents: true } }),
      ]);
      const thisMonthCents = thisMonthAgg._sum.amountCents || 0;
      const lastMonthCents = lastMonthAgg._sum.amountCents || 0;
      if (lastMonthCents === 0) continue; // nothing to meaningfully compare against
      const decline = (lastMonthCents - thisMonthCents) / lastMonthCents;
      if (decline < GIVING_DECLINE_THRESHOLD) continue;

      const owner = await prisma.user.findUnique({
        where: { id: church.ownerId },
        select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
      });
      if (!owner?.emailVerified || owner.marketingOptOut) continue;

      if (
        await sendOnceForKey(church.ownerId, `pastor_giving_decline_${church.id}_${monthKey}`, () =>
          sendPastorGivingDeclineEmail(owner.email, {
            userId: church.ownerId,
            fullName: owner.fullName,
            churchName: church.name,
            amountThisMonthFormatted: formatCents(thisMonthCents),
            amountLastMonthFormatted: formatCents(lastMonthCents),
          })
        )
      )
        sent += 1;
    } catch (err) {
      console.error(`giving-decline check failed for church ${church.id}`, err);
    }
  }
  return { checked: churches.length, sent };
}

// ---------------- 8. Repeatedly hitting the viewer cap (3 consecutive streams) ----------------
async function checkCapRepeat() {
  const churches = await prisma.church.findMany({
    where: { streams: { some: {} } },
    select: { id: true, ownerId: true },
  });
  let sent = 0;
  for (const church of churches) {
    try {
      const recentStreams = await prisma.stream.findMany({
        where: { churchId: church.id, status: 'ended' },
        orderBy: { startedAt: 'desc' },
        take: 3,
        select: { id: true },
      });
      if (recentStreams.length < 3) continue;

      const hits = await prisma.planCapHit.findMany({
        where: { churchId: church.id, capType: 'viewer', contextId: { in: recentStreams.map((s) => s.id) } },
        select: { contextId: true },
      });
      const hitStreamIds = new Set(hits.map((h) => h.contextId));
      const allThreeHit = recentStreams.every((s) => hitStreamIds.has(s.id));
      if (!allThreeHit) continue;

      const owner = await prisma.user.findUnique({
        where: { id: church.ownerId },
        select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
      });
      if (!owner?.emailVerified || owner.marketingOptOut) continue;

      const mostRecentStreamId = recentStreams[0].id;
      if (
        await sendOnceForKey(church.ownerId, `pastor_cap_repeat_${mostRecentStreamId}`, () =>
          sendPastorCapRepeatEmail(owner.email, { userId: church.ownerId, fullName: owner.fullName, occurrenceCount: 3, capType: 'viewer' })
        )
      )
        sent += 1;
    } catch (err) {
      console.error(`cap-repeat check failed for church ${church.id}`, err);
    }
  }
  return { checked: churches.length, sent };
}

// ---------------- 9. First sermon, low views after a week ----------------
async function checkLowViewsSermon() {
  const from = new Date(Date.now() - 8 * DAY_MS);
  const to = new Date(Date.now() - 7 * DAY_MS);
  const sermons = await prisma.sermon.findMany({
    where: { status: 'ready', moderationStatus: 'clean', publishedAt: { gte: from, lte: to } },
    select: { id: true, title: true, churchId: true },
  });
  let sent = 0;
  for (const sermon of sermons) {
    try {
      const views = await prisma.viewEvent.count({ where: { sermonId: sermon.id } });
      if (views >= LOW_VIEWS_THRESHOLD) continue;

      const church = await prisma.church.findUnique({ where: { id: sermon.churchId }, select: { ownerId: true } });
      const owner = await prisma.user.findUnique({
        where: { id: church.ownerId },
        select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
      });
      if (!owner?.emailVerified || owner.marketingOptOut) continue;

      if (
        await sendOnceForKey(church.ownerId, `pastor_low_views_sermon_${sermon.id}`, () =>
          sendPastorLowViewsSermonEmail(owner.email, {
            userId: church.ownerId,
            fullName: owner.fullName,
            sermonTitle: sermon.title,
            editUrl: `${APP_URL}/mockup.html`,
          })
        )
      )
        sent += 1;
    } catch (err) {
      console.error(`low-views-sermon check failed for sermon ${sermon.id}`, err);
    }
  }
  return { checked: sermons.length, sent };
}

// ---------------- 10. Gifts received, no bank account connected (3 days after first gift) ----------------
async function checkGiftsNoBankAccount() {
  const churches = await prisma.church.findMany({
    where: { stripeOnboarded: false },
    select: { id: true, name: true, ownerId: true },
  });
  let sent = 0;
  for (const church of churches) {
    try {
      const firstDonation = await prisma.donation.findFirst({ where: { churchId: church.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
      if (!firstDonation) continue;
      const daysSinceFirst = (Date.now() - firstDonation.createdAt.getTime()) / DAY_MS;
      if (daysSinceFirst < 3) continue;

      const totalAgg = await prisma.donation.aggregate({ where: { churchId: church.id }, _sum: { netCents: true } });
      const owner = await prisma.user.findUnique({
        where: { id: church.ownerId },
        select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
      });
      if (!owner?.emailVerified || owner.marketingOptOut) continue;

      if (
        await sendOnceForKey(church.ownerId, `pastor_gifts_no_bankaccount_${church.id}`, () =>
          sendPastorGiftsNoBankAccountEmail(owner.email, {
            userId: church.ownerId,
            fullName: owner.fullName,
            churchName: church.name,
            amountFormatted: formatCents(totalAgg._sum.netCents || 0),
          })
        )
      )
        sent += 1;
    } catch (err) {
      console.error(`gifts-no-bankaccount check failed for church ${church.id}`, err);
    }
  }
  return { checked: churches.length, sent };
}
