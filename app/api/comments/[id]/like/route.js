import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toggleLike } from '@/lib/interactions';

// Any signed-in user can like any comment — comments are already public
// once posted (see app/api/streams/[id]/comments etc., which have no
// follow-gate on reading), so liking one carries the same access level.
export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const comment = await prisma.comment.findUnique({ where: { id }, select: { id: true } });
  if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

  const state = await toggleLike(user.sub, { commentId: id });
  return NextResponse.json(state);
}
