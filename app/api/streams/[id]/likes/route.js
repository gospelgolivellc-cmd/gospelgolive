import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, requireUser } from '@/lib/auth';
import { getLikeState, toggleLike } from '@/lib/interactions';
import { notifyChurchLike } from '@/lib/notifications';

export async function GET(req, { params }) {
  const { id } = await params;
  const stream = await prisma.stream.findUnique({ where: { id }, select: { id: true } });
  if (!stream) return NextResponse.json({ error: 'Stream not found' }, { status: 404 });

  const user = await getCurrentUser();
  const state = await getLikeState(user?.sub, { streamId: id });
  return NextResponse.json(state);
}

export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const stream = await prisma.stream.findUnique({ where: { id }, select: { id: true, churchId: true, title: true } });
  if (!stream) return NextResponse.json({ error: 'Stream not found' }, { status: 404 });

  const state = await toggleLike(user.sub, { streamId: id });
  if (state.isLiked) {
    notifyChurchLike(stream.churchId, user.sub, `livestream "${stream.title}"`, 'p-golive').catch((e) =>
      console.error('Failed to notify church of stream like', e)
    );
  }
  return NextResponse.json(state);
}
