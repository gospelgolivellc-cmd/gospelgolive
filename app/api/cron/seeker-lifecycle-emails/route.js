import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendOnceForKey, wasEmailSent, consecutiveWeekStreak } from '@/lib/behaviorEmails';
import {
  escapeHtml,
  sendSeekerNoLogin7Email,
  sendSeekerNoLogin30Email,
  sendSeekerNoLogin90Email,
  sendSeekerStreak4WeeksEmail,
  sendSeekerFirstGiftThankYouEmail,
  sendSeekerFollowedNeverWatchedEmail,
  sendSeekerUnfinishedSermonEmail,
  sendSeekerInterestsNeverMatchedEmail,
  sendSeekerOneYearAnniversaryEmail,
  sendSeekerGiftNoRecurringEmail,
} from '@/lib/email';

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// Vercel Cron (see vercel.json), once daily. Every check here is a seeker
// behavior/inactivity condition from the behavior-triggered-emails doc —
// the pastor-side equivalents live in the sibling
// app/api/cron/pastor-lifecycle-emails route. Dedup is per-check via
// sendOnceForKey (lib/behaviorEmails.js); the power-user "follows 3
// churches" and 1-year-anniversary-adjacent milestone emails that CAN be
// event-driven are wired directly into app/api/follows/toggle instead of
// polled here.
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {};
  results.noLogin7 = await checkNoLogin7();
  results.noLogin30 = await checkNoLogin30();
  results.noLogin90 = await checkNoLogin90();
  results.streak4Weeks = await checkStreak4Weeks();
  results.firstGiftThankYou = await checkFirstGiftThankYou();
  results.followedNeverWatched = await checkFollowedNeverWatched();
  results.unfinishedSermon = await checkUnfinishedSermon();
  results.interestsNeverMatched = await checkInterestsNeverMatched();
  results.oneYearAnniversary = await checkOneYearAnniversary();
  results.giftNoRecurring = await checkGiftNoRecurring();

  return NextResponse.json({ ok: true, ...results });
}

async function forInactiveSeekers(days, fn) {
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const seekers = await prisma.user.findMany({
    where: {
      role: 'seeker',
      emailVerified: true,
      marketingOptOut: false,
      deactivatedAt: null,
      lastLoginAt: { lte: cutoff },
    },
    select: { id: true, email: true, fullName: true, lastLoginAt: true },
  });
  let sent = 0;
  for (const seeker of seekers) {
    try {
      if (await fn(seeker)) sent += 1;
    } catch (err) {
      console.error(`seeker-lifecycle check failed for ${seeker.id}`, err);
    }
  }
  return { checked: seekers.length, sent };
}

// ---------------- 1. No login 7 days ----------------
async function checkNoLogin7() {
  return forInactiveSeekers(7, async (seeker) => {
    const follows = await prisma.follow.findMany({ where: { seekerId: seeker.id }, select: { churchId: true } });
    if (follows.length === 0) return false;
    const churchIds = follows.map((f) => f.churchId);
    const since = new Date(Date.now() - 7 * DAY_MS);
    const recent = await prisma.sermon.findMany({
      where: { churchId: { in: churchIds }, status: 'ready', moderationStatus: 'clean', hidden: false, publishedAt: { gte: since } },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, churchId: true },
    });
    if (recent.length === 0) return false;
    const churches = await prisma.church.findMany({ where: { id: { in: recent.map((s) => s.churchId) } }, select: { id: true, slug: true, name: true } });
    const churchById = new Map(churches.map((c) => [c.id, c]));
    const html = `<ul>${recent
      .map((s) => {
        const c = churchById.get(s.churchId);
        return `<li><a href="${APP_URL}/church.html?slug=${c?.slug}&sermon=${s.id}" style="color:#f5d787;">${escapeHtml(s.title)}</a> — ${escapeHtml(c?.name || '')}</li>`;
      })
      .join('')}</ul>`;

    const anchor = seeker.lastLoginAt.toISOString().slice(0, 10);
    return sendOnceForKey(seeker.id, `seeker_no_login_7_${anchor}`, () =>
      sendSeekerNoLogin7Email(seeker.email, { userId: seeker.id, fullName: seeker.fullName, recentSermonsHtml: html })
    );
  });
}

