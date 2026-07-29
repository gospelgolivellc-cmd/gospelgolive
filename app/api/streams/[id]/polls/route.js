import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser, getCurrentUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';

async function loadStreamAndChurch(streamId) {
  const stream = await prisma.stream.findUnique({ where: { id: streamId }, include: { church: true } });
  if (!stream) return { error: NextResponse.json({ error: 'Stream not found' }, { status: 404 }) };
  if (!planHasFeature(stream.church, 'polls_prayer_requests')) {
    return {
      error: NextResponse.json(
        { error: 'Polls require the Congregation plan.', code: 'PLAN_UPGRADE_REQUIRED' },
        { status: 403 }
      ),
    };
  }
  return { stream, church: stream.church };
}

// Anyone viewing the stream (signed in or not) can see the current active
// poll and live counts — this is a public live-stream widget, not a
// pastor-only view.
export async function GET(req, { params }) {
  const { id } = await params;
  const { stream, error } = await loadStreamAndChurch(id);
  if (error) return error;

  const poll = await prisma.streamPoll.findFirst({
    where: { streamId: stream.id, isActive: true },
    orderBy: { createdAt: 'desc' },
    include: { responses: true },
  });
  if (!poll) return NextResponse.json({ poll: null });

  const counts = {};
  poll.options.forEach((opt) => { counts[opt] = 0; });
  poll.responses.forEach((r) => { if (counts[r.selectedOption] !== undefined) counts[r.selectedOption] += 1; });

  const user = await getCurrentUser();
  const myResponse = user ? poll.responses.find((r) => r.seekerId === user.sub)?.selectedOption || null : null;

  return NextResponse.json({
    poll: { id: poll.id, question: poll.question, options: poll.options, counts, totalResponses: poll.responses.length, myResponse },
  });
}

const schema = z.object({
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(60)).min(2).max(6),
});

export async function POST(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;
  const { id } = await params;

  const { stream, church, error: gateError } = await loadStreamAndChurch(id);
  if (gateError) return gateError;
  if (church.ownerId !== user.sub) {
    return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
  }

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  // Only one poll live at a time per stream — closing any prior one keeps
  // the viewer-facing GET above simple (always "the" active poll).
  await prisma.$transaction([
    prisma.streamPoll.updateMany({ where: { streamId: stream.id, isActive: true }, data: { isActive: false } }),
    prisma.streamPoll.create({ data: { streamId: stream.id, question: input.question, options: input.options } }),
  ]);

  return NextResponse.json({ ok: true });
}
