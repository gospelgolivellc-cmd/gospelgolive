import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function DELETE(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id }, include: { church: { select: { ownerId: true } } } });
  if (!post || post.church.ownerId !== user.sub) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
