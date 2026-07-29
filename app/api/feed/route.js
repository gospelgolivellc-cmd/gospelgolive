import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';

// A timeline of posts from every church the current user follows — private
// to that viewer, not part of the public church profile.
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const follows = await prisma.follow.findMany({
    where: { seekerId: user.sub },
    select: { churchId: true },
  });
  const churchIds = follows.map((f) => f.churchId);

  if (churchIds.length === 0) {
    return NextResponse.json({ posts: [], upcomingStreams: [] });
  }

  // Ministry+ stream scheduling: surface a countdown card for each followed
  // church's next scheduled service, same eligibility rule as the public
  // "Upcoming" banner on church.html (idle status, future scheduledAt, plan
  // gated) — see app/api/churches/[slug]/route.js for the twin of this.
  const churchesWithSchedule = await prisma.church.findMany({
    where: { id: { in: churchIds }, owner: { deactivatedAt: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      streams: {
        where: { status: 'idle', scheduledAt: { gt: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
        select: { id: true, title: true, scheduledAt: true, countdownMessage: true },
      },
    },
  });

  const upcomingStreams = churchesWithSchedule
    .filter((c) => c.streams.length > 0 && planHasFeature(c, 'stream_scheduling'))
    .map((c) => ({
      streamId: c.streams[0].id,
      title: c.streams[0].title,
      scheduledAt: c.streams[0].scheduledAt,
      countdownMessage: planHasFeature(c, 'green_room') ? c.streams[0].countdownMessage : null,
      churchName: c.name,
      churchSlug: c.slug,
    }))
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const posts = await prisma.post.findMany({
    where: { churchId: { in: churchIds }, church: { owner: { deactivatedAt: null } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      church: {
        select: {
          name: true,
          slug: true,
          owner: { select: { fullName: true, avatarUrl: true } },
        },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });

  const likedIds = new Set(
    (
      await prisma.like.findMany({
        where: { userId: user.sub, postId: { in: posts.map((p) => p.id) } },
        select: { postId: true },
      })
    ).map((l) => l.postId)
  );

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      body: p.body,
      createdAt: p.createdAt,
      churchName: p.church.name,
      churchSlug: p.church.slug,
      pastorName: p.church.owner.fullName,
      pastorAvatarUrl: p.church.owner.avatarUrl,
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      isLiked: likedIds.has(p.id),
    })),
    upcomingStreams,
  });
}
