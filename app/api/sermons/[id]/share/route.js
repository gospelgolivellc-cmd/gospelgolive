import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public, no auth — a simple tally of completed shares, same trust level as
// a view counter. Called once a seeker actually picks a share destination
// (copy link, social intent, or the native share sheet), not just on open.
export async function POST(req, { params }) {
  const { id } = await params;

  try {
    const sermon = await prisma.sermon.update({
      where: { id },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });
    return NextResponse.json({ shareCount: sermon.shareCount });
  } catch (err) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });
  }
}
