import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { moderateLiveStreamFrame } from '@/lib/moderation';

// Vercel Cron (see vercel.json) hits this on the tightest schedule Vercel
// Cron supports. Trust & Safety Protocol section B calls for checking every
// 10-30 seconds during a live broadcast — Vercel Cron's own minimum
// granularity is once a minute, so this is the closest this platform's
// hosting can get without standing up a separate always-on sampling
// process; each run still only takes one frame per currently-live stream.
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const liveStreams = await prisma.stream.findMany({
    where: { status: 'live', moderationStatus: 'clean' },
  });

  let terminated = 0;
  for (const stream of liveStreams) {
    try {
      const result = await moderateLiveStreamFrame(stream);
      if (result.terminated) terminated += 1;
    } catch (err) {
      console.error(`Live-stream moderation check failed for stream ${stream.id}`, err);
    }
  }

  return NextResponse.json({ ok: true, checked: liveStreams.length, terminated });
}
