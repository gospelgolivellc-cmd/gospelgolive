import { NextResponse } from 'next/server';
import { runDailyFraudSweep } from '@/lib/detectSuspiciousGiving';

// Vercel Cron (see vercel.json), once daily. Complements the per-transaction
// check in app/api/webhooks/stripe/route.js — some patterns (volume spikes,
// a donor's spread across churches) only become visible looking at several
// days of activity at once, which a single donation's own webhook can miss.
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runDailyFraudSweep();
  return NextResponse.json({ ok: true, ...result });
}
