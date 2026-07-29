import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Every currently-live stream across every church, for the seeker "Live Now"
// tab. Sorted oldest-started-first (the longest-running stream leads) —
// the client can re-sort to newest-first without refetching.
export async function GET() {
  const streams = await prisma.stream.findMany({
    where: { status: 'live', moderationStatus: 'clean', church: { owner: { deactivatedAt: null } } },
    orderBy: { startedAt: 'asc' },
    select: {
      id: true,
      title: true,
      description: true,
      playbackId: true,
      startedAt: true,
      church: {
        select: {
          name: true,
          slug: true,
          owner: { select: { fullName: true, avatarUrl: true } },
          _count: { select: { follows: true } },
        },
      },
    },
  });

  return NextResponse.json({
    streams: streams.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      playbackId: s.playbackId,
      startedAt: s.startedAt,
      churchName: s.church.name,
      churchSlug: s.church.slug,
      pastorName: s.church.owner.fullName,
      pastorAvatarUrl: s.church.owner.avatarUrl,
      followerCount: s.church._count.follows,
    })),
  });
}
