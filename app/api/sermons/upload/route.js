import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { mux } from '@/lib/mux';
import { requireUser } from '@/lib/auth';
import { getPlan } from '@/lib/plans';
import { trackEvent } from '@/lib/posthogServer';
import { hasActiveAccess } from '@/lib/checkAccess';
import { logCapHit } from '@/lib/behaviorEmails';

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  series: z.string().optional(),
});

// Creates a Mux direct-upload URL and a pending Sermon row. The client PUTs
// the raw video file straight to the returned URL (browser → Mux, no server
// bandwidth used) — this route only sets up the destination.
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

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const plan = getPlan(church.plan);

  if (plan.storageHoursCap !== null) {
    // Include hidden sermons — storage is consumed on Mux regardless of
    // public visibility. A still-processing sermon has no durationSeconds
    // yet, so it contributes 0 here; that's an accepted gap (we can't know
    // a video's length before Mux finishes processing it either way).
    const usage = await prisma.sermon.aggregate({
      where: { churchId: church.id },
      _sum: { durationSeconds: true },
    });
    const usedSeconds = usage._sum.durationSeconds ?? 0;
    if (usedSeconds >= plan.storageHoursCap * 3600) {
      logCapHit(church.id, 'storage').catch((err) => console.error('Failed to log storage cap hit', err));
      return NextResponse.json(
        {
          error: `Your plan's ${plan.storageHoursCap}-hour storage limit has been reached. Upgrade to upload more.`,
          code: 'STORAGE_CAP_REACHED',
        },
        { status: 403 }
      );
    }
  }

  try {
    const upload = await mux.video.uploads.create({
      cors_origin: process.env.NEXT_PUBLIC_APP_URL,
      new_asset_settings: { playback_policy: ['public'], max_resolution_tier: plan.maxResolutionTier },
    });

    const sermon = await prisma.sermon.create({
      data: {
        churchId: church.id,
        title: input.title,
        description: input.description || null,
        category: input.category || null,
        series: input.series || null,
        muxUploadId: upload.id,
        status: 'processing',
        moderationStatus: 'pending_review',
      },
    });

    trackEvent(user.sub, 'sermon_upload_started', { churchId: church.id, sermonId: sermon.id }).catch((err) =>
      console.error('Failed to track sermon upload event', err)
    );

    return NextResponse.json({ uploadUrl: upload.url, sermonId: sermon.id });
  } catch (err) {
    console.error('Mux direct upload creation failed', err);
    return NextResponse.json({ error: 'Failed to start upload' }, { status: 500 });
  }
}
