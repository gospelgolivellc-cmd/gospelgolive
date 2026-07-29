import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';
import { mux } from '@/lib/mux';

// Congregation-only. Targets are keyed to the church's one persistent
// stream (the same reusable Mux resource go-live uses — see
// app/api/streams/provision/route.js), since there's only ever one stream
// per church in this app's model.
async function loadGatedStream(user) {
  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) return { error: NextResponse.json({ error: 'No church found for this account' }, { status: 404 }) };
  if (!planHasFeature(church, 'simulcast')) {
    return {
      error: NextResponse.json(
        { error: 'Simulcasting requires the Congregation plan.', code: 'PLAN_UPGRADE_REQUIRED' },
        { status: 403 }
      ),
    };
  }
  const stream = await prisma.stream.findFirst({
    where: { churchId: church.id, muxLiveStreamId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (!stream) return { error: NextResponse.json({ error: 'Go live once first to provision your stream.' }, { status: 400 }) };
  return { church, stream };
}

export async function GET() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { stream, error: gateError } = await loadGatedStream(user);
  if (gateError) return gateError;

  const targets = await prisma.simulcastTarget.findMany({ where: { streamId: stream.id } });
  return NextResponse.json({
    targets: targets.map((t) => ({ platform: t.platform, rtmpUrl: t.rtmpUrl, streamKey: t.streamKey })),
  });
}

const schema = z.object({
  platform: z.enum(['youtube', 'facebook']),
  rtmpUrl: z.string().min(1),
  streamKey: z.string().min(1),
});

// Note: registering this target with Mux's Simulcast Targets API at go-live
// time requires a Mux plan with that add-on enabled — this route only
// stores the pastor's credentials. See lib/mux.js for where a real
// mux.video.liveStreams.simulcastTargets.create() call would be wired in
// once that add-on is active on this Mux account.
export async function PUT(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { stream, error: gateError } = await loadGatedStream(user);
  if (gateError) return gateError;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const existing = await prisma.simulcastTarget.findUnique({
    where: { streamId_platform: { streamId: stream.id, platform: input.platform } },
  });

  // Registering with Mux is best-effort: it requires the Simulcast Targets
  // add-on on this account's Mux plan, and Mux only allows adding a target
  // while the parent live stream is idle. Either failure still leaves the
  // pastor's credentials saved in our DB — the target just won't be live on
  // Mux's side until the add-on is active / the pastor isn't mid-broadcast.
  let muxSimulcastTargetId = existing?.muxSimulcastTargetId || null;
  let muxWarning = null;
  try {
    if (existing?.muxSimulcastTargetId) {
      await mux.video.liveStreams.deleteSimulcastTarget(stream.muxLiveStreamId, existing.muxSimulcastTargetId).catch(() => {});
    }
    const target = await mux.video.liveStreams.createSimulcastTarget(stream.muxLiveStreamId, {
      url: input.rtmpUrl,
      stream_key: input.streamKey,
    });
    muxSimulcastTargetId = target.id;
  } catch (err) {
    console.error('Mux simulcast target registration failed (credentials still saved)', err.message);
    muxSimulcastTargetId = null;
    muxWarning =
      'Saved your credentials, but could not register this with Mux yet — this usually means the Simulcast Targets add-on isn\'t enabled on this Mux account, or you\'re currently live (targets can only be added while idle).';
  }

  await prisma.simulcastTarget.upsert({
    where: { streamId_platform: { streamId: stream.id, platform: input.platform } },
    create: { streamId: stream.id, platform: input.platform, rtmpUrl: input.rtmpUrl, streamKey: input.streamKey, muxSimulcastTargetId },
    update: { rtmpUrl: input.rtmpUrl, streamKey: input.streamKey, muxSimulcastTargetId },
  });

  return NextResponse.json({ ok: true, warning: muxWarning });
}

export async function DELETE(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { stream, error: gateError } = await loadGatedStream(user);
  if (gateError) return gateError;

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');
  if (platform !== 'youtube' && platform !== 'facebook') {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const existing = await prisma.simulcastTarget.findUnique({
    where: { streamId_platform: { streamId: stream.id, platform } },
  });
  if (existing?.muxSimulcastTargetId) {
    await mux.video.liveStreams.deleteSimulcastTarget(stream.muxLiveStreamId, existing.muxSimulcastTargetId).catch(() => {});
  }

  await prisma.simulcastTarget.deleteMany({ where: { streamId: stream.id, platform } });
  return NextResponse.json({ ok: true });
}
