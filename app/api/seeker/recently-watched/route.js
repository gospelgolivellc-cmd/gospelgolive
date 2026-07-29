import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

const LIMIT = 24;

function shapeSermon(s, favoritedIds) {
  return {
    id: s.id,
    title: s.title,
    thumbnailUrl: s.thumbnailUrl,
    playbackId: s.playbackId,
    durationSeconds: s.durationSeconds,
    churchName: s.church.name,
    churchSlug: s.church.slug,
    isFavorited: favoritedIds.has(s.id),
  };
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  // Over-fetch view events (a seeker can rewatch the same sermon many
  // times) then dedupe by sermon, keeping only the most recent watch.
  const events = await prisma.viewEvent.findMany({
    where: { seekerId: user.sub, sermonId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { sermonId: true },
  });

  const orderedSermonIds = [];
  const seen = new Set();
  for (const e of events) {
    if (seen.has(e.sermonId)) continue;
    seen.add(e.sermonId);
    orderedSermonIds.push(e.sermonId);
    if (orderedSermonIds.length >= LIMIT) break;
  }

  if (orderedSermonIds.length === 0) {
    return NextResponse.json({ sermons: [] });
  }

  const [sermons, favorites] = await Promise.all([
    prisma.sermon.findMany({
      where: { id: { in: orderedSermonIds }, hidden: false },
      include: { church: { select: { name: true, slug: true } } },
    }),
    prisma.favorite.findMany({
      where: { userId: user.sub, sermonId: { in: orderedSermonIds } },
      select: { sermonId: true },
    }),
  ]);
  const sermonById = new Map(sermons.map((s) => [s.id, s]));
  const favoritedIds = new Set(favorites.map((f) => f.sermonId));

  const ordered = orderedSermonIds
    .map((id) => sermonById.get(id))
    .filter(Boolean)
    .map((s) => shapeSermon(s, favoritedIds));

  return NextResponse.json({ sermons: ordered });
}
