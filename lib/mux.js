import Mux from '@mux/mux-node';
import { prisma } from '@/lib/prisma';
import { notifySermonReady, notifyStreamLive } from '@/lib/notifications';
import { moderateSermon } from '@/lib/moderation';

export const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

// Webhooks can't reach this app when it's running on localhost (no public
// URL for Mux to call), which leaves sermons stuck on "processing" forever
// during local testing. As a fallback, poll Mux directly for any sermon
// still marked "processing" whenever the dashboard loads.
export async function syncProcessingSermons(churchId) {
  const pending = await prisma.sermon.findMany({ where: { churchId, status: 'processing' } });
  if (pending.length === 0) return;

  await Promise.all(
    pending.map(async (sermon) => {
      try {
        let assetId = sermon.videoProviderAssetId;
        if (!assetId && sermon.muxUploadId) {
          const upload = await mux.video.uploads.retrieve(sermon.muxUploadId);
          assetId = upload.asset_id || null;
          if (assetId) {
            await prisma.sermon.update({ where: { id: sermon.id }, data: { videoProviderAssetId: assetId } });
          }
        }
        if (!assetId) return;

        const asset = await mux.video.assets.retrieve(assetId);
        if (asset.status === 'ready') {
          const playbackId = asset.playback_ids?.[0]?.id || null;
          const durationSeconds = asset.duration ? Math.round(asset.duration) : null;
          await prisma.sermon.update({
            where: { id: sermon.id },
            data: { status: 'ready', playbackId, durationSeconds, publishedAt: new Date() },
          });
          // `pending` was fetched as status:'processing', so reaching here is
          // always a genuine transition — safe to notify (once the
          // moderation scan clears it) unconditionally.
          const updatedSermon = { ...sermon, playbackId, durationSeconds };
          const { publishable } = await moderateSermon(updatedSermon);
          if (publishable) {
            notifySermonReady(updatedSermon).catch((e) => console.error('Failed to notify followers of new sermon', e));
          }
        } else if (asset.status === 'errored') {
          await prisma.sermon.update({ where: { id: sermon.id }, data: { status: 'failed' } });
        }
      } catch (err) {
        console.error('Mux status sync failed for sermon', sermon.id, err.message);
      }
    })
  );
}

// Same localhost-webhook problem as above, but for the "video.live_stream.active"
// / "video.live_stream.idle" events that normally flip a Stream between idle,
// live, and ended — poll Mux's live stream directly instead of waiting on a
// webhook that can never arrive during local testing.
export async function syncLiveStreamStatus(stream) {
  if (!stream.muxLiveStreamId) return stream;

  try {
    const liveStream = await mux.video.liveStreams.retrieve(stream.muxLiveStreamId);

    if (liveStream.status === 'active' && stream.status !== 'live') {
      const updated = await prisma.stream.update({
        where: { id: stream.id },
        // Clears the schedule/countdown once the event has actually
        // started — an "Upcoming" or green-room countdown for a stream
        // that's already live would be stale/confusing.
        data: { status: 'live', startedAt: new Date(), endedAt: null, scheduledAt: null, countdownMessage: null },
      });
      notifyStreamLive(updated).catch((e) => console.error('Failed to notify followers of live stream', e));
      return updated;
    }

    if (liveStream.status !== 'active' && stream.status === 'live') {
      return await prisma.stream.update({
        where: { id: stream.id },
        data: { status: 'ended', endedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('Mux live status sync failed for stream', stream.id, err.message);
  }

  return stream;
}
