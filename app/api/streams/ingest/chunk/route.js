import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { relayChunk } from '@/lib/ingestRelay';

export const runtime = 'nodejs';

// One call per MediaRecorder chunk (~every 1s) — the client awaits each of
// these before sending the next, so chunks land on ffmpeg's stdin in order.
export async function POST(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub }, select: { id: true } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  const arrayBuffer = await req.arrayBuffer();
  const result = await relayChunk(church.id, Buffer.from(arrayBuffer));
  if (!result.ok) {
    return NextResponse.json({ error: 'No active broadcast session', code: 'NOT_STARTED' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
