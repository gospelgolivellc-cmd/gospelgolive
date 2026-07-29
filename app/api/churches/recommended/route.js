import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// Automatic "Churches Near You" feed for the seeker Home panel — not a
// filter the seeker chooses, just what shows up. Scored by a weighted blend
// of location match (city > state > country > no match), the categories the
// seeker picked at onboarding (lib/interests.js taxonomy, self-tagged by
// both sides), and — as a secondary signal layered on top — the categories
// they actually spend the most time watching (see WATCH_HISTORY_LIMIT
// below), then by popularity as a final tiebreaker. Geography carries the
// bigger point gaps so it still dominates overall; onboarding interests
// outweigh watch history so a deliberate initial choice isn't drowned out
// by a handful of views, but enough of either can still pull a same-state
// or same-country church above a same-city one with neither.
// Same small-dataset assumption as /api/churches and /api/churches/popular:
// scoring/sorting happens in JS rather than in the query.
const GEO_SCORE = { city: 300, state: 200, country: 100, none: 0 };
const INTEREST_WEIGHT = 40;
const WATCH_HISTORY_WEIGHT = 15;
// Only the seeker's top N categories by total watch time count as a
// "most and longest watched" signal — everything watched once in passing
// shouldn't outrank a category they deliberately chose at onboarding.
const WATCH_HISTORY_TOP_N = 5;

export async function GET() {
  const { user, error } = await requireUser('seeker');
  if (error) return error;

  const [seeker, follows, sermonViews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.sub },
      select: { city: true, state: true, country: true, interests: true },
    }),
    prisma.follow.findMany({ where: { seekerId: user.sub }, select: { churchId: true } }),
    // Only sermon views carry a category (Sermon.category, free-text but
    // populated from the same INTERESTS taxonomy via the upload dropdown) —
    // Stream has no per-broadcast category, so live-only viewing doesn't
    // feed this signal.
    prisma.viewEvent.findMany({
      where: { seekerId: user.sub, sermonId: { not: null } },
      select: { watchSeconds: true, sermon: { select: { category: true } } },
    }),
  ]);

  const followedIds = follows.map((f) => f.churchId);
  const seekerInterests = new Set(seeker?.interests || []);

  // Total watch time per category, then keep only the top N — "the
  // categories they view the most and longest" collapses naturally into one
  // ranking here, since a category watched more often (or for longer) simply
  // accumulates more total seconds.
  const watchSecondsByCategory = new Map();
  for (const view of sermonViews) {
    const category = view.sermon?.category;
    if (!category) continue;
    watchSecondsByCategory.set(category, (watchSecondsByCategory.get(category) || 0) + (view.watchSeconds || 0));
  }
  const topWatchedCategories = new Set(
    Array.from(watchSecondsByCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, WATCH_HISTORY_TOP_N)
      .map(([category]) => category)
  );

  const churches = await prisma.church.findMany({
    where: {
      owner: { deactivatedAt: null },
      id: followedIds.length ? { notIn: followedIds } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      name: true,
      slug: true,
      city: true,
      state: true,
      country: true,
      interests: true,
      createdAt: true,
      owner: { select: { fullName: true } },
      _count: { select: { follows: true } },
    },
  });

  function geoMatchOf(c) {
    if (!seeker?.city && !seeker?.state && !seeker?.country) return null;
    if (seeker.city && c.city && seeker.city.toLowerCase() === c.city.toLowerCase()) return 'city';
    if (seeker.state && c.state && seeker.state.toLowerCase() === c.state.toLowerCase()) return 'state';
    if (seeker.country && c.country && seeker.country.toLowerCase() === c.country.toLowerCase()) return 'country';
    return null;
  }

  const ranked = churches
    .map((c) => {
      const matchReason = geoMatchOf(c);
      const sharedInterestCount = c.interests.filter((i) => seekerInterests.has(i)).length;
      const sharedWatchHistoryCount = c.interests.filter((i) => topWatchedCategories.has(i)).length;
      const score =
        GEO_SCORE[matchReason || 'none'] +
        sharedInterestCount * INTEREST_WEIGHT +
        sharedWatchHistoryCount * WATCH_HISTORY_WEIGHT;
      return {
        name: c.name,
        slug: c.slug,
        pastorName: c.owner.fullName,
        followerCount: c._count.follows,
        city: c.city,
        state: c.state,
        matchReason,
        sharedInterestCount,
        score,
        createdAt: c.createdAt,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.followerCount !== a.followerCount) return b.followerCount - a.followerCount;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .slice(0, 12)
    .map(({ score, createdAt, ...rest }) => rest);

  return NextResponse.json({ churches: ranked });
}
