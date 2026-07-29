import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { relayStart } from '@/lib/ingestRelay';
import { hasActiveAccess } from '@/lib/checkAccess';

export const runtime = 'nodejs';

// Starts the ffmpeg relay for a browser-based (no OBS) broadcast, targeting
// the exact same stream key/RTMP URL a pastor would otherwise paste into OBS
// — from Mux's point of view there's no difference between the two paths.
export async function POST(request) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const container = body.container === 'mp4' ? 'mp4' : 'webm';

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }
  if (!hasActiveAccess(church)) {
    return NextResponse.json(
      { error: 'Your account is paused due to a billing issue. Update your payment method to restore access.', code: 'ACCESS_SUSPENDED' },
      { status: 403 }
    );
  }

  const stream = await prisma.stream.findFirst({
    where: { churchId: church.id, muxLiveStreamId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (!stream) {
    return NextResponse.json({ error: 'Set up your stream details first' }, { status: 400 });
  }

  try {
    await relayStart(church.id, stream.rtmpUrl, stream.streamKey, container);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
