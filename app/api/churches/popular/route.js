import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Top churches by follower count, for the "Popular Accounts" sidebar.
export async function GET() {
  const churches = await prisma.church.findMany({
    where: { owner: { deactivatedAt: null } },
    orderBy: { follows: { _count: 'desc' } },
    take: 12,
    select: {
      name: true,
      slug: true,
      owner: { select: { fullName: true, avatarUrl: true } },
      _count: { select: { follows: true } },
    },
  });

  return NextResponse.json({
    churches: churches
      .filter((c) => c._count.follows > 0)
      .map((c) => ({
        name: c.name,
        slug: c.slug,
        pastorName: c.owner.fullName,
        pastorAvatarUrl: c.owner.avatarUrl,
        followerCount: c._count.follows,
      })),
  });
}
