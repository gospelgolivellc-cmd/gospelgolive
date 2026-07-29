import { NextResponse } from 'next/server';
import { runDailyDmcaRestoreSweep } from '@/lib/dmca';

// Vercel Cron (see vercel.json), once daily. Restores content whose
// counter-notice window (DMCA Copyright Policy section 3 — 10 to 14
// business days) has elapsed without the original claimant notifying us of
// a lawsuit.
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runDailyDmcaRestoreSweep();
  return NextResponse.json({ ok: true, ...result });
}
