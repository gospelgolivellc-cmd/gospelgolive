import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getPlan, planHasFeature } from '@/lib/plans';
import { startOfMonth, resumeStaleCapPauses } from '@/lib/givingCap';

export async function GET(req, { params }) {
  const { slug } = await params;

  const church = await prisma.church.findUnique({
    where: { slug },
    include: {
      owner: { select: { fullName: true, avatarUrl: true } },
      streams: {
        where: { status: 'live', moderationStatus: 'clean' },
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          title: true,
          description: true,
          playbackId: true,
          status: true,
          startedAt: true,
          shareCount: true,
          _count: { select: { likes: true, comments: true } },
        },
      },
    },
  });

  if (!church) {
    return NextResponse.json({ error: 'Church not found' }, { status: 404 });
  }

  const liveStreamRow = church.streams[0] || null;
  const plan = getPlan(church.plan);

  // Upcoming/green-room: this church's persistent stream (the same
  // reusable Mux resource go-live uses) with a future scheduledAt and no
  // live broadcast in progress yet. There's exactly one reusable stream per
  // church (see app/api/streams/provision/route.js), so at most one
  // upcoming slot can ever exist — not a full multi-event calendar.
  const upcomingStreamRow = liveStreamRow
    ? null
    : await prisma.stream.findFirst({
        where: { churchId: church.id, status: 'idle', scheduledAt: { gt: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        select: { title: true, scheduledAt: true, countdownMessage: true },
      });
  const upcomingStream =
    upcomingStreamRow && planHasFeature(church, 'stream_scheduling')
      ? {
          title: upcomingStreamRow.title,
          scheduledAt: upcomingStreamRow.scheduledAt,
          countdownMessage: planHasFeature(church, 'green_room') ? upcomingStreamRow.countdownMessage : null,
        }
      : null;

  if (plan.monthlyGivingCapCents !== null) {
    await resumeStaleCapPauses(church.id);
  }

  const [sermons, followerCount, monthlyGivingAgg, givingFundsRows] = await Promise.all([
    prisma.sermon.findMany({
      where: { churchId: church.id, status: 'ready', hidden: false, moderationStatus: 'clean' },
      orderBy: { publishedAt: 'desc' },
      take: 12,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        series: true,
        thumbnailUrl: true,
        playbackId: true,
        durationSeconds: true,
        publishedAt: true,
        shareCount: true,
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.follow.count({ where: { churchId: church.id } }),
    plan.monthlyGivingCapCents !== null
      ? prisma.donation.aggregate({
          where: { churchId: church.id, createdAt: { gte: startOfMonth() } },
          _sum: { amountCents: true },
        })
      : null,
    planHasFeature(church, 'giving_funds')
      ? prisma.givingFund.findMany({ where: { churchId: church.id }, orderBy: { createdAt: 'asc' } })
      : [],
  ]);

  const givingFunds = givingFundsRows.map((f) => ({ id: f.id, name: f.name, isDefault: f.isDefault }));

  const monthlyGivingRemainingCents =
    plan.monthlyGivingCapCents === null
      ? null
      : Math.max(0, plan.monthlyGivingCapCents - (monthlyGivingAgg?._sum.amountCents ?? 0));

  const user = await getCurrentUser();
  let isFollowing = false;
  const likedSermonIds = new Set();
  const likedStreamIds = new Set();
  const favoritedSermonIds = new Set();

  if (user) {
    const likeTargets = sermons.map((s) => ({ sermonId: s.id }));
    if (liveStreamRow) likeTargets.push({ streamId: liveStreamRow.id });

    const [existingFollow, likes, favorites] = await Promise.all([
      prisma.follow.findUnique({
        where: { seekerId_churchId: { seekerId: user.sub, churchId: church.id } },
      }),
      likeTargets.length
        ? prisma.like.findMany({ where: { userId: user.sub, OR: likeTargets }, select: { sermonId: true, streamId: true } })
        : [],
      sermons.length
        ? prisma.favorite.findMany({
            where: { userId: user.sub, sermonId: { in: sermons.map((s) => s.id) } },
            select: { sermonId: true },
          })
        : [],
    ]);
    isFollowing = Boolean(existingFollow);
    for (const like of likes) {
      if (like.sermonId) likedSermonIds.add(like.sermonId);
      if (like.streamId) likedStreamIds.add(like.streamId);
    }
    for (const fav of favorites) favoritedSermonIds.add(fav.sermonId);
  }

  const liveStream = liveStreamRow
    ? {
        id: liveStreamRow.id,
        title: liveStreamRow.title,
        description: liveStreamRow.description,
        playbackId: liveStreamRow.playbackId,
        status: liveStreamRow.status,
        startedAt: liveStreamRow.startedAt,
        likeCount: liveStreamRow._count.likes,
        commentCount: liveStreamRow._count.comments,
        shareCount: liveStreamRow.shareCount,
        isLiked: likedStreamIds.has(liveStreamRow.id),
      }
    : null;

  return NextResponse.json({
    church: {
      name: church.name,
      slug: church.slug,
      bio: church.bio,
      bannerUrl: church.bannerUrl,
      pastorName: church.owner.fullName,
      pastorAvatarUrl: church.owner.avatarUrl,
      canReceiveGifts: church.stripeOnboarded,
      followerCount,
      plan: church.plan,
      features: plan.features,
      allowRecurringGiving: plan.allowRecurringGiving,
      monthlyGivingCapCents: plan.monthlyGivingCapCents,
      monthlyGivingRemainingCents,
      playerMaxResolution: plan.playerMaxResolution,
      overlayImageUrl: planHasFeature(church, 'stream_overlays') ? church.overlayImageUrl : null,
      givingFunds,
    },
    liveStream,
    upcomingStream,
    sermons: sermons.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      category: s.category,
      series: s.series,
      thumbnailUrl: s.thumbnailUrl,
      playbackId: s.playbackId,
      durationSeconds: s.durationSeconds,
      publishedAt: s.publishedAt,
      likeCount: s._count.likes,
      commentCount: s._count.comments,
      shareCount: s.shareCount,
      isLiked: likedSermonIds.has(s.id),
      isFavorited: favoritedSermonIds.has(s.id),
    })),
    isFollowing,
    viewerRole: user?.role || null,
    viewerId: user?.sub || null,
  });
}
