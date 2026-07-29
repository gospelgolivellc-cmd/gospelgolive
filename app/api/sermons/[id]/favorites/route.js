import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, requireUser } from '@/lib/auth';

export async function GET(req, { params }) {
  const { id } = await params;
  const sermon = await prisma.sermon.findUnique({ where: { id }, select: { id: true } });
  if (!sermon) return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });

  const user = await getCurrentUser();
  const favorite = user
    ? await prisma.favorite.findUnique({ where: { userId_sermonId: { userId: user.sub, sermonId: id } } })
    : null;
  return NextResponse.json({ isFavorited: Boolean(favorite) });
}

export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const sermon = await prisma.sermon.findUnique({ where: { id }, select: { id: true } });
  if (!sermon) return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });

  const existing = await prisma.favorite.findUnique({
    where: { userId_sermonId: { userId: user.sub, sermonId: id } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ isFavorited: false });
  }

  await prisma.favorite.create({ data: { userId: user.sub, sermonId: id } });
  return NextResponse.json({ isFavorited: true });
}
