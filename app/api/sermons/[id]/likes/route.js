import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, requireUser } from '@/lib/auth';
import { getLikeState, toggleLike } from '@/lib/interactions';
import { notifyChurchLike } from '@/lib/notifications';

export async function GET(req, { params }) {
  const { id } = await params;
  const sermon = await prisma.sermon.findUnique({ where: { id }, select: { id: true } });
  if (!sermon) return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });

  const user = await getCurrentUser();
  const state = await getLikeState(user?.sub, { sermonId: id });
  return NextResponse.json(state);
}

export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const sermon = await prisma.sermon.findUnique({ where: { id }, select: { id: true, churchId: true, title: true } });
  if (!sermon) return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });

  const state = await toggleLike(user.sub, { sermonId: id });
  if (state.isLiked) {
    notifyChurchLike(sermon.churchId, user.sub, `sermon "${sermon.title}"`, 'p-sermons').catch((e) =>
      console.error('Failed to notify church of sermon like', e)
    );
  }
  return NextResponse.json(state);
}