// ---------------- 2. No login 30 days ----------------
async function checkNoLogin30() {
  return forInactiveSeekers(30, async (seeker) => {
    const follows = await prisma.follow.findMany({ where: { seekerId: seeker.id }, select: { churchId: true } });
    if (follows.length === 0) return false;
    const churchIds = follows.map((f) => f.churchId);
    const latest = await prisma.sermon.findFirst({
      where: { churchId: { in: churchIds }, status: 'ready', moderationStatus: 'clean', hidden: false },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, title: true, churchId: true },
    });
    if (!latest) return false;
    const church = await prisma.church.findUnique({ where: { id: latest.churchId }, select: { slug: true, name: true, owner: { select: { fullName: true } } } });
    if (!church) return false;

    const anchor = seeker.lastLoginAt.toISOString().slice(0, 10);
    return sendOnceForKey(seeker.id, `seeker_no_login_30_${anchor}`, () =>
      sendSeekerNoLogin30Email(seeker.email, {
        userId: seeker.id,
        fullName: seeker.fullName,
        followedPastorName: church.owner.fullName,
        churchName: church.name,
        sermonTitle: latest.title,
        watchUrl: `${APP_URL}/church.html?slug=${church.slug}&sermon=${latest.id}`,
      })
    );
  });
}

// ---------------- 3. No login 90 days ----------------
async function checkNoLogin90() {
  return forInactiveSeekers(90, async (seeker) => {
    const anchor = seeker.lastLoginAt.toISOString().slice(0, 10);
    return sendOnceForKey(seeker.id, `seeker_no_login_90_${anchor}`, () =>
      sendSeekerNoLogin90Email(seeker.email, { userId: seeker.id, fullName: seeker.fullName })
    );
  });
}

