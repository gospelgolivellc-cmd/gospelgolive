import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser, getCurrentUser } from '@/lib/auth';
import { listComments, createComment } from '@/lib/interactions';

const schema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function GET(req, { params }) {
  const { id } = await params;
  const stream = await prisma.stream.findUnique({ where: { id }, select: { id: true, churchId: true, startedAt: true } });
  if (!stream) return NextResponse.json({ error: 'Stream not found' }, { status: 404 });

  const viewer = await getCurrentUser();
  const [comments, giftRows] = await Promise.all([
    listComments({ streamId: id }, viewer?.sub),
    stream.startedAt
      ? prisma.donation.findMany({
          where: { churchId: stream.churchId, createdAt: { gte: stream.startedAt } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, createdAt: true, giver: { select: { fullName: true } } },
        })
      : [],
  ]);

  // First-name only, and no amount — this list is broadcast to every viewer
  // in the live chat as a celebration, not a private giving ledger.
  const gifts = giftRows.map((g) => ({
    id: g.id,
    giverName: (g.giver?.fullName || 'Someone').split(' ')[0],
    createdAt: g.createdAt,
  }));

  return NextResponse.json({ comments, gifts });
}

export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const stream = await prisma.stream.findUnique({ where: { id }, select: { id: true } });
  if (!stream) return NextResponse.json({ error: 'Stream not found' }, { status: 404 });

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const comment = await createComment(user.sub, { streamId: id }, input.body);
  return NextResponse.json({ comment });
}
