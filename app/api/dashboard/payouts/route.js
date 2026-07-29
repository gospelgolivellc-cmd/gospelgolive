import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireUser } from '@/lib/auth';

function sumAmounts(entries) {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

// Every pastor's own net-earnings-by-year, for their personal tax records —
// distinct from the Congregation-only donor-facing tax report
// (/api/dashboard/analytics/export/donor-report), which is about what a
// *giver* can deduct. This is what the pastor themselves actually received.
// Independent of plan tier and of whether Stripe is connected (a church can
// have historical donation rows even if payouts are currently unavailable).
async function earningsByYear(churchId) {
  const donations = await prisma.donation.findMany({
    where: { churchId },
    select: { netCents: true, reversedCents: true, createdAt: true },
  });
  const totals = new Map();
  for (const d of donations) {
    const year = d.createdAt.getUTCFullYear();
    const net = d.netCents - d.reversedCents;
    totals.set(year, (totals.get(year) || 0) + net);
  }
  return [...totals.entries()]
    .map(([year, netCents]) => ({ year, netCents }))
    .sort((a, b) => b.year - a.year);
}

// Balance & payout history for the pastor's own dashboard — deliberately
// never sends the pastor to Stripe's own Express Dashboard (no login link
// exists anywhere in this app). Everything here is read server-side with
// the platform's own secret key acting on behalf of the connected account
// (the `stripeAccount` option), then rendered in our own branded UI.
export async function GET() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  const earnings = await earningsByYear(church.id);

  if (!church.stripeAccountId || !church.stripeOnboarded) {
    return NextResponse.json({ connected: false, earnings });
  }

  const [balance, payouts, account] = await Promise.all([
    stripe.balance.retrieve({ stripeAccount: church.stripeAccountId }),
    stripe.payouts.list({ limit: 10 }, { stripeAccount: church.stripeAccountId }),
    stripe.accounts.retrieve(church.stripeAccountId),
  ]);

  return NextResponse.json({
    connected: true,
    availableCents: sumAmounts(balance.available),
    pendingCents: sumAmounts(balance.pending),
    payoutScheduleInterval: account.settings?.payouts?.schedule?.interval || 'daily',
    payoutDelayDays: account.settings?.payouts?.schedule?.delay_days ?? null,
    payouts: payouts.data.map((p) => ({
      id: p.id,
      amountCents: p.amount,
      arrivalDate: p.arrival_date * 1000,
      status: p.status,
    })),
    earnings,
  });
}
