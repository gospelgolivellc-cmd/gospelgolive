import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// Pastor closes the poll early (rather than waiting for the next poll to
// auto-replace it).
export async function PATCH(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;
  const { id, pollId } = await params;

  const poll = await prisma.streamPoll.findUnique({
    where: { id: pollId },
    include: { stream: { include: { church: true } } },
  });
  if (!poll || poll.streamId !== id || poll.stream.church.ownerId !== user.sub) {
    return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  }

  await prisma.streamPoll.update({ where: { id: pollId }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
