import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mux, syncLiveStreamStatus } from '@/lib/mux';
import { requireUser } from '@/lib/auth';
import { getLikeState } from '@/lib/interactions';
import { getPlan, planHasFeature } from '@/lib/plans';
import { hasActiveAccess } from '@/lib/checkAccess';
import { notifyStreamScheduled } from '@/lib/notifications';
import { getLiveViewerCount } from '@/lib/liveViewers';

// All Mux RTMP ingest goes to this fixed endpoint — only the per-stream
// stream_key varies, unlike Stripe/Resend there's no per-account host here.
const MUX_RTMP_URL = 'rtmp://global-live.mux.com:5222/app';

// Idempotently provisions (or returns) the pastor's church's persistent live
// stream. A church has exactly one reusable RTMP destination — the pastor
// configures it once in their broadcast software (OBS etc.) and it's the
// software connecting to that URL that actually starts the broadcast, not
// this route. This just ensures the Mux resource + DB row exist and returns
// the connection details for display.
export async function POST(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

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

  let body = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine — title/description are optional on re-provision
  }

  const existing = await prisma.stream.findFirst({
    where: { churchId: church.id, muxLiveStreamId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    // Ministry+ stream scheduling / Congregation green-room countdown. Both
    // are `undefined`-checked (not falsy-checked) so a client can explicitly
    // clear either one by sending `null` — see handleClearSchedule() in the
    // dashboard UI.
    const scheduleUpdate = {};
    if (body.title !== undefined) scheduleUpdate.title = body.title || existing.title;
    if (body.description !== undefined) scheduleUpdate.description = body.description ?? existing.description;
    if (body.scheduledAt !== undefined && planHasFeature(church, 'stream_scheduling')) {
      scheduleUpdate.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }
    if (body.countdownMessage !== undefined && planHasFeature(church, 'green_room')) {
      scheduleUpdate.countdownMessage = body.countdownMessage || null;
    }
    // Only fan out to followers when this is a genuinely new/changed future
    // time, not every re-provision call that resends the same scheduledAt
    // (this route is hit on page load/status sync, not just real edits).
    const isNewFutureSchedule =
      'scheduledAt' in scheduleUpdate &&
      scheduleUpdate.scheduledAt &&
      scheduleUpdate.scheduledAt.getTime() !== existing.scheduledAt?.getTime() &&
      scheduleUpdate.scheduledAt.getTime() > Date.now();

    if (Object.keys(scheduleUpdate).length > 0) {
      await prisma.stream.update({ where: { id: existing.id }, data: scheduleUpdate });
      if (isNewFutureSchedule) {
        await notifyStreamScheduled(
          { title: scheduleUpdate.title || existing.title, scheduledAt: scheduleUpdate.scheduledAt },
          church
        );
      }
    }

    const synced = await syncLiveStreamStatus(existing);
    const [counts, likeState, viewerCount] = await Promise.all([
      prisma.stream.findUnique({
        where: { id: synced.id },
        select: {
          shareCount: true,
          scheduledAt: true,
          countdownMessage: true,
          _count: { select: { likes: true, comments: true } },
        },
      }),
      getLikeState(user.sub, { streamId: synced.id }),
      // Only meaningful while actually live, but cheap enough to always
      // compute — the Go Live monitor's immersive mobile view surfaces this
      // as a real-time viewer count alongside hearts.
      getLiveViewerCount(synced.id),
    ]);

    return NextResponse.json({
      id: synced.id,
      streamKey: synced.streamKey,
      rtmpUrl: synced.rtmpUrl,
      playbackId: synced.playbackId,
      status: synced.status,
      scheduledAt: counts.scheduledAt,
      countdownMessage: counts.countdownMessage,
      likeCount: counts._count.likes,
      commentCount: counts._count.comments,
      shareCount: counts.shareCount,
      isLiked: likeState.isLiked,
      viewerCount,
    });
  }

  try {
    const liveStream = await mux.video.liveStreams.create({
      playback_policy: ['public'],
      // Explicit rather than relying on the account default — capped by the
      // church's plan (Mux's own floor tier is 1080p; the Free plan's 720p
      // cap is enforced separately at the player level, since Mux doesn't
      // offer a 720p asset tier — see lib/plans.js).
      new_asset_settings: { playback_policy: ['public'], max_resolution_tier: getPlan(church.plan).maxResolutionTier },
    });

    const stream = await prisma.stream.create({
      data: {
        churchId: church.id,
        title: body.title || 'Live Service',
        description: body.description || null,
        streamKey: liveStream.stream_key,
        rtmpUrl: MUX_RTMP_URL,
        playbackId: liveStream.playback_ids?.[0]?.id || null,
        muxLiveStreamId: liveStream.id,
        status: 'idle',
      },
    });

    return NextResponse.json({
      id: stream.id,
      streamKey: stream.streamKey,
      rtmpUrl: stream.rtmpUrl,
      playbackId: stream.playbackId,
      status: stream.status,
      scheduledAt: null,
      countdownMessage: null,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      isLiked: false,
      viewerCount: 0,
    });
  } catch (err) {
    console.error('Mux live stream provisioning failed', err);
    return NextResponse.json({ error: 'Failed to provision live stream' }, { status: 500 });
  }
}
