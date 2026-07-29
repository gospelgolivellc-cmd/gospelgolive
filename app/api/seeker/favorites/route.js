import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

function shapeSermon(s) {
  return {
    id: s.id,
    title: s.title,
    thumbnailUrl: s.thumbnailUrl,
    playbackId: s.playbackId,
    durationSeconds: s.durationSeconds,
    churchName: s.church.name,
    churchSlug: s.church.slug,
    isFavorited: true,
  };
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: 'desc' },
    include: { sermon: { include: { church: { select: { name: true, slug: true } } } } },
  });

  const sermons = favorites.filter((f) => !f.sermon.hidden).map((f) => shapeSermon(f.sermon));

  return NextResponse.json({ sermons });
}
