import { NextResponse } from 'next/server';
import { mux } from '@/lib/mux';
import { prisma } from '@/lib/prisma';
import { notifySermonReady, notifyStreamLive } from '@/lib/notifications';
import { moderateSermon } from '@/lib/moderation';

export async function POST(req) {
  const body = await req.text();

  let event;
  try {
    event = mux.webhooks.unwrap(body, req.headers);
  } catch (err) {
    console.error('Mux webhook signature verification failed', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'video.upload.asset_created':
        await handleUploadAssetCreated(event.data);
        break;
      case 'video.asset.ready':
        await handleAssetReady(event.data);
        break;
      case 'video.live_stream.active':
        await handleLiveStreamActive(event.data);
        break;
      case 'video.live_stream.idle':
      case 'video.live_stream.disconnected':
        await handleLiveStreamEnded(event.data);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Failed to handle Mux event ${event.type}`, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Direct upload finished ingesting and Mux created an asset for it — link
// the asset id back onto the Sermon row so the next event (asset.ready)
// knows which row to update.
async function handleUploadAssetCreated(upload) {
  if (!upload.asset_id) return;
  await prisma.sermon.updateMany({
    where: { muxUploadId: upload.id },
    data: { videoProviderAssetId: upload.asset_id },
  });
}

// Fires both for direct-upload assets and for recordings automatically
// created from a live stream — distinguished by whether live_stream_id is set.
async function handleAssetReady(asset) {
  const playbackId = asset.playback_ids?.[0]?.id || null;
  const durationSeconds = asset.duration ? Math.round(asset.duration) : null;

  if (asset.live_stream_id) {
    const stream = await prisma.stream.findUnique({ where: { muxLiveStreamId: asset.live_stream_id } });
    if (!stream) return;

    const existingSermon = await prisma.sermon.findUnique({ where: { videoProviderAssetId: asset.id } });
    const wasAlreadyReady = existingSermon?.status === 'ready';

    const sermon = await prisma.sermon.upsert({
      where: { videoProviderAssetId: asset.id },
      update: { status: 'ready', playbackId, durationSeconds },
      create: {
        churchId: stream.churchId,
        title: stream.title,
        description: stream.description,
        videoProviderAssetId: asset.id,
        playbackId,
        durationSeconds,
        status: 'ready',
        moderationStatus: 'pending_review',
        publishedAt: new Date(),
      },
    });

    await prisma.stream.update({ where: { id: stream.id }, data: { recordedSermonId: sermon.id } });
    if (!wasAlreadyReady) {
      // Scanned again here even though the live broadcast itself was already
      // frame-sampled (see app/api/cron/moderate-live-streams) — that
      // sampling is sparse/periodic, while this recording becomes a
      // permanent, repeatedly-served VOD asset that deserves its own
      // pre-publish check per the Trust & Safety protocol.
      const { publishable } = await moderateSermon(sermon);
      if (publishable) {
        notifySermonReady(sermon).catch((e) => console.error('Failed to notify followers of new sermon', e));
      }
    }
    return;
  }

  const previouslyUnready = await prisma.sermon.findMany({
    where: { videoProviderAssetId: asset.id, status: { not: 'ready' } },
  });
  await prisma.sermon.updateMany({
    where: { videoProviderAssetId: asset.id },
    data: { status: 'ready', playbackId, durationSeconds, publishedAt: new Date() },
  });
  for (const sermon of previouslyUnready) {
    const updatedSermon = { ...sermon, playbackId, durationSeconds };
    const { publishable } = await moderateSermon(updatedSermon);
    if (publishable) {
      notifySermonReady(updatedSermon).catch((e) => console.error('Failed to notify followers of new sermon', e));
    }
  }
}

async function handleLiveStreamActive(liveStream) {
  const stream = await prisma.stream.findUnique({ where: { muxLiveStreamId: liveStream.id } });
  if (!stream) return;
  const wasLive = stream.status === 'live';

  const updated = await prisma.stream.update({
    where: { id: stream.id },
    data: { status: 'live', startedAt: new Date() },
  });
  if (!wasLive) {
    notifyStreamLive(updated).catch((e) => console.error('Failed to notify followers of live stream', e));
  }
}

async function handleLiveStreamEnded(liveStream) {
  await prisma.stream.updateMany({
    where: { muxLiveStreamId: liveStream.id },
    data: { status: 'ended', endedAt: new Date() },
  });
}
