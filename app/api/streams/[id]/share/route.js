import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public, no auth — same tally semantics as the sermon share counter.
export async function POST(req, { params }) {
  const { id } = await params;

  try {
    const stream = await prisma.stream.update({
      where: { id },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });
    return NextResponse.json({ shareCount: stream.shareCount });
  } catch (err) {
    return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
  }
}