// ---------------- 4. 4-week consecutive engagement streak ----------------
async function checkStreak4Weeks() {
  const seekers = await prisma.user.findMany({
    where: { role: 'seeker', emailVerified: true, marketingOptOut: false, deactivatedAt: null },
    select: { id: true, email: true, fullName: true },
  });
  let sent = 0;
  const since = new Date(Date.now() - 28 * DAY_MS);
  for (const seeker of seekers) {
    try {
      const [views, donations] = await Promise.all([
        prisma.viewEvent.findMany({ where: { seekerId: seeker.id, createdAt: { gte: since } }, select: { createdAt: true } }),
        prisma.donation.findMany({ where: { giverId: seeker.id, createdAt: { gte: since } }, select: { createdAt: true } }),
      ]);
      const timestamps = [...views.map((v) => v.createdAt), ...donations.map((d) => d.createdAt)];
      const { length, streakStartWeekKey } = consecutiveWeekStreak(timestamps);
      if (length !== 4) continue;
      const didSend = await sendOnceForKey(seeker.id, `seeker_streak_4weeks_${streakStartWeekKey}`, () =>
        sendSeekerStreak4WeeksEmail(seeker.email, { userId: seeker.id, fullName: seeker.fullName })
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.error(`streak check failed for seeker ${seeker.id}`, err);
    }
  }
  return { checked: seekers.length, sent };
}

// ---------------- 5. First gift — thank you (2-3 days after) ----------------
async function checkFirstGiftThankYou() {
  const from = new Date(Date.now() - 3 * DAY_MS);
  const to = new Date(Date.now() - 2 * DAY_MS);
  const candidates = await prisma.donation.findMany({
    where: { giverId: { not: null }, createdAt: { gte: from, lte: to } },
    select: { giverId: true, churchId: true, createdAt: true },
  });
  let sent = 0;
  for (const donation of candidates) {
    try {
      const earlierGift = await prisma.donation.findFirst({
        where: { giverId: donation.giverId, createdAt: { lt: donation.createdAt } },
        select: { id: true },
      });
      if (earlierGift) continue; // not their first-ever gift

      const [giver, church] = await Promise.all([
        prisma.user.findUnique({ where: { id: donation.giverId }, select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true } }),
        prisma.church.findUnique({ where: { id: donation.churchId }, select: { name: true } }),
      ]);
      if (!giver?.emailVerified || giver.marketingOptOut || !church) continue;

      const didSend = await sendOnceForKey(donation.giverId, 'seeker_first_gift_thankyou', () =>
        sendSeekerFirstGiftThankYouEmail(giver.email, { userId: donation.giverId, fullName: giver.fullName, churchName: church.name })
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.error('first-gift-thankyou check failed', err);
    }
  }
  return { checked: candidates.length, sent };
}

// ---------------- 6. Followed a pastor, never watched (5 days) ----------------
async function checkFollowedNeverWatched() {
  const cutoff = new Date(Date.now() - 5 * DAY_MS);
  const follows = await prisma.follow.findMany({
    where: { createdAt: { lte: cutoff } },
    select: { seekerId: true, churchId: true },
  });
  let sent = 0;
  for (const follow of follows) {
    try {
      const key = `seeker_followed_never_watched_${follow.churchId}`;
      if (await wasEmailSent(follow.seekerId, key)) continue;

      const watched = await prisma.viewEvent.findFirst({
        where: {
          seekerId: follow.seekerId,
          OR: [{ sermon: { churchId: follow.churchId } }, { stream: { churchId: follow.churchId } }],
        },
        select: { id: true },
      });
      if (watched) continue;

      const [seeker, church] = await Promise.all([
        prisma.user.findUnique({ where: { id: follow.seekerId }, select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true } }),
        prisma.church.findUnique({ where: { id: follow.churchId }, select: { name: true, slug: true } }),
      ]);
      if (!seeker?.emailVerified || seeker.marketingOptOut || !church) continue;

      const recommended = await prisma.sermon.findFirst({
        where: { churchId: follow.churchId, status: 'ready', moderationStatus: 'clean', hidden: false },
        orderBy: { publishedAt: 'desc' },
        select: { id: true, title: true },
      });
      if (!recommended) continue;

      const didSend = await sendOnceForKey(follow.seekerId, key, () =>
        sendSeekerFollowedNeverWatchedEmail(seeker.email, {
          userId: follow.seekerId,
          fullName: seeker.fullName,
          churchName: church.name,
          recommendedSermonTitle: recommended.title,
          watchUrl: `${APP_URL}/church.html?slug=${church.slug}&sermon=${recommended.id}`,
        })
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.error('followed-never-watched check failed', err);
    }
  }
  return { checked: follows.length, sent };
}

// ---------------- 7. Didn't finish a sermon (80%+, session gone stale) ----------------
async function checkUnfinishedSermon() {
  const staleCutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min — session no longer "in progress"
  const recentCutoff = new Date(Date.now() - 14 * DAY_MS); // don't dig through ancient sessions every day
  const candidates = await prisma.viewEvent.findMany({
    where: {
      seekerId: { not: null },
      sermonId: { not: null },
      lastHeartbeatAt: { lte: staleCutoff, gte: recentCutoff },
      watchSeconds: { not: null },
    },
    select: { id: true, seekerId: true, sermonId: true, watchSeconds: true },
  });
  let sent = 0;
  for (const view of candidates) {
    try {
      const sermon = await prisma.sermon.findUnique({ where: { id: view.sermonId }, select: { title: true, durationSeconds: true, churchId: true, id: true } });
      if (!sermon?.durationSeconds) continue;
      const percent = Math.round((view.watchSeconds / sermon.durationSeconds) * 100);
      if (percent < 80 || percent >= 100) continue;

      const key = `seeker_unfinished_sermon_${sermon.id}`;
      const seeker = await prisma.user.findUnique({
        where: { id: view.seekerId },
        select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
      });
      if (!seeker?.emailVerified || seeker.marketingOptOut) continue;
      const church = await prisma.church.findUnique({ where: { id: sermon.churchId }, select: { slug: true } });

      const didSend = await sendOnceForKey(view.seekerId, key, () =>
        sendSeekerUnfinishedSermonEmail(seeker.email, {
          userId: view.seekerId,
          fullName: seeker.fullName,
          sermonTitle: sermon.title,
          percentWatched: percent,
          watchUrl: `${APP_URL}/church.html?slug=${church?.slug}&sermon=${sermon.id}`,
        })
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.error('unfinished-sermon check failed', err);
    }
  }
  return { checked: candidates.length, sent };
}

// ---------------- 8. Interests selected, never matched (7 days post-signup) ----------------
async function checkInterestsNeverMatched() {
  const from = new Date(Date.now() - 8 * DAY_MS);
  const to = new Date(Date.now() - 7 * DAY_MS);
  const seekers = await prisma.user.findMany({
    where: { role: 'seeker', emailVerified: true, marketingOptOut: false, createdAt: { gte: from, lte: to }, interests: { isEmpty: false } },
    select: { id: true, email: true, fullName: true, interests: true },
  });
  let sent = 0;
  for (const seeker of seekers) {
    try {
      const anyEngagement = await prisma.viewEvent.findFirst({ where: { seekerId: seeker.id }, select: { id: true } });
      if (anyEngagement) continue;

      const matching = await prisma.church.findMany({
        where: { interests: { hasSome: seeker.interests }, owner: { deactivatedAt: null } },
        select: {
          slug: true,
          sermons: {
            where: { status: 'ready', moderationStatus: 'clean', hidden: false },
            orderBy: { publishedAt: 'desc' },
            take: 1,
            select: { id: true, title: true },
          },
        },
        take: 5,
      });
      const recs = matching.filter((c) => c.sermons.length > 0);
      if (recs.length === 0) continue;

      const recommendedListHtml = `<ul>${recs
        .map((c) => `<li><a href="${APP_URL}/church.html?slug=${c.slug}&sermon=${c.sermons[0].id}" style="color:#f5d787;">${escapeHtml(c.sermons[0].title)}</a></li>`)
        .join('')}</ul>`;
      const interestListHtml = escapeHtml(seeker.interests.join(', '));

      const didSend = await sendOnceForKey(seeker.id, 'seeker_interests_never_matched', () =>
        sendSeekerInterestsNeverMatchedEmail(seeker.email, { userId: seeker.id, fullName: seeker.fullName, interestListHtml, recommendedListHtml })
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.error('interests-never-matched check failed', err);
    }
  }
  return { checked: seekers.length, sent };
}

// ---------------- 9. One-year follow anniversary ----------------
async function checkOneYearAnniversary() {
  const from = new Date(Date.now() - 366 * DAY_MS);
  const to = new Date(Date.now() - 365 * DAY_MS);
  const follows = await prisma.follow.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { seekerId: true, churchId: true },
  });
  let sent = 0;
  for (const follow of follows) {
    try {
      const [seeker, church] = await Promise.all([
        prisma.user.findUnique({ where: { id: follow.seekerId }, select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true } }),
        prisma.church.findUnique({ where: { id: follow.churchId }, select: { name: true } }),
      ]);
      if (!seeker?.emailVerified || seeker.marketingOptOut || !church) continue;

      const didSend = await sendOnceForKey(follow.seekerId, `seeker_one_year_anniversary_${follow.churchId}`, () =>
        sendSeekerOneYearAnniversaryEmail(seeker.email, { userId: follow.seekerId, fullName: seeker.fullName, churchName: church.name })
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.error('one-year-anniversary check failed', err);
    }
  }
  return { checked: follows.length, sent };
}

// ---------------- 10. Gave once, no recurring gift set up (2 weeks) ----------------
async function checkGiftNoRecurring() {
  const from = new Date(Date.now() - 15 * DAY_MS);
  const to = new Date(Date.now() - 14 * DAY_MS);
  const donations = await prisma.donation.findMany({
    where: { giverId: { not: null }, isRecurring: false, createdAt: { gte: from, lte: to } },
    select: { giverId: true, churchId: true },
  });
  let sent = 0;
  for (const donation of donations) {
    try {
      const key = `seeker_gift_no_recurring_${donation.giverId}_${donation.churchId}`;

      const hasRecurring = await prisma.givingSubscription.findFirst({
        where: { giverId: donation.giverId, churchId: donation.churchId, status: { in: ['active', 'paused'] } },
        select: { id: true },
      });
      if (hasRecurring) continue;

      const [giver, church] = await Promise.all([
        prisma.user.findUnique({ where: { id: donation.giverId }, select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true } }),
        prisma.church.findUnique({ where: { id: donation.churchId }, select: { name: true } }),
      ]);
      if (!giver?.emailVerified || giver.marketingOptOut || !church) continue;

      const didSend = await sendOnceForKey(donation.giverId, key, () =>
        sendSeekerGiftNoRecurringEmail(giver.email, { userId: donation.giverId, fullName: giver.fullName, churchName: church.name })
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.error('gift-no-recurring check failed', err);
    }
  }
  return { checked: donations.length, sent };
}
