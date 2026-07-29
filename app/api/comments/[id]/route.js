import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// Author-only: a seeker (or pastor) can remove their own comment.
export async function DELETE(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment || comment.userId !== user.sub) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
