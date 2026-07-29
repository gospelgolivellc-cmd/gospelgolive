import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getPlan } from '@/lib/plans';
import { hasActiveAccess } from '@/lib/checkAccess';

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

// Snaps a date back to the Sunday that starts its week (UTC), for weekly
// follower-growth bucketing — mirrors dayKey's day-bucket approach above,
// just at a coarser grain.
function weekKey(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

const FOLLOWER_GROWTH_WEEKS = 8;

export async function GET() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }
  if (!hasActiveAccess(church)) {
    return NextResponse.json(
      { error: 'Your account is paused due to a billing issue. Update your payment method to restore access.', code: 'ACCESS_SUSPENDED' },
      { status: 403 }
    );
  }

  const plan = getPlan(church.plan);

  // Free plan's promised "total views & watch hours" already show via the
  // Overview KPIs (/api/dashboard/me) — this endpoint is the detailed
  // Analytics panel, gated behind a soft upgrade prompt rather than a 403
  // (still the pastor's own dashboard, not a hard block).
  if (plan.analyticsTier === 'basic') {
    return NextResponse.json({ tier: 'basic', locked: true });
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 6);

  const [recentViews, deviceGroups, countryGroups, cityGroups, sermons, followRows] = await Promise.all([
    prisma.viewEvent.findMany({
      where: {
        createdAt: { gte: since },
        OR: [{ sermon: { churchId: church.id } }, { stream: { churchId: church.id } }],
      },
      select: { createdAt: true },
    }),
    prisma.viewEvent.groupBy({
      by: ['deviceType'],
      where: { OR: [{ sermon: { churchId: church.id } }, { stream: { churchId: church.id } }] },
      _count: true,
    }),
    prisma.viewEvent.groupBy({
      by: ['country'],
      where: { OR: [{ sermon: { churchId: church.id } }, { stream: { churchId: church.id } }] },
      _count: true,
    }),
    prisma.viewEvent.groupBy({
      by: ['city', 'region'],
      where: {
        city: { not: null },
        OR: [{ sermon: { churchId: church.id } }, { stream: { churchId: church.id } }],
      },
      _count: true,
    }),
    prisma.sermon.findMany({
      where: { churchId: church.id, hidden: false },
      select: { id: true, title: true, durationSeconds: true, _count: { select: { likes: true } } },
    }),
    prisma.follow.findMany({ where: { churchId: church.id }, select: { createdAt: true } }),
  ]);

  // Bucket the last 7 calendar days (oldest -> newest), by UTC date.
  const dayBuckets = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + (6 - i));
    dayBuckets.push({ date: d, key: dayKey(d), count: 0 });
  }
  const bucketByKey = new Map(dayBuckets.map((b) => [b.key, b]));
  recentViews.forEach((v) => {
    const bucket = bucketByKey.get(dayKey(new Date(v.createdAt)));
    if (bucket) bucket.count += 1;
  });

  const deviceCounts = { mobile: 0, desktop: 0, tv: 0 };
  let totalDeviceCount = 0;
  deviceGroups.forEach((g) => {
    const key = Object.prototype.hasOwnProperty.call(deviceCounts, g.deviceType) ? g.deviceType : 'desktop';
    deviceCounts[key] += g._count;
    totalDeviceCount += g._count;
  });

  const countryBreakdown = countryGroups
    .map((g) => ({ country: g.country || 'Unknown', count: g._count }))
    .sort((a, b) => b.count - a.count);

  const cityBreakdown = cityGroups
    .map((g) => ({ city: g.region ? `${g.city}, ${g.region}` : g.city, count: g._count }))
    .sort((a, b) => b.count - a.count);

  const sermonIds = sermons.map((s) => s.id);
  const sermonViewGroups = sermonIds.length
    ? await prisma.viewEvent.groupBy({
        by: ['sermonId'],
        where: { sermonId: { in: sermonIds } },
        _count: true,
        _avg: { watchSeconds: true },
      })
    : [];
  const viewsBySermonId = new Map(sermonViewGroups.map((g) => [g.sermonId, g]));

  const topSermons = sermons
    .map((s) => {
      const g = viewsBySermonId.get(s.id);
      const views = g?._count ?? 0;
      const avgWatchPercent =
        g && s.durationSeconds ? Math.min(100, Math.round((g._avg.watchSeconds / s.durationSeconds) * 100)) : null;
      return { id: s.id, title: s.title, views, avgWatchPercent, likeCount: s._count.likes };
    })
    .filter((s) => s.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  // New followers per week for the last 8 weeks (oldest -> newest), by UTC
  // week-start (Sunday). Rows older than the window are dropped, same as
  // viewsByDay's 7-day cutoff above.
  const weekBuckets = [];
  for (let i = FOLLOWER_GROWTH_WEEKS - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay() - i * 7);
    weekBuckets.push({ key: weekKey(d), count: 0 });
  }
  const weekBucketByKey = new Map(weekBuckets.map((b) => [b.key, b]));
  followRows.forEach((f) => {
    const bucket = weekBucketByKey.get(weekKey(f.createdAt));
    if (bucket) bucket.count += 1;
  });

  const responseBody = {
    tier: plan.analyticsTier,
    viewsByDay: dayBuckets.map((b) => ({ date: b.key, count: b.count })),
    deviceBreakdown: { ...deviceCounts, total: totalDeviceCount },
    countryBreakdown,
    cityBreakdown,
    topSermons,
    followerGrowth: weekBuckets.map((b) => ({ weekStart: b.key, count: b.count })),
  };

  if (plan.analyticsTier !== 'basic') {
    responseBody.exportsAvailable = true;
  }

  return NextResponse.json(responseBody);
}
