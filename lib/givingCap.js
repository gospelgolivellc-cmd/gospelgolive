import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { getPlan } from '@/lib/plans';

export function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export async function getMonthlyGivingTotalCents(churchId) {
  const agg = await prisma.donation.aggregate({
    where: { churchId, createdAt: { gte: startOfMonth() } },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

// Resumes any recurring gift this church had auto-paused for hitting a
// PRIOR month's giving cap. There's no cron/scheduler in this app, so this
// is called lazily from every place a church's giving state gets read (the
// public church profile, the pastor's own dashboard, and right before a new
// gift/subscription request is evaluated) — whichever of those happens
// first after the calendar flips resets things for real. Never touches a
// subscription the giver paused themselves (pausedForCapAt stays null for
// those).
export async function resumeStaleCapPauses(churchId) {
  const paused = await prisma.givingSubscription.findMany({
    where: { churchId, status: 'paused', pausedForCapAt: { not: null, lt: startOfMonth() } },
  });
  for (const sub of paused) {
    try {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { pause_collection: '' });
      await prisma.givingSubscription.update({
        where: { id: sub.id },
        data: { status: 'active', pausedForCapAt: null },
      });
    } catch (err) {
      console.error('Failed to auto-resume cap-paused recurring gift', sub.id, err);
    }
  }
}

// Called right after a gift (one-time or recurring) is actually recorded.
// If the church's running total for the month has now reached its plan's
// cap, every OTHER active recurring gift is paused in Stripe so no further
// money moves until the cap resets next month — the gift that just pushed
// the total over the line is left alone, since it already went through
// before this check ever runs.
export async function pauseSubscriptionsIfCapReached(churchId) {
  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { plan: true } });
  if (!church) return;

  const plan = getPlan(church.plan);
  if (plan.monthlyGivingCapCents === null) return;

  const total = await getMonthlyGivingTotalCents(churchId);
  if (total < plan.monthlyGivingCapCents) return;

  const active = await prisma.givingSubscription.findMany({ where: { churchId, status: 'active' } });
  for (const sub of active) {
    try {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { pause_collection: { behavior: 'void' } });
      await prisma.givingSubscription.update({
        where: { id: sub.id },
        data: { status: 'paused', pausedForCapAt: new Date() },
      });
    } catch (err) {
      console.error('Failed to auto-pause recurring gift at giving cap', sub.id, err);
    }
  }
}
