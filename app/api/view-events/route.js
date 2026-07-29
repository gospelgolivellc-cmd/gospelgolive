import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getPlan } from '@/lib/plans';
import { extractClientIp, lookupIpLocation } from '@/lib/geo';
import { logCapHit } from '@/lib/behaviorEmails';
import { HEARTBEAT_GRACE_MS } from '@/lib/liveViewers';

const DEVICE_TYPES = new Set(['mobile', 'desktop', 'tv']);

// Records the start of a watch session for a sermon or livestream. Public —
// anonymous visitors on church.html can trigger this, same as the view is
// itself public. Callers follow up with PATCH /api/view-events/[id] as
// playback progresses.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { sermonId, streamId, deviceType } = body || {};

  if (!sermonId && !streamId) {
    return NextResponse.json({ error: 'sermonId or streamId is required' }, { status: 400 });
  }
  if (sermonId && streamId) {
    return NextResponse.json({ error: 'Provide only one of sermonId or streamId' }, { status: 400 });
  }

  if (sermonId) {
    const sermon = await prisma.sermon.findUnique({ where: { id: sermonId }, select: { id: true } });
    if (!sermon) return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });
  } else {
    // Streams (not sermons) carry a per-plan concurrent-viewer cap — check it
    // before admitting a new viewer. Existing viewers already admitted are
    // never kicked, even if the count is briefly over cap from a race.
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true, churchId: true, church: { select: { plan: true } } },
    });
    if (!stream) return NextResponse.json({ error: 'Stream not found' }, { status: 404 });

    const maxConcurrentViewers = getPlan(stream.church?.plan).maxConcurrentViewers;
    if (maxConcurrentViewers !== null) {
      const concurrentViewers = await prisma.viewEvent.count({
        where: { streamId, lastHeartbeatAt: { gte: new Date(Date.now() - HEARTBEAT_GRACE_MS) } },
      });
      if (concurrentViewers >= maxConcurrentViewers) {
        logCapHit(stream.churchId, 'viewer', stream.id).catch((err) => console.error('Failed to log viewer cap hit', err));
        return NextResponse.json(
          { error: 'This stream is at viewer capacity right now.', code: 'VIEWER_CAP_REACHED' },
          { status: 403 }
        );
      }
    }
  }

  const user = await getCurrentUser();
  // Prefer the signed-in seeker's own self-reported profile location (more
  // trustworthy than a guess) — only fall back to an IP lookup when they're
  // anonymous or never set one.
  let location = null;
  if (user?.sub) {
    const profile = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { city: true, state: true, country: true },
    });
    if (profile?.city || profile?.state || profile?.country) location = profile;
  }
  if (!location) location = lookupIpLocation(extractClientIp(req));

  const viewEvent = await prisma.viewEvent.create({
    data: {
      sermonId: sermonId || null,
      streamId: streamId || null,
      seekerId: user?.sub || null,
      watchSeconds: 0,
      deviceType: DEVICE_TYPES.has(deviceType) ? deviceType : 'desktop',
      city: location.city,
      region: location.state,
      country: location.country,
    },
  });

  return NextResponse.json({ id: viewEvent.id });
}
