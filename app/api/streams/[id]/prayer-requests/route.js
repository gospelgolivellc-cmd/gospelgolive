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
        { error: 'Prayer requests require the Congregation plan.', code: 'PLAN_UPGRADE_REQUIRED' },
        { status: 403 }
      ),
    };
  }
  return { stream, church: stream.church };
}

// The pastor (owner) sees every request, including private ones. Anyone
// else viewing the stream only sees the ones marked public.
export async function GET(req, { params }) {
  const { id } = await params;
  const { stream, church, error } = await loadStreamAndChurch(id);
  if (error) return error;

  const user = await getCurrentUser();
  const isOwner = user && user.role === 'pastor' && church.ownerId === user.sub;

  const requests = await prisma.prayerRequest.findMany({
    where: { streamId: stream.id, ...(isOwner ? {} : { isPublic: true }) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { seeker: { select: { fullName: true } } },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      message: r.message,
      isPublic: r.isPublic,
      seekerName: r.seeker?.fullName || 'Anonymous',
      createdAt: r.createdAt,
    })),
  });
}

const schema = z.object({
  message: z.string().min(1).max(500),
  isPublic: z.boolean().optional(),
});

export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;

  const { stream, error: gateError } = await loadStreamAndChurch(id);
  if (gateError) return gateError;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const request = await prisma.prayerRequest.create({
    data: {
      streamId: stream.id,
      seekerId: user.sub,
      message: input.message,
      isPublic: input.isPublic ?? true,
    },
  });

  return NextResponse.json({ id: request.id });
}
