import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { INTERESTS } from '@/lib/interests';

// Public directory of registered churches, for the seeker "Browse" panel.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim();
  const interest = searchParams.get('interest');

  const where = { owner: { deactivatedAt: null } };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (interest && INTERESTS.includes(interest)) {
    where.interests = { has: interest };
  }

  const churches = await prisma.church.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      name: true,
      slug: true,
      owner: { select: { fullName: true } },
      _count: { select: { follows: true } },
    },
  });

  return NextResponse.json({
    churches: churches.map((c) => ({
      name: c.name,
      slug: c.slug,
      pastorName: c.owner.fullName,
      followerCount: c._count.follows,
    })),
  });
}
