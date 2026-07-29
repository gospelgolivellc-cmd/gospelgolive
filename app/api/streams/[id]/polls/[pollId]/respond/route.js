import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';

const schema = z.object({ selectedOption: z.string().min(1) });

export async function POST(req, { params }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to vote.', code: 'SIGN_IN_REQUIRED' }, { status: 401 });
  }
  const { id, pollId } = await params;

  const poll = await prisma.streamPoll.findUnique({
    where: { id: pollId },
    include: { stream: { include: { church: true } } },
  });
  if (!poll || poll.streamId !== id) {
    return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
  }
  if (!planHasFeature(poll.stream.church, 'polls_prayer_requests')) {
    return NextResponse.json({ error: 'Polls require the Congregation plan.', code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
  }
  if (!poll.isActive) {
    return NextResponse.json({ error: 'This poll has closed.' }, { status: 400 });
  }

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }
  if (!poll.options.includes(input.selectedOption)) {
    return NextResponse.json({ error: 'Not a valid option for this poll.' }, { status: 400 });
  }

  await prisma.pollResponse.upsert({
    where: { pollId_seekerId: { pollId: poll.id, seekerId: user.sub } },
    create: { pollId: poll.id, seekerId: user.sub, selectedOption: input.selectedOption },
    update: { selectedOption: input.selectedOption },
  });

  return NextResponse.json({ ok: true });
}
